/**
 * POST /api/decide (contracts/decide-api.md). `callJev` is mocked, keeping the real `JevError`
 * class, so the test counts Jev requests without a live call: exactly one when the monster can act,
 * none when it is hard-blocked (constitution Principle I).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/decide/route";
import { buildScenario } from "@/fixtures/jev/scenarios";
import { type DecideResponse, DecideResponseSchema } from "@/lib/decide/types";
import type { Condition, Situation, Tracker } from "@/lib/encounter/types";
import { callJev, JevError, type JevErrorKind } from "@/lib/jev/client";
import { SystemOneResponseSchema } from "@/lib/jev/types";
import { buildLegalOptions } from "@/lib/monster/options";
import { loadJevFixture } from "../helpers/fixtures";

vi.mock("@/lib/jev/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/jev/client")>();
  return { ...actual, callJev: vi.fn<typeof actual.callJev>() };
});

const callJevMock = vi.mocked(callJev);
const KEY = "sk-route-test-SECRET-0987654321";
// The recording's `response` half; the scenario rebuilds the matching tracker and situation.
const RECORDED = SystemOneResponseSchema.parse(z.object({ response: z.unknown() }).parse(loadJevFixture("lone-melee")).response);

function body(tracker: Tracker, situation: Situation): Record<string, unknown> {
  const { reviewed, state, settings, roster, log } = tracker;
  return { tracker: { reviewed, state, settings, roster, log }, situation };
}

function withConditions(conditions: Condition[]) {
  const { tracker, situation } = buildScenario("lone-melee");
  return { tracker: { ...tracker, state: { ...tracker.state, conditions } }, situation };
}

const post = (payload: unknown) =>
  POST(new Request("http://localhost/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: typeof payload === "string" ? payload : JSON.stringify(payload) }));

async function read(res: Response): Promise<{ text: string; json: DecideResponse }> {
  const text = await res.text();
  return { text, json: DecideResponseSchema.parse(JSON.parse(text)) };
}

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", KEY);
  callJevMock.mockReset();
  callJevMock.mockResolvedValue({ response: RECORDED, latencyMs: 1234 });
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/decide: a monster that can act", () => {
  it("calls Jev exactly once and returns 200 with the recommendation, recomputed options and meta", async () => {
    const { tracker, situation } = buildScenario("lone-melee");
    const res = await post(body(tracker, situation));
    expect(res.status).toBe(200);
    expect(callJevMock).toHaveBeenCalledTimes(1);

    const { text, json } = await read(res);
    if (!json.ok || !("action" in json.recommendation) || !("model" in json.meta)) throw new Error(`unexpected body: ${text}`);
    expect(json.recommendation.action.key).toBe("act_multiattack");
    expect(json.options).toEqual(buildLegalOptions(tracker.reviewed, tracker.state, situation));
    expect(json.meta).toEqual({ model: "jev-1.13.0", latencyMs: 1234, usage: { input_tokens: 2828, output_tokens: 311 } });
  });

  it("sends the built question set with process.env, never a key of its own", async () => {
    const { tracker, situation } = buildScenario("lone-melee");
    await post(body(tracker, situation));
    const [request, deps] = callJevMock.mock.calls[0] ?? [];
    expect(Object.keys(request ?? {}).sort()).toEqual(["questions", "state"]);
    expect(Object.keys(request?.questions ?? {})).toContain("action");
    expect(deps?.env).toBe(process.env);
  });

  it("logs one line per Jev call with model, latency, usage and question count, and never the state or key", async () => {
    const { tracker, situation } = buildScenario("lone-melee");
    await post(body(tracker, situation));
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    const questions = Object.keys(callJevMock.mock.calls[0]?.[0].questions ?? {}).length;
    expect(line).toBe(`jev model=jev-1.13.0 latencyMs=1234 usage={"input_tokens":2828,"output_tokens":311} questions=${questions}`);
    expect(line).not.toContain(KEY);
    expect(line).not.toContain("Tunnel Wasp");
  });

  it("ignores client-supplied options and recomputes them", async () => {
    const { tracker, situation } = buildScenario("lone-melee");
    const smuggled = { ...body(tracker, situation), options: { actions: [{ key: "act_wish" }], bonusActions: [], movements: ["flyUp"] } };
    const { json } = await read(await post(smuggled));
    if (!json.ok) throw new Error("expected ok");
    expect(json.options).toEqual(buildLegalOptions(tracker.reviewed, tracker.state, situation));
    const sent = JSON.stringify(callJevMock.mock.calls[0]?.[0]);
    expect(sent).not.toContain("act_wish");
  });
});

describe("POST /api/decide: a hard-blocked monster", () => {
  it("stunned → Jev not called, movement hold", async () => {
    const { tracker, situation } = withConditions(["stunned"]);
    const res = await post(body(tracker, situation));
    expect(res.status).toBe(200);
    expect(callJevMock).not.toHaveBeenCalled();
    const { json } = await read(res);
    if (!json.ok) throw new Error("expected ok");
    expect(json.meta).toEqual({ jevCalled: false });
    expect(json.recommendation).toEqual({ blocked: { reason: expect.stringMatching(/Stunned/), movementBy: "code" }, moveBefore: "hold", moveAfter: "hold" });
    expect(info).not.toHaveBeenCalled();
  });

  it("incapacitated only → Jev not called, movement null (the DM picks)", async () => {
    const { tracker, situation } = withConditions(["incapacitated"]);
    const res = await post(body(tracker, situation));
    expect(callJevMock).not.toHaveBeenCalled();
    const { json } = await read(res);
    if (!json.ok) throw new Error("expected ok");
    expect(json.meta).toEqual({ jevCalled: false });
    expect(json.recommendation).toEqual({ blocked: { reason: expect.stringMatching(/Incapacitated/), movementBy: "dm" }, moveBefore: null, moveAfter: null });
    expect(json.options.movements.length).toBeGreaterThan(1);
  });
});

describe("POST /api/decide: errors", () => {
  it.each([
    ["not JSON", "{not json"],
    ["missing situation", { tracker: body(buildScenario("lone-melee").tracker, buildScenario("lone-melee").situation).tracker }],
    ["a tracker that fails the schema", { ...body(buildScenario("lone-melee").tracker, buildScenario("lone-melee").situation), tracker: { reviewed: {} } }],
  ])("invalid body (%s) → 400 invalid-request, Jev not called", async (_label, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(callJevMock).not.toHaveBeenCalled();
    const { json } = await read(res);
    expect(json.ok).toBe(false);
    if (json.ok) return;
    expect(json.error.kind).toBe("invalid-request");
    expect(json.error.message.length).toBeGreaterThan(0);
  });

  it("names the failing field in a 400 message", async () => {
    const { tracker } = buildScenario("lone-melee");
    const { json } = await read(await post({ tracker: body(tracker, buildScenario("lone-melee").situation).tracker }));
    if (json.ok) throw new Error("expected an error");
    expect(json.error.message).toMatch(/situation/);
  });

  it.each([
    ["config", 500],
    ["upstream", 502],
    ["timeout", 504],
  ] as const satisfies readonly (readonly [JevErrorKind, number])[])("JevError %s → %i with a matching error.kind", async (kind, status) => {
    callJevMock.mockRejectedValue(new JevError(kind, `Jev failed (${kind}).`));
    const { tracker, situation } = buildScenario("lone-melee");
    const res = await post(body(tracker, situation));
    expect(res.status).toBe(status);
    expect(callJevMock).toHaveBeenCalledTimes(1);
    const { text, json } = await read(res);
    expect(json).toEqual({ ok: false, error: { kind, message: `Jev failed (${kind}).` } });
    expect(text).not.toContain(KEY);
  });

  it("rethrows an unexpected error after logging it", async () => {
    callJevMock.mockRejectedValue(new TypeError("boom"));
    const { tracker, situation } = buildScenario("lone-melee");
    await expect(post(body(tracker, situation))).rejects.toThrow("boom");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("POST /api/decide: secret safety", () => {
  it("no response body contains the key", async () => {
    const lone = buildScenario("lone-melee");
    const stunned = withConditions(["stunned"]);
    const bodies = [await (await post(body(lone.tracker, lone.situation))).text(), await (await post(body(stunned.tracker, stunned.situation))).text()];
    callJevMock.mockRejectedValue(new JevError("upstream", "Jev returned HTTP 500.", 500));
    bodies.push(await (await post(body(lone.tracker, lone.situation))).text());
    bodies.push(await (await post("{bad")).text());
    for (const text of bodies) expect(text).not.toContain(KEY);
  });

  it("the route never reads TYPESAFE_API_KEY itself", () => {
    const source = readFileSync(new URL("../../app/api/decide/route.ts", import.meta.url), "utf8");
    expect(source).not.toContain("TYPESAFE_API_KEY");
  });
});
