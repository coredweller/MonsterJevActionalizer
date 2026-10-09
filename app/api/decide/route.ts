/**
 * POST /api/decide (contracts/decide-api.md): the only server route. It exists so the Jev key stays
 * on the server; `callJev` reads it from the environment passed in, and this file never names it.
 *
 * Validate the body → recompute the legal options (client options are never trusted) → hard-blocked:
 * answer without calling Jev → otherwise one Jev request → interpret → one log line.
 */
import { interpret, blockedRecommendation } from "@/lib/decide/interpret";
import { buildJevRequest } from "@/lib/decide/questions";
import { DecideRequestSchema, type DecideErrorKind, type DecideResponse } from "@/lib/decide/types";
import { callJev, JevError, type JevErrorKind } from "@/lib/jev/client";
import { errorText, log } from "@/lib/log";
import { buildLegalOptions } from "@/lib/monster/options";

const STATUS: Record<JevErrorKind, number> = { config: 500, upstream: 502, timeout: 504 };

const reply = (body: DecideResponse, status = 200) => Response.json(body, { status });
const failure = (kind: DecideErrorKind, message: string, status: number) => reply({ ok: false, error: { kind, message } }, status);

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch (e) {
    log.warn("decide.invalid-request", { reason: "body-not-json", cause: errorText(e) });
    return failure("invalid-request", "The request body is not valid JSON.", 400);
  }

  const parsed = DecideRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    log.warn("decide.invalid-request", { reason: "schema", issues: parsed.error.issues.length });
    return failure("invalid-request", `Invalid request: ${issues}`, 400);
  }

  const { tracker, situation } = parsed.data;
  const options = buildLegalOptions(tracker.reviewed, tracker.state, situation, tracker.settings.temperament);
  if (options.blocked) {
    return reply({ ok: true, recommendation: blockedRecommendation(options.blocked), options, meta: { jevCalled: false } });
  }

  const { request: jevRequest, candidates } = buildJevRequest(tracker, situation, options);
  try {
    const { response, latencyMs } = await callJev(jevRequest, { env: process.env });
    // Exactly one line per Jev call (T075 counts them). Never the state or the key.
    log.info("jev", {
      model: response.model,
      latencyMs,
      usage: JSON.stringify(response.usage ?? {}),
      questions: Object.keys(jevRequest.questions).length,
    });
    const recommendation = interpret(response, options, candidates, tracker, situation);
    const meta = { model: response.model, latencyMs, ...(response.usage ? { usage: response.usage } : {}) };
    return reply({ ok: true, recommendation, options, meta });
  } catch (e) {
    // callJev has already logged the JevError's details; the client gets only its kind and message.
    if (e instanceof JevError) return failure(e.kind, e.message, STATUS[e.kind]);
    log.error("decide.failed", { cause: errorText(e) });
    throw e;
  }
}
