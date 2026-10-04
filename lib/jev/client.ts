/**
 * Server-only client for TypeSafe System One (`POST /v1/systemone`).
 *
 * The only place `TYPESAFE_API_KEY` is read (constitution VI). The environment is passed in, so
 * the route supplies `process.env` and tests supply a stub. The key is never put in an error
 * message or a log line.
 *
 * Transport policy (research R10, mirroring the prototype's `api.py`): Bearer auth, a 30 s
 * timeout per attempt, and one retry of the same request on 408/429/5xx/529 or a timeout,
 * honouring `Retry-After` up to 5 s.
 */
import { type SystemOneRequest, type SystemOneResponse, SystemOneResponseSchema } from "./types";

export const DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_MODEL = "jev-latest";
export const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 400;
const MAX_RETRY_DELAY_MS = 5_000;

export type JevErrorKind = "config" | "upstream" | "timeout";

/** Thrown by `callJev`. The route maps `kind` to 500 / 502 / 504 (contracts/decide-api.md). */
export class JevError extends Error {
  readonly kind: JevErrorKind;
  readonly status?: number;

  constructor(kind: JevErrorKind, message: string, status?: number) {
    super(message);
    this.name = "JevError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

/**
 * The environment variables the client reads. `process.env` satisfies it: the index signature stops
 * TypeScript treating this all-optional type as a "weak type" that rejects ProcessEnv (TS2559).
 */
export interface JevEnv {
  readonly [name: string]: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
  readonly TYPESAFE_BASE_URL?: string | undefined;
  readonly JEV_MODEL?: string | undefined;
}

export interface CallJevDeps {
  readonly fetch?: typeof globalThis.fetch;
  readonly env: JevEnv;
}

export interface JevResult {
  readonly response: SystemOneResponse;
  /** Wall time of the whole call, retries included. */
  readonly latencyMs: number;
}

/** The request without `model`: the model always comes from `JEV_MODEL`. */
export type JevRequest = Omit<SystemOneRequest, "model">;

/** The model a request is sent with: `JEV_MODEL`, or `jev-latest` when unset or blank. */
export function resolveModel(env: JevEnv): string {
  return env.JEV_MODEL?.trim() || DEFAULT_MODEL;
}

const isRetryableStatus =(status: number) => status === 408 || status === 429 || status >= 500;

/** `AbortSignal.timeout` rejects fetch (and body reads) with a DOMException named "TimeoutError". */
const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `Retry-After` as delta-seconds or an HTTP date, capped at 5 s; 400 ms when absent or unreadable. */
function retryDelayMs(retryAfter: string | null): number {
  if (retryAfter === null) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(retryAfter);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
  if (Number.isNaN(ms)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(Math.max(ms, 0), MAX_RETRY_DELAY_MS);
}

function fail(error: JevError, cause?: unknown): never {
  const status = error.status === undefined ? "" : ` status=${error.status}`;
  const detail = cause instanceof Error ? ` cause=${cause.name}: ${cause.message}` : "";
  console.error(`jev error kind=${error.kind}${status} message=${error.message}${detail}`);
  throw error;
}

type Attempt =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "http-error"; readonly status: number; readonly retryAfter: string | null }
  | { readonly kind: "timeout" };

/** One POST. The body is read inside the same timeout as the request. */
async function attempt(fetchImpl: typeof globalThis.fetch, url: string, init: RequestInit): Promise<Attempt> {
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { kind: "http-error", status: res.status, retryAfter: res.headers.get("retry-after") };
    return { kind: "ok", text: await res.text() };
  } catch (e) {
    if (isTimeout(e)) return { kind: "timeout" };
    return fail(new JevError("upstream", "Could not reach Jev (network error)."), e);
  }
}

function parseResponse(text: string): SystemOneResponse {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return fail(new JevError("upstream", "Jev returned a response that is not JSON."), e);
  }
  const parsed = SystemOneResponseSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? ` (${issue.path.join(".") || "body"}: ${issue.message})` : "";
    return fail(new JevError("upstream", `Jev returned a response in an unexpected shape${where}.`));
  }
  return parsed.data;
}

/**
 * Sends one System One request. Throws `JevError`: `config` when the key is missing (before any
 * fetch), `upstream` for a non-2xx after the retry, a network failure or a body that fails zod,
 * and `timeout` when the 30 s abort fires on the final attempt.
 */
export async function callJev(req: JevRequest, { fetch: fetchImpl = globalThis.fetch, env }: CallJevDeps): Promise<JevResult> {
  const key = env.TYPESAFE_API_KEY?.trim();
  if (!key) return fail(new JevError("config", "TYPESAFE_API_KEY is not set. Add it to .env.local and restart the server."));

  const baseUrl = (env.TYPESAFE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = resolveModel(env);
  const url = `${baseUrl}/v1/systemone`;
  const init: RequestInit = {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...req, model }),
  };

  const started = performance.now();
  for (let n = 1; ; n++) {
    const result = await attempt(fetchImpl, url, init);
    const final = n >= MAX_ATTEMPTS;
    switch (result.kind) {
      case "ok":
        return { response: parseResponse(result.text), latencyMs: Math.round(performance.now() - started) };
      case "timeout":
        if (final) return fail(new JevError("timeout", `Jev did not answer within ${TIMEOUT_MS / 1000} s.`));
        console.warn(`jev retry reason=timeout attempt=${n}`);
        break;
      case "http-error": {
        if (final || !isRetryableStatus(result.status)) {
          return fail(new JevError("upstream", `Jev returned HTTP ${result.status}.`, result.status));
        }
        const delay = retryDelayMs(result.retryAfter);
        console.warn(`jev retry reason=status status=${result.status} attempt=${n} delayMs=${delay}`);
        await sleep(delay);
        break;
      }
      default: {
        const unreachable: never = result;
        return unreachable;
      }
    }
  }
}
