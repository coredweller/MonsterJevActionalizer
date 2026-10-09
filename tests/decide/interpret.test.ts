/**
 * interpret.ts against recorded Jev responses (fixtures/jev/<scenario>.json) and derived copies
 * (fixtures/jev/derived/<rule>.json). Never a live call (constitution Principle V). Each scenario's
 * tracker and situation are rebuilt by fixtures/jev/scenarios.ts, so the candidate table matches the
 * recorded request.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildScenario, isScenarioName } from "@/fixtures/jev/scenarios";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, RETREAT_THRESHOLD, SPEND_RESOURCE_LOW, TIE_EPSILON } from "@/lib/decide/constants";
import { blockedRecommendation, confidenceFor, interpret, isLeveledSpell } from "@/lib/decide/interpret";
import { buildJevRequest } from "@/lib/decide/questions";
import { type AdjustmentRule, type Recommendation, RecommendationSchema } from "@/lib/decide/types";
import { createTracker } from "@/lib/encounter/state";
import { type SystemOneResponse, SystemOneResponseSchema } from "@/lib/jev/types";
import { buildLegalOptions, type Option } from "@/lib/monster/options";
import type { Ability } from "@/lib/monster/types";
import { loadJevFixture } from "../helpers/fixtures";
import { ability, handReviewed, playerTurn, situationWith, slots } from "../helpers/reviewed";

const FixtureSchema = z.object({ derivedFrom: z.string().optional(), request: z.unknown(), response: z.unknown() });

/** Interprets a recorded or derived fixture against its rebuilt scenario. */
function run(fixture: string) {
  const parsed = FixtureSchema.parse(loadJevFixture(fixture));
  const name = parsed.derivedFrom ? parsed.derivedFrom.replace(/\.json$/, "") : fixture;
  if (!isScenarioName(name)) throw new Error(`${fixture}: no scenario "${name}"`);
  const { tracker, situation } = buildScenario(name);
  const options = buildLegalOptions(tracker.reviewed, tracker.state, situation, tracker.settings.temperament);
  const { candidates } = buildJevRequest(tracker, situation, options);
  const response = SystemOneResponseSchema.parse(parsed.response);
  const rec = interpret(response, options, candidates, tracker, situation);
  return { rec, options, tracker, situation, response };
}

const rules = (rec: Recommendation): AdjustmentRule[] => rec.adjustments.map((a) => a.rule);
const ruleDetails = (rec: Recommendation, rule: AdjustmentRule) => rec.adjustments.filter((a) => a.rule === rule).map((a) => a.detail);
const CONSISTENCY_RULES: AdjustmentRule[] = ["retreat", "spend-resource-low", "out-of-range", "one-leveled-spell", "attack-dependent-bonus", "concentration"];

function optionByKey(list: readonly Option[], key: string): Option {
  const found = list.find((o) => o.key === key);
  if (!found) throw new Error(`No option "${key}"`);
  return found;
}

const RECORDED = ["lone-melee", "spread-party", "low-hp-retreat", "concentrating-caster", "warpriest-dual-spells"];
const DERIVED = [
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
  "downed-not-targeted",
  "tie-epsilon",
  "out-of-range-bonus",
].map((r) => `derived/${r}`);

describe("interpret: every fixture", () => {
  it.each([...RECORDED, ...DERIVED].map((f) => [f] as const))("%s: a valid Recommendation whose keys all come from the legal options", (fixture) => {
    const { rec, options, situation, tracker } = run(fixture);
    expect(RecommendationSchema.parse(rec)).toEqual(rec);
    const action = optionByKey(options.actions, rec.action.key);
    const bonus = optionByKey(options.bonusActions, rec.bonusAction.key);
    expect(options.movements).toContain(rec.moveBefore);
    expect(options.movements).toContain(rec.moveAfter);
    const playerIds = situation.players.map((p) => p.playerId);
    for (const id of [...(rec.action.targetIds ?? []), ...(rec.bonusAction.targetIds ?? [])]) expect(playerIds).toContain(id);
    for (const [pick, option] of [
      [rec.action, action],
      [rec.bonusAction, bonus],
    ] as const) {
      if (pick.slotLevel !== undefined) expect(option.leveledSpell?.availableLevels).toContain(pick.slotLevel);
      else expect(option.leveledSpell).toBeUndefined();
    }
    // The cross-question rules hold on every final pick.
    expect(isLeveledSpell(action, tracker.reviewed.abilities) && isLeveledSpell(bonus, tracker.reviewed.abilities)).toBe(false);
    expect(rec.explanation.length).toBeGreaterThan(0);
  });
});

/** A recorded choice answer. Recordings are evidence: tests read Jev's values from them rather than restate them. */
function choiceAnswer(response: SystemOneResponse, question: string) {
  const answer = response.answers[question];
  if (answer?.type !== "choice") throw new Error(`${question} is not a recorded choice answer`);
  return answer;
}
const recordedP = (response: SystemOneResponse, question: string, key: string) => choiceAnswer(response, question).probabilities[key] ?? 0;
function recordedTop(response: SystemOneResponse, question: string): string {
  const top = Object.entries(choiceAnswer(response, question).probabilities).sort((a, b) => b[1] - a[1])[0];
  if (!top) throw new Error(`${question} has no probabilities`);
  return top[0];
}
function recordedNoul(response: SystemOneResponse, question: string): number {
  const answer = response.answers[question];
  if (answer?.type !== "noul") throw new Error(`${question} is not a recorded noul answer`);
  return answer.noul;
}

describe("interpret: recorded responses", () => {
  it("lone-melee: Jev's clear pick stands with no consistency rule applied", () => {
    const { rec, response } = run("lone-melee");
    expect(rec.action).toEqual({ key: recordedTop(response, "action"), targetIds: ["brakka"], targetBy: { by: "only" } });
    expect(rec.bonusAction).toEqual({ key: "none" });
    expect(rec.moveBefore).toBe(recordedTop(response, "move_before"));
    expect(rec.tactic).toBe(recordedTop(response, "tactic"));
    expect(rec.confidence).toBe(confidenceFor(recordedP(response, "action", rec.action.key)));
    expect(rec.nouls).toEqual({ multiattack_fallback: recordedNoul(response, "multiattack_fallback"), should_retreat: recordedNoul(response, "should_retreat") });
    expect(rec.adjustments).toEqual([]);
    expect(rec.warnings).toEqual([]);
  });

  it("warpriest-dual-spells: Jev's top action and its target question's pick, and War Priest only if it is the top bonus", () => {
    const { rec, response } = run("warpriest-dual-spells");
    expect(rec.action.key).toBe(recordedTop(response, "action"));
    expect(rec.action.targetBy).toEqual({ by: "jev", question: "target__0", p: recordedP(response, "target__0", recordedTop(response, "target__0")) });
    expect(rec.bonusAction.key).toBe(recordedTop(response, "bonus_action"));
    expect(rules(rec).filter((r) => CONSISTENCY_RULES.includes(r))).toEqual([]);
  });

  it("spread-party: an area action gets Jev's cluster pick, and the downed Wren is never offered or picked", () => {
    const { rec, response, options } = run("spread-party");
    expect(options.targetableIds).not.toContain("wren");
    expect(rec.action).toEqual({
      key: recordedTop(response, "action"),
      clusterId: "cluster_1",
      clusterBy: { by: "jev", question: "cluster__0", p: recordedP(response, "cluster__0", "cluster__1") },
      targetIds: ["kell", "iso"],
    });
    expect(rec.bonusAction.key).toBe("bon_unsettling_words");
    expect(rec.bonusAction.targetBy).toMatchObject({ by: "jev", question: "target__1" });
    expect(rec.bonusAction.targetIds).not.toContain("wren");
    // Jev was only offered targetable players, so nothing it answered is discarded.
    expect(rules(rec)).not.toContain("unknown-keys");
    expect(rec.moveBefore).toBe(recordedTop(response, "move_before"));
  });

  it("low-hp-retreat: should_retreat ≥ RETREAT_THRESHOLD → the more probable of Disengage and Dash, hold then retreat", () => {
    const { rec, response } = run("low-hp-retreat");
    expect(recordedNoul(response, "should_retreat")).toBeGreaterThanOrEqual(RETREAT_THRESHOLD);
    expect(recordedP(response, "action", "disengage")).toBeGreaterThan(recordedP(response, "action", "dash"));
    expect(rec.action).toEqual({ key: "disengage" });
    expect([rec.moveBefore, rec.moveAfter]).toEqual(["hold", "retreat"]);
    expect(rules(rec)).toContain("retreat");
    // Jev's own top action is kept visible as a runner-up.
    const top = recordedTop(response, "action");
    expect(rec.runnersUp).toContainEqual({ question: "action", key: top, p: recordedP(response, "action", top) });
  });

  it("concentrating-caster: a close call is decided by the distribution, with Jev's cluster pick and no concentration warning", () => {
    const { rec, response } = run("concentrating-caster");
    expect(rec.action.key).toBe(recordedTop(response, "action"));
    expect(rules(rec)).not.toContain("tie-break");
    expect(rec.action.clusterBy).toMatchObject({ by: "jev", question: "cluster__0" });
    expect(rec.action.targetIds).toEqual(["lio", "sefa"]);
    // Discordant Strike isn't a concentration spell, so the held Suggestion is safe.
    expect(rec.warnings).toEqual([]);
    expect(rec.confidence).toBe(confidenceFor(recordedP(response, "action", rec.action.key)));
  });
});

describe("interpret: consistency rules (derived fixtures)", () => {
  it("reads probabilities, not choice: Jev's choice Multiattack (0.41) loses to Mandibles (0.55)", () => {
    const { rec, response } = run("derived/choice-not-argmax");
    const action = response.answers.action;
    expect(action?.type === "choice" && action.choice).toBe("act_multiattack");
    expect(rec.action.key).toBe("act_mandibles");
    expect(rules(rec)).toContain("choice-not-argmax");
    expect(rec.confidence).toBe("dmsCall");
  });

  it("drops an attack-dependent bonus action (War Priest) when the action (Sacred Flame) isn't an attack", () => {
    const { rec } = run("derived/attack-dependent-bonus");
    expect(rec.action.key).toBe("spell_sacred_flame");
    expect(rec.bonusAction).toEqual({ key: "none" });
    expect(rules(rec)).toContain("attack-dependent-bonus");
    expect(ruleDetails(rec, "attack-dependent-bonus").join(" ")).toMatch(/War Priest/);
  });

  it("one leveled spell per turn: the lower-probability Guiding Bolt (0.55 < 0.70) is replaced by its best non-leveled alternative", () => {
    const { rec } = run("derived/two-leveled-spells");
    expect(rec.action).toEqual({ key: "act_multiattack", targetIds: ["sefa"], targetBy: { by: "jev", question: "target__0", p: 0.41 } });
    // Spiritual Weapon had no slot or target question: code picks the lowest slot and the lowest apparent HP in range.
    expect(rec.bonusAction).toEqual({
      key: "spell_spiritual_weapon",
      slotLevel: 2,
      slotLevelBy: { by: "code" },
      targetIds: ["brakka"],
      targetBy: { by: "code" },
    });
    expect(rules(rec)).toContain("one-leveled-spell");
    expect(ruleDetails(rec, "one-leveled-spell").join(" ")).toMatch(/Guiding Bolt/);
  });

  it("an out-of-range action with a non-closing move_before → the next-best option in range (skipping out-of-range Multiattack)", () => {
    const { rec } = run("derived/out-of-range-no-close");
    expect(rec.moveBefore).toBe("hold");
    expect(rec.action.key).toBe("spell_vicious_mockery");
    expect(rec.action.targetBy).toMatchObject({ by: "jev", question: "target__0" });
    expect(rules(rec)).toContain("out-of-range");
    expect(ruleDetails(rec, "out-of-range").join(" ")).toMatch(/Maestro's Blade/);
  });

  it("should_retreat ≥ RETREAT_THRESHOLD prefers Disengage or Dash with retreat movement over a 0.96 Multiattack", () => {
    const { rec } = run("derived/retreat-high");
    expect(rec.action).toEqual({ key: "disengage" });
    expect([rec.moveBefore, rec.moveAfter]).toEqual(["hold", "retreat"]);
    expect(rules(rec)).toContain("retreat");
    expect(rec.confidence).toBe("dmsCall");
  });

  it("concentrating, then a new concentration spell: the pick (Fear) stands with a warning naming the dropped spell", () => {
    const { rec } = run("derived/concentration-swap");
    expect(rec.action).toEqual({
      key: "spell_fear",
      clusterId: "cluster_1",
      clusterBy: { by: "jev", question: "cluster__2", p: 0.91 },
      targetIds: ["lio", "sefa"],
      slotLevel: 3,
      slotLevelBy: { by: "jev", question: "slot_level__3", p: 1 },
    });
    expect(rec.warnings).toEqual(["Casting Fear ends concentration on Suggestion."]);
    expect(rules(rec)).toContain("concentration");
    expect(rec.confidence).toBe("medium");
  });

  it("low spend_resource boosts the best no-resource option: Multiattack (closing in) replaces Discordant Strike's recharge", () => {
    const { rec, response } = run("derived/spend-resource-low");
    const spend = response.answers.spend_resource;
    expect(spend?.type === "noul" && spend.noul).toBeLessThan(SPEND_RESOURCE_LOW);
    expect(rec.moveBefore).toBe("closeIn");
    // Not a target candidate: lowest apparent HP among players it reaches after closing in (Kell and Iso, both healthy) → Kell.
    expect(rec.action).toEqual({ key: "act_multiattack", targetIds: ["kell"], targetBy: { by: "code" } });
    expect(rec.bonusAction.key).toBe("bon_unsettling_words");
    expect(rules(rec)).toContain("spend-resource-low");
  });

  it("confidence buckets: exactly CONFIDENCE_HIGH is high", () => {
    expect(run("derived/confidence-buckets").rec.confidence).toBe("high");
  });

  it.each([
    [CONFIDENCE_HIGH, "high"],
    [0.8499, "medium"],
    [CONFIDENCE_MEDIUM, "medium"],
    [0.5999, "dmsCall"],
    [0, "dmsCall"],
    [null, "dmsCall"],
  ] as const)("confidenceFor(%s) → %s", (p, bucket) => {
    expect(confidenceFor(p)).toBe(bucket);
  });

  it("a non-candidate action gets the code-picked target (lowest apparent HP in range) marked as a code pick", () => {
    const { rec } = run("derived/non-candidate-action");
    expect(rec.action).toEqual({
      key: "spell_charm_person",
      targetIds: ["sefa"],
      targetBy: { by: "code" },
      slotLevel: 1,
      slotLevelBy: { by: "jev", question: "slot_level__1", p: 0.99 },
    });
    expect(rules(rec)).toContain("code-pick");
    expect(rec.warnings).toEqual([]);
  });

  it("unknown answer keys are ignored: an unasked action, flyUp, an unasked target question and an unknown question", () => {
    const { rec } = run("derived/unknown-answer-keys");
    expect(rec.action).toEqual({ key: "act_multiattack", targetIds: ["brakka"], targetBy: { by: "only" } });
    expect(rec.moveBefore).toBe("hold");
    expect(rec.probabilities.action).not.toHaveProperty("act_fireball");
    expect(rec.probabilities.move_before).not.toHaveProperty("flyUp");
    expect(rec.probabilities).not.toHaveProperty("target__0");
    expect(rec.nouls).not.toHaveProperty("surprise_question");
    expect(rules(rec)).not.toContain("choice-not-argmax");
    const ignored = ruleDetails(rec, "unknown-keys").join(" ");
    for (const key of ["act_fireball", "flyUp", "target__0", "surprise_question"]) expect(ignored).toContain(key);
  });

  it("a cunning monster's code-picked target skips a downed player, even when the range is unknown", () => {
    const { rec, tracker } = run("derived/downed-not-targeted");
    expect(tracker.settings.temperament).toBe("cunning");
    // Wren is down and lowest; Kell, Iso and Bree are healthy, so Kell wins on situation order.
    expect(rec.action).toEqual({ key: "spell_dissonant_whispers", targetIds: ["kell"], targetBy: { by: "code" }, slotLevel: 1, slotLevelBy: { by: "code" } });
  });

  it("ties within TIE_EPSILON: Jev's hold beats a reachOther 1e-10 higher, and equally likely leveled spells keep the action", () => {
    const { rec } = run("derived/tie-epsilon");
    expect(rec.moveBefore).toBe("hold");
    expect(rules(rec)).not.toContain("choice-not-argmax");
    expect(ruleDetails(rec, "tie-break").join(" ")).toMatch(/move_before/);
    expect(rec.action.key).toBe("spell_guiding_bolt");
    // Spiritual Weapon is replaced by the best bonus that is neither leveled nor needs the Attack action.
    expect(rec.bonusAction).toEqual({ key: "none" });
    expect(ruleDetails(rec, "one-leveled-spell").join(" ")).toMatch(/bonus action Spiritual Weapon/);
    expect(TIE_EPSILON).toBe(1e-9);
  });

  it("an out-of-range bonus action with a non-closing move_before → the next-best bonus action in range (here none)", () => {
    const { rec, options } = run("derived/out-of-range-bonus");
    const words = optionByKey(options.bonusActions, "bon_unsettling_words");
    expect(words.range).toMatchObject({ kind: "ft", inRangeNow: [] });
    expect(rec.moveBefore).toBe("hold");
    expect(rec.bonusAction).toEqual({ key: "none" });
    expect(ruleDetails(rec, "out-of-range")).toEqual(['bonus action Unsettling Words has no target in reach after "hold": → None (45%)']);
    // The action (Hypnotic Pattern, 120 ft.) reaches everyone, so only the bonus action is replaced.
    expect(rec.action.key).toBe("spell_hypnotic_pattern");
  });

  it("tie-break: prefers Jev's choice when it is tied at the max, otherwise the first tied key in legal order", () => {
    const { rec } = run("derived/tie-break-choice");
    expect(rec.action.key).toBe("spell_suggestion");
    // move_after: hold and reachOther tie at 0.48; Jev's choice (closeIn) isn't tied, and hold comes first.
    expect(rec.moveAfter).toBe("hold");
    expect(ruleDetails(rec, "tie-break")).toHaveLength(2);
    // Recasting the spell it holds still ends that concentration.
    expect(rec.warnings).toEqual(["Casting Suggestion ends concentration on Suggestion."]);
  });
});

describe("isLeveledSpell", () => {
  // Hand-made abilities: the extractor's spell levels are being fixed in parallel (F03/F04).
  const spell = (id: string, extra: Partial<Ability>) => ability({ id, name: id, source: "Spellcasting", singleTarget: false, ...extra });
  const reviewed = handReviewed(
    "TunnelWasp",
    [
      spell("spell_hold_person", { uses: { kind: "per-day", max: 1 }, spellLevel: 2 }), // innate 1/day, level 2, no slot
      spell("spell_misty_step", { category: "bonus", source: "BonusActions", uses: { kind: "per-day", max: 2 }, spellLevel: 2 }),
      spell("spell_detect_magic", { spellLevel: 1 }), // innate at will, level 1
      spell("spell_bless", { uses: { kind: "slot", level: 1 }, spellLevel: 1 }), // slot spell
      spell("spell_mage_hand", { spellLevel: 0 }), // cantrip
      spell("spell_mystery_hex", { uses: { kind: "per-day", max: 1 }, known: false }), // unknown spell: no level
      ability({ id: "act_bite", name: "Bite", attack: { kind: "melee", bonus: 4, reach: 5 } }),
    ],
    { spellcasting: slots({ "1": 2 }) },
  );
  const situation = situationWith([playerTurn({ playerId: "p1" })]);
  const options = buildLegalOptions(reviewed, createTracker(reviewed, "t", "2026-10-08T00:00:00.000Z").state, situation, "cunning");
  const leveled = (key: string) => isLeveledSpell(optionByKey([...options.actions, ...options.bonusActions], key), reviewed.abilities);

  it.each([
    ["spell_hold_person", true],
    ["spell_misty_step", true],
    ["spell_detect_magic", true],
    ["spell_bless", true],
    ["spell_mage_hand", false],
    ["spell_mystery_hex", false],
    ["act_bite", false],
    ["dash", false],
    ["none", false],
  ] as const)("%s → %s", (key, expected) => {
    expect(leveled(key)).toBe(expected);
  });
});

describe("blockedRecommendation", () => {
  it("holds still when code decides movement", () => {
    expect(blockedRecommendation({ reason: "Stunned", movementBy: "code" })).toEqual({
      blocked: { reason: "Stunned", movementBy: "code" },
      moveBefore: "hold",
      moveAfter: "hold",
    });
  });

  it("leaves movement to the DM (null) when only incapacitated", () => {
    expect(blockedRecommendation({ reason: "Incapacitated", movementBy: "dm" })).toEqual({
      blocked: { reason: "Incapacitated", movementBy: "dm" },
      moveBefore: null,
      moveAfter: null,
    });
  });
});
