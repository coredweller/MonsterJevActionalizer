/**
 * The recommendation card's plan line (PLAN.md "Recommendation card"): a fixed template filled with
 * Jev's probabilities. The tactic and its %, what that tactic aims at, and why the action's target
 * or group was chosen. Never generated prose (constitution Principle I).
 */
import type { Movement, Player } from "../encounter/types";
import { TACTICS } from "./questions";
import type { ActionPick, Plan, PickSource, RecommendationDraft, Tactic } from "./types";

export const TACTIC_LABELS: Record<Tactic, string> = {
  aggressive: "aggressive",
  focus_weakest: "focus the weakest",
  focus_threat: "focus the biggest threat",
  control: "control",
  defensive: "defensive",
  flee: "flee",
};

export const MOVEMENT_LABELS: Record<Movement, string> = {
  hold: "hold",
  closeIn: "close in",
  reachOther: "reach another target",
  retreat: "retreat",
  takeCover: "take cover",
  flyUp: "fly up",
};

export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** How the group was picked: Jev's %, the only group, or interpret's fallback rule. */
function clusterSource(source: PickSource): string {
  switch (source.by) {
    case "jev":
      // The DM sees the probability alone; the plan line never names the model (G07).
      return pct(source.p);
    case "only":
      return "only group in reach";
    case "code":
      return "code pick: catches the most";
  }
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const decapitalize = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Why the action's group or target was chosen, as one sentence; "" for an action with no target. */
function targetSentence(pick: ActionPick, playerName: (id: string) => string): string {
  const names = (pick.targetIds ?? []).map(playerName);
  if (pick.clusterBy) return `Aimed at ${joinNames(names)} (catches ${names.length}; ${clusterSource(pick.clusterBy)}).`;
  if (!pick.targetBy) return "";
  if (names.length === 0) return "No target in reach.";
  switch (pick.targetBy.by) {
    case "jev":
      return `${joinNames(names)} is the likeliest target (${pct(pick.targetBy.p)}).`;
    case "only":
      return `${joinNames(names)} is the only target in reach.`;
    case "code":
      return `Targeting ${joinNames(names)} (code pick: lowest apparent HP in range).`;
  }
}

export function explain(draft: RecommendationDraft, roster: readonly Player[]): { plan: Plan } {
  const playerName = (id: string) => roster.find((p) => p.id === id)?.name ?? id;
  const target = targetSentence(draft.action, playerName);
  if (draft.tactic === null) return { plan: { lead: "No clear plan", detail: target } };
  // A non-null tactic always comes from the tactic distribution (interpret reads it from there).
  const lead = `${capitalize(TACTIC_LABELS[draft.tactic])} (${pct(draft.probabilities.tactic?.[draft.tactic] ?? 0)})`;
  const aim = `${decapitalize(TACTICS[draft.tactic])}.`;
  return { plan: { lead, detail: target === "" ? aim : `${aim} ${target}` } };
}
