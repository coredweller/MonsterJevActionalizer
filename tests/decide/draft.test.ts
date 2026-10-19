/**
 * draft.ts: the DM's picks on the recommendation card (T056) and the ApplyChoice built from them.
 * Runs on the spread-party scenario: Wren is down (not targetable), Kell and Iso are clustered,
 * Shatter is a leveled area spell (levels 2–5), Dominate Person has a single legal level (5).
 */
import { describe, expect, it } from "vitest";
import { buildScenario } from "@/fixtures/jev/scenarios";
import { buildClusters } from "@/lib/decide/clusters";
import { type Draft, buildChoice, initialDraft, recommendationProblem, sameDraft, switchPick, targetMode } from "@/lib/decide/draft";
import type { ActionPick, BlockedRecommendation, Recommendation } from "@/lib/decide/types";
import { apply } from "@/lib/encounter/state";
import type { Condition, Tracker } from "@/lib/encounter/types";
import { type Option, buildLegalOptions } from "@/lib/monster/options";

const { tracker, situation } = buildScenario("spread-party");
const options = buildLegalOptions(tracker.reviewed, tracker.state, situation, tracker.settings.temperament);
const clusters = buildClusters(situation);

function withConditions(conditions: Condition[]): { tracker: Tracker; options: ReturnType<typeof buildLegalOptions> } {
  const held = { ...tracker, state: { ...tracker.state, conditions } };
  return { tracker: held, options: buildLegalOptions(held.reviewed, held.state, situation, held.settings.temperament) };
}

function option(list: readonly Option[], key: string): Option {
  const found = list.find((o) => o.key === key);
  if (!found) throw new Error(`No option ${key}`);
  return found;
}

function recommendation(edit: { action?: ActionPick; bonusAction?: ActionPick } = {}): Recommendation {
  return {
    moveBefore: "hold",
    action: { key: "spell_shatter", targetIds: ["iso", "kell"], clusterId: "cluster_1", slotLevel: 3 },
    bonusAction: { key: "bon_unsettling_words", targetIds: ["bree"], clusterId: "cluster_2" },
    moveAfter: "retreat",
    tactic: "control",
    confidence: "medium",
    probabilities: {},
    nouls: {},
    runnersUp: [],
    warnings: [],
    explanation: "",
    adjustments: [],
    ...edit,
  };
}

const UNPICKED = { key: null, targetIds: [], clusterId: null, slotLevel: null };

describe("initialDraft", () => {
  it("starts from the recommendation, targets in situation order, with no group on the bonus action", () => {
    expect(initialDraft(recommendation(), options, situation)).toEqual({
      moveBefore: "hold",
      action: { key: "spell_shatter", targetIds: ["kell", "iso"], clusterId: "cluster_1", slotLevel: 3 },
      bonus: { key: "bon_unsettling_words", targetIds: ["bree"], clusterId: null, slotLevel: null },
      moveAfter: "retreat",
    });
  });

  it("by hand: nothing picked except no bonus action", () => {
    expect(initialDraft(null, options, situation)).toEqual({
      moveBefore: null,
      action: UNPICKED,
      bonus: { ...UNPICKED, key: "none" },
      moveAfter: null,
    });
  });

  it("blocked: no action or bonus action, movement fixed to hold only when code picks it", () => {
    const stunned = withConditions(["stunned"]).options;
    expect(initialDraft(null, stunned, situation)).toEqual({ moveBefore: "hold", action: UNPICKED, bonus: UNPICKED, moveAfter: "hold" });
    const incapacitated = withConditions(["incapacitated"]).options;
    expect(initialDraft(null, incapacitated, situation)).toEqual({ moveBefore: null, action: UNPICKED, bonus: UNPICKED, moveAfter: null });
  });
});

describe("recommendationProblem", () => {
  it("is null when the recommendation fits the local options", () => {
    expect(recommendationProblem(recommendation(), options, clusters, situation)).toBeNull();
  });

  it("names every part that isn't legal now", () => {
    // Grappled: speed 0, so "hold" is the only movement and the recommendation's "retreat" isn't legal.
    const grappled = withConditions(["grappled"]).options;
    const rec = recommendation({
      action: { key: "spell_shatter", targetIds: ["zed"], clusterId: "cluster_9", slotLevel: 1 },
      bonusAction: { key: "bon_gone" },
    });
    expect(recommendationProblem(rec, grappled, clusters, situation)).toBe(
      'not legal now: movement "retreat", action slot level 1, action group "cluster_9", action target zed, bonus action "bon_gone"',
    );
  });

  it("checks a blocked recommendation against the local block", () => {
    const blockedByCode: BlockedRecommendation = { blocked: { reason: "Stunned", movementBy: "code" }, moveBefore: "hold", moveAfter: "hold" };
    expect(recommendationProblem(blockedByCode, withConditions(["stunned"]).options, clusters, situation)).toBeNull();
    expect(recommendationProblem(blockedByCode, withConditions(["incapacitated"]).options, clusters, situation)).toBe(
      "it disagrees about who picks the movement",
    );
    expect(recommendationProblem(blockedByCode, options, clusters, situation)).toBe(
      "it says the monster can't act, but this turn's options say it can",
    );
    expect(recommendationProblem(recommendation(), withConditions(["stunned"]).options, clusters, situation)).toBe(
      "it picks an action, but the monster can't act",
    );
  });
});

describe("switchPick", () => {
  const recommended = initialDraft(recommendation(), options, situation).action;

  it("clears the pick for no selection", () => {
    expect(switchPick(null, options.actions, recommended)).toEqual(UNPICKED);
  });

  it("restores the recommendation's targets, group and slot when switching back to it", () => {
    expect(switchPick("spell_shatter", options.actions, recommended)).toBe(recommended);
  });

  it("starts another option fresh, filling in a slot level only when there is one", () => {
    expect(switchPick("spell_fear", options.actions, recommended)).toEqual({ ...UNPICKED, key: "spell_fear" });
    expect(switchPick("spell_dominate_person", options.actions, recommended)).toEqual({ ...UNPICKED, key: "spell_dominate_person", slotLevel: 5 });
    expect(switchPick("spell_shatter", options.actions, null)).toEqual({ ...UNPICKED, key: "spell_shatter" });
  });
});

describe("targetMode", () => {
  it("aims an area action at a group, an area bonus action at players, and a no-target option at nothing", () => {
    const shatter = option(options.actions, "spell_shatter");
    expect(targetMode(shatter, "action")).toBe("cluster");
    expect(targetMode(shatter, "bonus")).toBe("players");
    expect(targetMode(option(options.actions, "spell_charm_person"), "action")).toBe("players");
    expect(targetMode(option(options.actions, "dash"), "action")).toBe("none");
  });
});

describe("sameDraft", () => {
  it("compares every pick, including target order", () => {
    const a = initialDraft(recommendation(), options, situation);
    expect(sameDraft(a, { ...a })).toBe(true);
    expect(sameDraft(a, { ...a, moveAfter: "hold" })).toBe(false);
    expect(sameDraft(a, { ...a, bonus: { ...a.bonus, targetIds: ["kell"] } })).toBe(false);
    const twoTargets: Draft = { ...a, action: { ...a.action, targetIds: ["kell", "iso"] } };
    expect(sameDraft(twoTargets, { ...a, action: { ...a.action, targetIds: ["iso", "kell"] } })).toBe(false);
  });
});

describe("buildChoice", () => {
  it("lists what is still to pick, in card order", () => {
    expect(buildChoice(initialDraft(null, options, situation), options, clusters, situation, false)).toEqual({
      ok: false,
      missing: ["Move before", "Action", "Move after"],
    });
    const noSlot: Draft = { moveBefore: "hold", action: { ...UNPICKED, key: "spell_shatter" }, bonus: { ...UNPICKED, key: "none" }, moveAfter: "hold" };
    expect(buildChoice(noSlot, options, clusters, situation, false)).toEqual({ ok: false, missing: ["Action slot level"] });
  });

  it("aims an area action at the group's members and logs the group; no bonus action is null", () => {
    const draft: Draft = {
      moveBefore: "closeIn",
      action: { key: "spell_shatter", targetIds: [], clusterId: "cluster_1", slotLevel: 4 },
      bonus: { ...UNPICKED, key: "none" },
      moveAfter: "hold",
    };
    expect(buildChoice(draft, options, clusters, situation, true)).toEqual({
      ok: true,
      choice: {
        moveBefore: "closeIn",
        action: { key: "spell_shatter", name: "Shatter", abilityId: "spell_shatter", slotLevel: 4, targetIds: ["kell", "iso"], clusterId: "cluster_1" },
        bonusAction: null,
        moveAfter: "hold",
        situation,
        recommended: true,
      },
    });
  });

  it("allows an area action with no group, players for a bonus action, and any player as a target, downed included (F18)", () => {
    const draft: Draft = {
      moveBefore: "hold",
      action: { key: "spell_shatter", targetIds: [], clusterId: null, slotLevel: 2 },
      bonus: { key: "bon_unsettling_words", targetIds: ["wren"], clusterId: null, slotLevel: null },
      moveAfter: "hold",
    };
    const built = buildChoice(draft, options, clusters, situation, false);
    if (!built.ok) throw new Error(`expected a choice, missing ${built.missing.join(", ")}`);
    expect(built.choice.action).toEqual({ key: "spell_shatter", name: "Shatter", abilityId: "spell_shatter", slotLevel: 2, targetIds: [] });
    expect(built.choice.bonusAction).toEqual({ key: "bon_unsettling_words", name: "Unsettling Words", abilityId: "bon_unsettling_words", targetIds: ["wren"] });
  });

  it("gives a basic action no ability and no targets", () => {
    const draft: Draft = { moveBefore: "hold", action: { ...UNPICKED, key: "dash", targetIds: ["kell"] }, bonus: { ...UNPICKED, key: "none" }, moveAfter: "hold" };
    const built = buildChoice(draft, options, clusters, situation, false);
    if (!built.ok) throw new Error("expected a choice");
    expect(built.choice.action).toEqual({ key: "dash", name: "Dash", abilityId: null, targetIds: [] });
  });

  it("throws on a key that isn't a legal option", () => {
    const draft: Draft = { moveBefore: "hold", action: { ...UNPICKED, key: "act_gone" }, bonus: { ...UNPICKED, key: "none" }, moveAfter: "hold" };
    expect(() => buildChoice(draft, options, clusters, situation, false)).toThrow('"act_gone" is not a legal action');
  });

  it("blocked: needs only the movement, and builds no action or bonus action", () => {
    const incapacitated = withConditions(["incapacitated"]).options;
    const start = initialDraft(null, incapacitated, situation);
    expect(buildChoice(start, incapacitated, clusters, situation, false)).toEqual({ ok: false, missing: ["Move before", "Move after"] });
    const built = buildChoice({ ...start, moveBefore: "retreat", moveAfter: "takeCover" }, incapacitated, clusters, situation, false);
    expect(built).toEqual({
      ok: true,
      choice: { moveBefore: "retreat", action: null, bonusAction: null, moveAfter: "takeCover", situation, recommended: false },
    });
  });

  it("builds a choice apply accepts, spending the picked slot", () => {
    const draft: Draft = {
      moveBefore: "hold",
      action: { key: "spell_shatter", targetIds: [], clusterId: "cluster_1", slotLevel: 5 },
      bonus: { ...UNPICKED, key: "none" },
      moveAfter: "hold",
    };
    const built = buildChoice(draft, options, clusters, situation, false);
    if (!built.ok) throw new Error("expected a choice");
    const after = apply(tracker, built.choice);
    expect(after.log).toHaveLength(tracker.log.length + 1);
    expect(after.log.at(-1)).toMatchObject({ actionId: "spell_shatter", slotLevel: 5, clusterId: "cluster_1", recommended: false });
  });
});
