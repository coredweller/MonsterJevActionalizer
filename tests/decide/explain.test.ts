/**
 * explain.ts: the explanation is a fixed template filled with the tactic, the target reason and
 * rounded probabilities (constitution Principle I: templates, not generated prose). Every case
 * compares the whole string, so no text beyond the template can slip in.
 */
import { describe, expect, it } from "vitest";
import { buildScenario } from "@/fixtures/jev/scenarios";
import { RUNNERS_UP_PER_QUESTION } from "@/lib/decide/constants";
import { explain } from "@/lib/decide/explain";
import type { RecommendationDraft } from "@/lib/decide/types";
import { buildLegalOptions } from "@/lib/monster/options";

const { tracker, situation } = buildScenario("concentrating-caster");
const options = buildLegalOptions(tracker.reviewed, tracker.state, situation, tracker.settings.temperament);
const roster = tracker.roster;

const PROBABILITIES = {
  tactic: { control: 0.71, focus_weakest: 0.13, aggressive: 0.09, focus_threat: 0.07, defensive: 0, flee: 0 },
  move_before: { hold: 0.98, closeIn: 0.01, reachOther: 0.01, retreat: 0, takeCover: 0 },
  action: {
    spell_fear: 0.62,
    spell_suggestion: 0.1,
    act_discordant_strike: 0.1,
    act_multiattack: 0.08,
    spell_hypnotic_pattern: 0.05,
    act_maestro_s_blade: 0.05,
    dash: 0,
  },
  bonus_action: { none: 0.61, bon_unsettling_words: 0.39 },
  move_after: { hold: 0.96, reachOther: 0.03, closeIn: 0.01, retreat: 0, takeCover: 0 },
};

function draft(edit: Partial<RecommendationDraft>): RecommendationDraft {
  return {
    moveBefore: "hold",
    action: { key: "act_multiattack" },
    bonusAction: { key: "none" },
    moveAfter: "hold",
    tactic: "control",
    confidence: "medium",
    probabilities: PROBABILITIES,
    nouls: { should_retreat: 0.17 },
    warnings: [],
    adjustments: [],
    ...edit,
  };
}

describe("explain: the template", () => {
  it("names the tactic, Jev's cluster and slot picks, and rounded probabilities", () => {
    const { explanation } = explain(
      draft({
        action: {
          key: "spell_fear",
          clusterId: "cluster_1",
          clusterBy: { by: "jev", question: "cluster__2", p: 0.91 },
          targetIds: ["lio", "sefa"],
          slotLevel: 3,
          slotLevelBy: { by: "jev", question: "slot_level__3", p: 0.996 },
        },
      }),
      options,
      roster,
    );
    expect(explanation).toBe(
      [
        "Tactic: control (71%).",
        "Move before: hold (98%).",
        "Action: Fear (62%), aimed at Lio and Sefa (catches 2; Jev 91%), level 3 slot (Jev 100%).",
        "Bonus action: None (61%).",
        "Move after: hold (96%).",
      ].join("\n"),
    );
  });

  it("says why code picked: lowest apparent HP, the only target, the lowest slot, and a missing answer", () => {
    const { bonus_action: _dropped, tactic: _tactic, ...withoutBonusOrTactic } = PROBABILITIES;
    const { explanation } = explain(
      draft({
        tactic: null,
        probabilities: { ...withoutBonusOrTactic, action: { ...PROBABILITIES.action, spell_charm_person: 0.7 } },
        action: { key: "spell_charm_person", targetIds: ["sefa"], targetBy: { by: "code" }, slotLevel: 1, slotLevelBy: { by: "code" } },
        bonusAction: { key: "bon_unsettling_words", targetIds: ["brakka"], targetBy: { by: "only" } },
      }),
      options,
      roster,
    );
    expect(explanation).toBe(
      [
        "Tactic: no usable answer.",
        "Move before: hold (98%).",
        "Action: Charm Person (70%), targeting Sefa (code pick: lowest apparent HP in range), level 1 slot (code pick: lowest available level).",
        "Bonus action: Unsettling Words (code pick), targeting Brakka (only target in reach).",
        "Move after: hold (96%).",
      ].join("\n"),
    );
  });

  it("names Jev's single target, a code-picked group of three, and a target nobody is in reach of", () => {
    const { explanation } = explain(
      draft({
        tactic: "focus_weakest",
        action: {
          key: "act_discordant_strike",
          clusterId: "cluster_0",
          clusterBy: { by: "code" },
          targetIds: ["brakka", "lio", "sefa"],
        },
        bonusAction: { key: "bon_unsettling_words", targetIds: [], targetBy: { by: "code" } },
      }),
      options,
      roster,
    );
    expect(explanation).toBe(
      [
        "Tactic: focus the weakest (13%).",
        "Move before: hold (98%).",
        "Action: Discordant Strike (10%), aimed at Brakka, Lio and Sefa (catches 3; code pick: catches the most).",
        "Bonus action: Unsettling Words (39%), with no target in reach.",
        "Move after: hold (96%).",
      ].join("\n"),
    );

    const jevTarget = explain(
      draft({ action: { key: "act_multiattack", targetIds: ["brakka"], targetBy: { by: "jev", question: "target__0", p: 0.84 } } }),
      options,
      roster,
    ).explanation;
    expect(jevTarget.split("\n")[2]).toBe("Action: Multiattack (8%), targeting Brakka (Jev 84%).");
  });

  it("marks the only legal value of an unasked question", () => {
    const { move_before: _mb, move_after: _ma, ...rest } = PROBABILITIES;
    const held = { ...options, movements: ["hold" as const] };
    const lines = explain(draft({ probabilities: rest }), held, roster).explanation.split("\n");
    expect(lines[1]).toBe("Move before: hold (only option).");
    expect(lines[4]).toBe("Move after: hold (only option).");
  });
});

describe("explain: runners-up", () => {
  it("lists the next most probable keys per question, excluding the pick and zeros, ties in legal order", () => {
    const { runnersUp } = explain(draft({ action: { key: "spell_fear", targetIds: ["lio", "sefa"] } }), options, roster);
    expect(RUNNERS_UP_PER_QUESTION).toBe(3);
    expect(runnersUp).toEqual([
      // Discordant Strike and Suggestion tie at 0.1: Discordant Strike comes first in the legal options.
      { question: "action", key: "act_discordant_strike", p: 0.1 },
      { question: "action", key: "spell_suggestion", p: 0.1 },
      { question: "action", key: "act_multiattack", p: 0.08 },
      { question: "bonus_action", key: "bon_unsettling_words", p: 0.39 },
      { question: "move_before", key: "closeIn", p: 0.01 },
      { question: "move_before", key: "reachOther", p: 0.01 },
      { question: "move_after", key: "reachOther", p: 0.03 },
      { question: "move_after", key: "closeIn", p: 0.01 },
    ]);
  });

  it("is empty for a question Jev wasn't asked", () => {
    const { runnersUp } = explain(draft({ probabilities: {} }), options, roster);
    expect(runnersUp).toEqual([]);
  });
});
