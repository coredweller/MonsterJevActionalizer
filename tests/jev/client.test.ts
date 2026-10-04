import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callJev, JevError, type JevEnv, resolveModel } from "@/lib/jev/client";
import type { SystemOneRequest, SystemOneResponse } from "@/lib/jev/types";

const KEY = "sk-test-SECRET-1234567890";
const ENV: JevEnv = { TYPESAFE_API_KEY: KEY };

const REQUEST: Omit<SystemOneRequest, "model"> = {
  state: { monster: "Tunnel Wasp" },
  questions: {
    action: { type: "choice", instructions: "Pick an action.", criteria: { sting: "Sting", dash: "Dash" } },
    should_retreat: { type: "noul", instructions: "Break off now?" },
  },
};

const GOOD: SystemOneResponse = {
  model: "jev-latest",
  answers: {
    action: { type: "choice", choice: "sting", probabilities: { sting: 0.8, dash: 0.2 }, confidence: 0.8 },
    should_retreat: { type: "noul", noul: 0.1 },
  },
  usage: { input_tokens: 120, output_tokens: 4 },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

type Settled = { ok: true; value: Awaited<ReturnType<typeof callJev>> } | { ok: false; error: unknown };

/** Runs the call to completion, flushing the retry delay on the fake clock. */
async function settle(promise: ReturnType<typeof callJev>): Promise<Settled> {
  const settled = promise.then(
    (value): Settled => ({ ok: true, value }),
    (error: unknown): Settled => ({ ok: false, error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

async function expectJevError(promise: ReturnType<typeof callJev>): Promise<JevError> {
  const result = await settle(promise);
  if (result.ok) throw new Error("expected callJev to throw");
  expect(result.error).toBeInstanceOf(JevError);
  if (!(result.error instanceof JevError)) throw new Error("not a JevError");
  expect(result.error.message).not.toContain(KEY);
  return result.error;
}

let fetchStub: ReturnType<typeof vi.fn<typeof fetch>>;
let logged: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchStub = vi.fn<typeof fetch>();
  logged = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "info").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  // The key must never reach a log line either.
  for (const spy of logged) expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const initOf = (call: number): RequestInit => {
  const init = fetchStub.mock.calls[call]?.[1];
  if (!init) throw new Error(`fetch call ${call} had no init`);
  return init;
};

describe("callJev request", () => {
  it("POSTs to the default endpoint with Bearer auth and the default model", async () => {
    fetchStub.mockResolvedValueOnce(json(GOOD));
    const result = await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));

    expect(result.ok).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0]?.[0]).toBe("https://api.typesafe.ai/v1/systemone");
    const init = initOf(0);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ ...REQUEST, model: "jev-latest" });
  });

  it("uses TYPESAFE_BASE_URL and JEV_MODEL when set", async () => {
    fetchStub.mockResolvedValueOnce(json(GOOD));
    await settle(
      callJev(REQUEST, {
        fetch: fetchStub,
        env: { ...ENV, TYPESAFE_BASE_URL: "https://jev.example.test/", JEV_MODEL: "jev-2" },
      }),
    );
    expect(fetchStub.mock.calls[0]?.[0]).toBe("https://jev.example.test/v1/systemone");
    expect(JSON.parse(String(initOf(0).body)).model).toBe("jev-2");
  });

  it.each<[string | undefined, string]>([
    [undefined, "jev-latest"],
    ["  ", "jev-latest"],
    [" jev-2 ", "jev-2"],
  ])("JEV_MODEL=%j resolves to %s, the model callJev sends", async (jevModel, model) => {
    const env: JevEnv = jevModel === undefined ? ENV : { ...ENV, JEV_MODEL: jevModel };
    expect(resolveModel(env)).toBe(model);
    fetchStub.mockResolvedValueOnce(json(GOOD));
    await settle(callJev(REQUEST, { fetch: fetchStub, env }));
    expect(JSON.parse(String(initOf(0).body)).model).toBe(model);
  });

  it("accepts process.env as its environment (the route and record-jev pass it directly)", () => {
    // A compile-time check: `npm run typecheck` fails if process.env stops being a JevEnv.
    const env: JevEnv = process.env;
    expect(resolveModel(env)).toBe(resolveModel({ JEV_MODEL: process.env.JEV_MODEL }));
  });

  it("passes a 30 s timeout signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchStub.mockResolvedValueOnce(json(GOOD));
    await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(initOf(0).signal).toBeInstanceOf(AbortSignal);
    expect(initOf(0).signal).toBe(timeout.mock.results[0]?.value);
  });

  it("returns the zod-validated response and the latency", async () => {
    fetchStub.mockResolvedValueOnce(json({ ...GOOD, extra: "ignored" }));
    const result = await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    if (!result.ok) throw result.error;
    expect(result.value.response).toEqual(GOOD);
    expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("callJev config errors", () => {
  it.each([
    ["missing", {}],
    ["blank", { TYPESAFE_API_KEY: "   " }],
  ])("throws kind config when the key is %s, without calling fetch", async (_label, env: JevEnv) => {
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env }));
    expect(error.kind).toBe("config");
    expect(error.message).toContain("TYPESAFE_API_KEY");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("callJev retries", () => {
  it.each([408, 429, 500, 503, 529])("retries once after %i and returns the second answer", async (status) => {
    fetchStub.mockResolvedValueOnce(json({ error: "busy" }, status)).mockResolvedValueOnce(json(GOOD));
    const result = await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(fetchStub).toHaveBeenCalledTimes(2);
    if (!result.ok) throw result.error;
    expect(result.value.response).toEqual(GOOD);
    // The retry resends the same request, not a new question set.
    expect(initOf(1).body).toBe(initOf(0).body);
  });

  it.each([400, 401, 422])("does not retry %i", async (status) => {
    fetchStub.mockResolvedValueOnce(json({ error: "bad" }, status));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(error.kind).toBe("upstream");
    expect(error.status).toBe(status);
  });

  it("throws kind upstream with the status when the retry also fails", async () => {
    fetchStub.mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({}, 502));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(error.kind).toBe("upstream");
    expect(error.status).toBe(502);
  });

  it("waits 400 ms before retrying when there is no Retry-After", async () => {
    fetchStub.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(GOOD));
    const call = callJev(REQUEST, { fetch: fetchStub, env: ENV });
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    await call;
  });

  it("honours Retry-After in seconds", async () => {
    fetchStub.mockResolvedValueOnce(json({}, 429, { "retry-after": "2" })).mockResolvedValueOnce(json(GOOD));
    const call = callJev(REQUEST, { fetch: fetchStub, env: ENV });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    await call;
  });

  it("caps Retry-After at 5 s", async () => {
    fetchStub.mockResolvedValueOnce(json({}, 429, { "retry-after": "60" })).mockResolvedValueOnce(json(GOOD));
    const call = callJev(REQUEST, { fetch: fetchStub, env: ENV });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    await call;
  });
});

describe("callJev upstream errors", () => {
  it("throws kind upstream for a body that fails zod, without retrying", async () => {
    fetchStub.mockResolvedValueOnce(json({ model: "jev-latest", answers: { action: { type: "choice", choice: 3 } } }));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(error.kind).toBe("upstream");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("throws kind upstream for a body that is not JSON", async () => {
    fetchStub.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 200 }));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(error.kind).toBe("upstream");
  });

  it("throws kind upstream when the network fails", async () => {
    fetchStub.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(error.kind).toBe("upstream");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("never puts the key in the message, even when the upstream body echoes it", async () => {
    fetchStub.mockResolvedValueOnce(json({ error: `invalid key ${KEY}` }, 401));
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(error.kind).toBe("upstream");
    expect(error.status).toBe(401);
  });
});

describe("callJev timeouts", () => {
  it("throws kind timeout when the abort fires on the final attempt", async () => {
    fetchStub.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(timeoutError());
    const error = await expectJevError(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(error.kind).toBe("timeout");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("retries once after a timeout on the first attempt", async () => {
    fetchStub.mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(json(GOOD));
    const result = await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(fetchStub).toHaveBeenCalledTimes(2);
    if (!result.ok) throw result.error;
    expect(result.value.response).toEqual(GOOD);
  });

  it("gives each attempt its own 30 s signal", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchStub.mockRejectedValueOnce(timeoutError()).mockResolvedValueOnce(json(GOOD));
    await settle(callJev(REQUEST, { fetch: fetchStub, env: ENV }));
    expect(timeout).toHaveBeenCalledTimes(2);
    expect(initOf(1).signal).not.toBe(initOf(0).signal);
  });
});
