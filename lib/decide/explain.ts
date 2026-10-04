/**
 * The recommendation's explanation and runners-up (PLAN.md "Recommendation card"). The explanation
 * is a fixed template filled with Jev's probabilities: tactic, movement, action and bonus action with
 * why each target, group and slot was chosen. Never generated prose (constitution Principle I).
 */
import type { Movement, Player } from "../encounter/types";
import type { LegalOptions, Option } from "../monster/options";
import { RUNNERS_UP_PER_QUESTION } from "./constants";
import type { ActionPick, PickSource, RecommendationDraft, RunnerUp, Tactic } from "./types";

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

/** What a `code` pick did, per kind of pick (interpret's fallback rules). */
const CODE_REASON = {
  target: "code pick: lowest apparent HP in range",
  cluster: "code pick: catches the most",
  slot: "code pick: lowest available level",
} as const;

const ONLY_REASON = {
  target: "only target in reach",
  cluster: "only group in reach",
  slot: "only level left",
} as const;

type PickKind = keyof typeof CODE_REASON;

const pct = (p: number) => `${Math.round(p * 100)}%`;

function sourceText(source: PickSource, kind: PickKind): string {
  switch (source.by) {
    case "jev":
      return `Jev ${pct(source.p)}`;
    case "only":
      return ONLY_REASON[kind];
    case "code":
      return CODE_REASON[kind];
  }
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Jev's probability of the picked key in parentheses: `(62%)`; `(only option)` when the question
 * wasn't asked because there was one legal value; `(code pick)` when the answer had no usable key.
 */
function questionP(draft: RecommendationDraft, question: string, key: string, legalCount: number): string {
  const dist = draft.probabilities[question];
  if (dist) return `(${pct(dist[key] ?? 0)})`;
  return legalCount === 1 ? "(only option)" : "(code pick)";
}

function pickDetails(pick: ActionPick, playerName: (id: string) => string): string {
  const parts: string[] = [];
  const names = (pick.targetIds ?? []).map(playerName);
  if (pick.clusterBy) {
    parts.push(`aimed at ${joinNames(names)} (catches ${names.length}; ${sourceText(pick.clusterBy, "cluster")})`);
  } else if (pick.targetBy) {
    parts.push(names.length > 0 ? `targeting ${joinNames(names)} (${sourceText(pick.targetBy, "target")})` : "with no target in reach");
  }
  if (pick.slotLevel !== undefined && pick.slotLevelBy) {
    parts.push(`level ${pick.slotLevel} slot (${sourceText(pick.slotLevelBy, "slot")})`);
  }
  return parts.map((p) => `, ${p}`).join("");
}

function optionName(list: readonly Option[], key: string): string {
  const found = list.find((o) => o.key === key);
  if (!found) throw new Error(`explain: "${key}" is not a legal option`);
  return found.name;
}

/** Up to RUNNERS_UP_PER_QUESTION keys after the pick, most probable first, zeros left out, ties in legal order. */
function runnersUpFor(draft: RecommendationDraft, question: string, picked: string, legalOrder: readonly string[]): RunnerUp[] {
  const dist = draft.probabilities[question];
  if (!dist) return [];
  return legalOrder
    .filter((key) => key !== picked && (dist[key] ?? 0) > 0)
    .map((key) => ({ question, key, p: dist[key] ?? 0 }))
    .sort((a, b) => b.p - a.p || legalOrder.indexOf(a.key) - legalOrder.indexOf(b.key))
    .slice(0, RUNNERS_UP_PER_QUESTION);
}

export function explain(draft: RecommendationDraft, options: LegalOptions, roster: readonly Player[]): { explanation: string; runnersUp: RunnerUp[] } {
  const playerName = (id: string) => roster.find((p) => p.id === id)?.name ?? id;
  const tactic = draft.tactic === null ? "no usable answer" : `${TACTIC_LABELS[draft.tactic]} ${questionP(draft, "tactic", draft.tactic, 2)}`;
  const move = (question: string, m: Movement) => `${MOVEMENT_LABELS[m]} ${questionP(draft, question, m, options.movements.length)}`;
  const act = (question: string, list: readonly Option[], pick: ActionPick) =>
    `${optionName(list, pick.key)} ${questionP(draft, question, pick.key, list.length)}${pickDetails(pick, playerName)}`;

  const explanation = [
    `Tactic: ${tactic}.`,
    `Move before: ${move("move_before", draft.moveBefore)}.`,
    `Action: ${act("action", options.actions, draft.action)}.`,
    `Bonus action: ${act("bonus_action", options.bonusActions, draft.bonusAction)}.`,
    `Move after: ${move("move_after", draft.moveAfter)}.`,
  ].join("\n");

  const actionKeys = options.actions.map((o) => o.key);
  const bonusKeys = options.bonusActions.map((o) => o.key);
  const runnersUp = [
    ...runnersUpFor(draft, "action", draft.action.key, actionKeys),
    ...runnersUpFor(draft, "bonus_action", draft.bonusAction.key, bonusKeys),
    ...runnersUpFor(draft, "move_before", draft.moveBefore, options.movements),
    ...runnersUpFor(draft, "move_after", draft.moveAfter, options.movements),
  ];
  return { explanation, runnersUp };
}
