import { readdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildScenario, buildScenarios, SCENARIO_NAMES, type ScenarioName } from "@/fixtures/jev/scenarios";
import { buildJevRequest } from "@/lib/decide/questions";
import { TrackerSchema } from "@/lib/encounter/types";
import { MAX_CHOICE_OPTIONS, SystemOneResponseSchema } from "@/lib/jev/types";
import { buildLegalOptions } from "@/lib/monster/options";
import { jevFixturePath } from "./fixtures";

/** Everything record-jev.ts builds before its one live call, built offline. */
function prepared(name: ScenarioName) {
  const { tracker, situation } = buildScenario(name);
  const options = buildLegalOptions(tracker.reviewed, tracker.state, situation);
  return { tracker, situation, options, ...buildJevRequest(tracker, situation, options) };
}

const keys = (list: { key: string }[]) => list.map((o) => o.key);

describe("fixtures/jev/scenarios.ts (inputs to npm run record:jev)", () => {
  it("defines the five PLAN.md scenarios", () => {
    expect([...SCENARIO_NAMES]).toEqual(["lone-melee", "spread-party", "low-hp-retreat", "concentrating-caster", "warpriest-dual-spells"]);
    expect(buildScenarios().map((s) => s.name)).toEqual([...SCENARIO_NAMES]);
  });

  it.each(SCENARIO_NAMES.map((n) => [n] as const))("%s: a valid tracker whose situation players are all in the roster", (name) => {
    const { tracker, situation } = buildScenario(name);
    expect(TrackerSchema.safeParse(tracker).success).toBe(true);
    expect(situation.players.length).toBeGreaterThan(0);
    for (const p of situation.players) expect(tracker.roster.map((r) => r.id)).toContain(p.playerId);
  });

  it.each(SCENARIO_NAMES.map((n) => [n] as const))("%s: not blocked, lists ≤ 255, and a valid model-less question set", (name) => {
    const { options, request } = prepared(name);
    expect(options.blocked).toBeUndefined();
    for (const list of [options.actions, options.bonusActions, options.movements]) expect(list.length).toBeLessThanOrEqual(MAX_CHOICE_OPTIONS);
    expect(Object.keys(request).sort()).toEqual(["questions", "state"]);
    const action = request.questions.action;
    expect(action?.type === "choice" && Object.keys(action.criteria)).toEqual(keys(options.actions));
    for (const q of Object.values(request.questions)) {
      if (q.type !== "choice") continue;
      expect(Object.keys(q.criteria).length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(q.criteria).length).toBeLessThanOrEqual(MAX_CHOICE_OPTIONS);
    }
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });

  it.each(SCENARIO_NAMES.map((n) => [n] as const))("%s: builds the same request every time (derived fixtures copy it byte for byte)", (name) => {
    expect(JSON.stringify(prepared(name).request)).toBe(JSON.stringify(prepared(name).request));
  });

  it("warpriest-dual-spells: leveled spells legal as both action and bonus action, and War Priest offered", () => {
    const { options, tracker } = prepared("warpriest-dual-spells");
    expect(tracker.state.slots).toEqual(tracker.reviewed.spellcasting?.slots);
    expect(keys(options.actions)).toEqual(expect.arrayContaining(["spell_guiding_bolt", "spell_hold_person", "spell_spirit_guardians"]));
    expect(keys(options.bonusActions)).toEqual(expect.arrayContaining(["spell_spiritual_weapon", "spell_shield_of_faith", "trt_war_priest"]));
  });

  it("spread-party: a downed caster, two clustered players, and an area option that gets a cluster question", () => {
    const { situation, candidates } = prepared("spread-party");
    expect(situation.players.some((p) => p.apparentHp === "down")).toBe(true);
    expect(situation.players.some((p) => p.clusteredWith.length > 0)).toBe(true);
    expect(candidates.clusters.some((c) => c.asked)).toBe(true);
  });

  it("low-hp-retreat: low HP, cowardly morale and an escape route", () => {
    const { tracker, situation } = prepared("low-hp-retreat");
    expect(tracker.state.hp / tracker.state.hpMax).toBeLessThan(0.25);
    expect(tracker.settings.morale).toBeLessThan(20);
    expect(situation.terrain.escapeRoute).toBe(true);
  });

  it("concentrating-caster: already concentrating on a spell it cast last round, with a leveled spell still castable", () => {
    const { tracker, options } = prepared("concentrating-caster");
    expect(tracker.state.concentration).not.toBeNull();
    expect(tracker.log).toHaveLength(1);
    expect(tracker.state.round).toBe(2);
    expect(options.actions.some((o) => o.leveledSpell && o.concentration)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Derived fixtures (tasks.md T047, constitution Principle V)
// ---------------------------------------------------------------------------

/** One per consistency rule the recordings don't trigger (T047), plus the tie-break decision. */
const DERIVED_RULES = [
  "choice-not-argmax",
  "attack-dependent-bonus",
  "two-leveled-spells",
  "out-of-range-no-close",
  "retreat-high",
  "concentration-swap",
  "spend-resource-low",
  "confidence-buckets",
  "non-candidate-action",
  "unknown-answer-keys",
  "tie-break-choice",
] as const;

const RecordedSchema = z.object({ request: z.unknown(), response: z.unknown() }).strict();
const DerivedSchema = z
  .object({ derivedFrom: z.string().regex(/^[a-z-]+\.json$/), purpose: z.string().min(1), request: z.unknown(), response: z.unknown() })
  .strict();

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const derivedFiles = () =>
  readdirSync(dirname(jevFixturePath("derived/any")))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();

function loadPair(rule: string) {
  const derived = DerivedSchema.parse(readJson(jevFixturePath(`derived/${rule}`)));
  const source = RecordedSchema.parse(readJson(jevFixturePath(derived.derivedFrom.replace(/\.json$/, ""))));
  return {
    derived,
    source,
    derivedResponse: SystemOneResponseSchema.parse(derived.response),
    sourceResponse: SystemOneResponseSchema.parse(source.response),
  };
}

/** An answer without the fields a derived fixture may edit. */
const fixedFields = (answer: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(answer).filter(([k]) => k !== "probabilities" && k !== "choice" && k !== "noul"));

describe("fixtures/jev/derived (copies of a recording with only answers edited)", () => {
  it.each(SCENARIO_NAMES.map((n) => [n] as const))("%s: the recorded request, minus model, is what the scenario rebuilds (interpret tests rely on its candidate table)", (name) => {
    const recorded = z.object({ model: z.string() }).passthrough().parse(RecordedSchema.parse(readJson(jevFixturePath(name))).request);
    const { model: _model, ...withoutModel } = recorded;
    expect(JSON.stringify(withoutModel)).toBe(JSON.stringify(prepared(name).request));
  });

  it("has exactly one fixture per rule", () => {
    expect(derivedFiles()).toEqual([...DERIVED_RULES].sort());
  });

  it.each(DERIVED_RULES.map((r) => [r] as const))("%s: names a recorded scenario, and its request is byte-identical to the source's", (rule) => {
    const { derived, source } = loadPair(rule);
    expect(SCENARIO_NAMES.map((n) => `${n}.json`)).toContain(derived.derivedFrom);
    expect(JSON.stringify(derived.request)).toBe(JSON.stringify(source.request));
  });

  it.each(DERIVED_RULES.map((r) => [r] as const))("%s: only probabilities, choice or noul differ from the source response", (rule) => {
    const { derivedResponse: d, sourceResponse: s } = loadPair(rule);
    expect(d.model).toBe(s.model);
    expect(d.usage).toEqual(s.usage);
    expect(JSON.stringify(d)).not.toBe(JSON.stringify(s));
    for (const [key, answer] of Object.entries(s.answers)) {
      const edited = d.answers[key];
      expect(edited, `answer ${key}`).toBeDefined();
      if (!edited) continue;
      expect(fixedFields(edited)).toEqual(fixedFields(answer));
      // Only unknown-answer-keys may add a probability key the request didn't ask for.
      if (rule !== "unknown-answer-keys" && answer.type === "choice" && edited.type === "choice") {
        expect(Object.keys(edited.probabilities).sort()).toEqual(Object.keys(answer.probabilities).sort());
      }
    }
    // Only unknown-answer-keys may add an answer key.
    if (rule !== "unknown-answer-keys") expect(Object.keys(d.answers).sort()).toEqual(Object.keys(s.answers).sort());
  });

  it("unknown-answer-keys: adds both an answer key and a probability key the request didn't ask for", () => {
    const { derivedResponse: d, sourceResponse: s } = loadPair("unknown-answer-keys");
    expect(Object.keys(d.answers).some((k) => !(k in s.answers))).toBe(true);
    const added = Object.entries(s.answers).some(([k, a]) => {
      const e = d.answers[k];
      return a.type === "choice" && e?.type === "choice" && Object.keys(e.probabilities).some((p) => !(p in a.probabilities));
    });
    expect(added).toBe(true);
  });
});
