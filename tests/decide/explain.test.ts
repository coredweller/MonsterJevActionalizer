/**
 * explain.ts: the plan line is a fixed template filled with the tactic, its aim, the target reason
 * and rounded probabilities (constitution Principle I: templates, not generated prose). Every case
 * compares the whole string, so no text beyond the template can slip in.
 */
import { describe, expect, it } from "vitest";
import { buildScenario } from "@/fixtures/jev/scenarios";
import { explain } from "@/lib/decide/explain";
import type { RecommendationDraft } from "@/lib/decide/types";

const { tracker } = buildScenario("concentrating-caster");
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
    targetP: { actions: {}, bonusActions: {} },
    warnings: [],
    adjustments: [],
    ...edit,
  };
}

describe("explain: the plan line", () => {
  it("leads with the tactic and its %, then the tactic's aim and Jev's group pick", () => {
    const { plan } = explain(
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
      roster,
    );
    expect(plan).toEqual({
      lead: "Control (71%)",
      detail: "disable, hinder or split up the party rather than deal damage. Aimed at Lio and Sefa (catches 2; 91%).",
    });
  });

  it("names Jev's likeliest target, the only target, a code pick, and nobody in reach", () => {
    const detail = (action: RecommendationDraft["action"]) => explain(draft({ action }), roster).plan.detail;
    const aim = "disable, hinder or split up the party rather than deal damage.";
    expect(detail({ key: "act_multiattack", targetIds: ["brakka"], targetBy: { by: "jev", question: "target__0", p: 0.84 } })).toBe(
      `${aim} Brakka is the likeliest target (84%).`,
    );
    expect(detail({ key: "act_multiattack", targetIds: ["brakka"], targetBy: { by: "only" } })).toBe(`${aim} Brakka is the only target in reach.`);
    expect(detail({ key: "act_multiattack", targetIds: ["sefa"], targetBy: { by: "code" } })).toBe(
      `${aim} Targeting Sefa (code pick: lowest apparent HP in range).`,
    );
    expect(detail({ key: "act_multiattack", targetIds: [], targetBy: { by: "code" } })).toBe(`${aim} No target in reach.`);
  });

  it("a code-picked group of three, under another tactic", () => {
    const { plan } = explain(
      draft({
        tactic: "focus_weakest",
        action: { key: "act_discordant_strike", clusterId: "cluster_0", clusterBy: { by: "code" }, targetIds: ["brakka", "lio", "sefa"] },
      }),
      roster,
    );
    expect(plan).toEqual({
      lead: "Focus the weakest (13%)",
      detail: "finish off or pressure the most wounded or vulnerable player. Aimed at Brakka, Lio and Sefa (catches 3; code pick: catches the most).",
    });
  });

  it("no usable tactic: 'No clear plan', with only the target sentence, or nothing when the action has no target", () => {
    const { tactic: _tactic, ...withoutTactic } = PROBABILITIES;
    const noTactic = { tactic: null, probabilities: withoutTactic };
    expect(explain(draft({ ...noTactic, action: { key: "act_multiattack", targetIds: ["sefa"], targetBy: { by: "code" } } }), roster).plan).toEqual({
      lead: "No clear plan",
      detail: "Targeting Sefa (code pick: lowest apparent HP in range).",
    });
    expect(explain(draft({ ...noTactic, action: { key: "dash" } }), roster).plan).toEqual({ lead: "No clear plan", detail: "" });
  });
});
