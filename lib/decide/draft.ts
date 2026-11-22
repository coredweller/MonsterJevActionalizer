/**
 * The DM's draft on the recommendation card: their picks for one turn as the card edits them, and
 * the ApplyChoice built from them. Not interpret's `RecommendationDraft`. Maps between
 * Recommendation, LegalOptions and ApplyChoice; the card (components/RecommendationCard.tsx) renders it.
 */
import type { ApplyChoice, ChosenAction, Movement, Situation } from "../encounter/types";
import { describeUses } from "../monster/describe";
import type { LegalOptions, Option } from "../monster/options";
import type { Ability } from "../monster/types";
import type { Cluster } from "./clusters";
import { rankOptions } from "./questions";
import type { ActionPick, BlockedRecommendation, Recommendation } from "./types";

export type Part = "action" | "bonus";
export const PART_LABEL: Record<Part, string> = { action: "Action", bonus: "Bonus action" };

/** The DM's pick for the action or bonus action. `null` = not picked yet. */
export interface PickDraft {
  readonly key: string | null;
  /** Situation order. Used only in "players" target mode (see `targetMode`). */
  readonly targetIds: readonly string[];
  /** Used only for an area action. */
  readonly clusterId: string | null;
  /** Used only for a slot spell; required before Apply. */
  readonly slotLevel: number | null;
}

/** Everything the DM can set on the card. `null` movement = still to pick. */
export interface Draft {
  readonly moveBefore: Movement | null;
  readonly action: PickDraft;
  readonly bonus: PickDraft;
  readonly moveAfter: Movement | null;
}

const UNPICKED: PickDraft = { key: null, targetIds: [], clusterId: null, slotLevel: null };

export const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const inSituationOrder = (ids: readonly string[], situation: Situation) =>
  situation.players.map((p) => p.playerId).filter((id) => ids.includes(id));

/** The ability behind an option; null for a basic action or `none` (ChosenOption.abilityId). */
function abilityIdOf(o: Option): string | null {
  switch (o.kind) {
    case "ability":
      return o.abilityId;
    case "basic":
    case "none":
      return null;
  }
}

/**
 * How an option's targets are picked. An area action aims at a group (its id is logged on Apply).
 * A bonus action has no group field in ApplyChoice, so an area bonus action lists players instead.
 */
export function targetMode(o: Option, part: Part): "cluster" | "players" | "none" {
  if (o.range.kind === "noTarget") return "none";
  return o.area && part === "action" ? "cluster" : "players";
}

function draftPick(pick: ActionPick, part: Part, situation: Situation): PickDraft {
  return {
    key: pick.key,
    targetIds: inSituationOrder(pick.targetIds ?? [], situation),
    clusterId: part === "action" ? (pick.clusterId ?? null) : null,
    slotLevel: pick.slotLevel ?? null,
  };
}

/**
 * What the card starts with: the recommendation's picks; or, by hand, nothing picked but "no bonus
 * action". Blocked: no action or bonus action, and "hold" when code fixes the movement.
 */
export function initialDraft(rec: Recommendation | null, options: LegalOptions, situation: Situation): Draft {
  if (options.blocked) {
    const move = options.blocked.movementBy === "code" ? "hold" : null;
    return { moveBefore: move, action: UNPICKED, bonus: UNPICKED, moveAfter: move };
  }
  if (rec) {
    return {
      moveBefore: rec.moveBefore,
      action: draftPick(rec.action, "action", situation),
      bonus: draftPick(rec.bonusAction, "bonus", situation),
      moveAfter: rec.moveAfter,
    };
  }
  const none = options.bonusActions.find((o) => o.kind === "none");
  return { moveBefore: null, action: UNPICKED, bonus: none ? { ...UNPICKED, key: none.key } : UNPICKED, moveAfter: null };
}

function pickProblems(pick: ActionPick, list: readonly Option[], part: Part, clusters: readonly Cluster[], situation: Situation): string[] {
  const label = PART_LABEL[part].toLowerCase();
  const option = list.find((o) => o.key === pick.key);
  if (!option) return [`${label} "${pick.key}"`];
  const problems: string[] = [];
  if (pick.slotLevel !== undefined && !option.leveledSpell?.availableLevels.includes(pick.slotLevel)) problems.push(`${label} slot level ${pick.slotLevel}`);
  if (pick.clusterId !== undefined && !clusters.some((c) => c.id === pick.clusterId)) problems.push(`${label} group "${pick.clusterId}"`);
  const strangers = (pick.targetIds ?? []).filter((id) => !situation.players.some((p) => p.playerId === id));
  if (strangers.length > 0) problems.push(`${label} target ${strangers.join(", ")}`);
  return problems;
}

/**
 * Why the recommendation can't be shown against the options computed here, or null when it fits.
 * The server builds both from the same inputs, so a mismatch means the card was given a different
 * situation (or tracker state) than the one decided on.
 */
export function recommendationProblem(
  rec: Recommendation | BlockedRecommendation,
  options: LegalOptions,
  clusters: readonly Cluster[],
  situation: Situation,
): string | null {
  if ("blocked" in rec) {
    if (!options.blocked) return "it says the monster can't act, but this turn's options say it can";
    return rec.blocked.movementBy === options.blocked.movementBy ? null : "it disagrees about who picks the movement";
  }
  if (options.blocked) return "it picks an action, but the monster can't act";
  const problems = [
    ...[rec.moveBefore, rec.moveAfter].filter((m) => !options.movements.includes(m)).map((m) => `movement "${m}"`),
    ...pickProblems(rec.action, options.actions, "action", clusters, situation),
    ...pickProblems(rec.bonusAction, options.bonusActions, "bonus", clusters, situation),
  ];
  return problems.length > 0 ? `not legal now: ${problems.join(", ")}` : null;
}

/** The pick after the DM selects `key`: back to the recommendation's targets, group and slot for its own pick, else fresh. */
export function switchPick(key: string | null, list: readonly Option[], recommended: PickDraft | null): PickDraft {
  if (key === null) return UNPICKED;
  if (recommended !== null && key === recommended.key) return recommended;
  const levels = list.find((o) => o.key === key)?.leveledSpell?.availableLevels ?? [];
  // A single legal slot level isn't a choice, so it is filled in (interpret's "only" pick does the same).
  return { key, targetIds: [], clusterId: null, slotLevel: levels.length === 1 ? (levels[0] ?? null) : null };
}

/** Keys with their probability, most probable first, ties in `keys` (legal) order; a key missing from `dist` is 0. */
export function rankKeys<K extends string>(keys: readonly K[], dist: Readonly<Record<string, number>>): { key: K; p: number }[] {
  return keys.map((key, i) => ({ key, p: dist[key] ?? 0, i })).sort((a, b) => b.p - a.p || a.i - b.i).map(({ key, p }) => ({ key, p }));
}

/** The most probable key other than `picked`, or null when every other key is at 0 (the card's runner-up chip). */
export function runnerUp<K extends string>(keys: readonly K[], dist: Readonly<Record<string, number>>, picked: K): { key: K; p: number } | null {
  return rankKeys(keys, dist).find((r) => r.key !== picked && r.p > 0) ?? null;
}

const samePick = (a: PickDraft, b: PickDraft) =>
  a.key === b.key && a.clusterId === b.clusterId && a.slotLevel === b.slotLevel && sameIds(a.targetIds, b.targetIds);
export const sameDraft = (a: Draft, b: Draft) =>
  a.moveBefore === b.moveBefore && a.moveAfter === b.moveAfter && samePick(a.action, b.action) && samePick(a.bonus, b.bonus);

function chosenFor(list: readonly Option[], pick: PickDraft, part: Part, clusters: readonly Cluster[]): { chosen: ChosenAction | null; missing: string[] } {
  if (pick.key === null) return { chosen: null, missing: list.length > 0 ? [PART_LABEL[part]] : [] };
  const option = list.find((o) => o.key === pick.key);
  if (!option) throw new Error(`buildChoice: "${pick.key}" is not a legal ${PART_LABEL[part].toLowerCase()}`);
  if (option.kind === "none") return { chosen: null, missing: [] };

  const missing = option.leveledSpell && pick.slotLevel === null ? [`${PART_LABEL[part]} slot level`] : [];
  const slot = option.leveledSpell && pick.slotLevel !== null ? { slotLevel: pick.slotLevel } : {};
  const base = { key: option.key, name: option.name, abilityId: abilityIdOf(option), ...slot };
  switch (targetMode(option, part)) {
    case "cluster": {
      const cluster = clusters.find((c) => c.id === pick.clusterId);
      return { chosen: cluster ? { ...base, targetIds: cluster.playerIds, clusterId: cluster.id } : { ...base, targetIds: [] }, missing };
    }
    case "players":
      return { chosen: { ...base, targetIds: [...pick.targetIds] }, missing };
    case "none":
      return { chosen: { ...base, targetIds: [] }, missing };
  }
}

/** The ApplyChoice for the DM's picks, or what is still to pick. */
export function buildChoice(
  draft: Draft,
  options: LegalOptions,
  clusters: readonly Cluster[],
  situation: Situation,
  recommended: boolean,
): { ok: true; choice: ApplyChoice } | { ok: false; missing: string[] } {
  const action = chosenFor(options.actions, draft.action, "action", clusters);
  const bonus = chosenFor(options.bonusActions, draft.bonus, "bonus", clusters);
  const { moveBefore, moveAfter } = draft;
  const missing = [...(moveBefore === null ? ["Move before"] : []), ...action.missing, ...bonus.missing, ...(moveAfter === null ? ["Move after"] : [])];
  if (moveBefore === null || moveAfter === null || missing.length > 0) return { ok: false, missing };
  return { ok: true, choice: { moveBefore, action: action.chosen, bonusAction: bonus.chosen, moveAfter, situation, recommended } };
}

// ---------------------------------------------------------------------------
// Action picker (PLAN.md "Recommendation card"): tiles and search for long action lists
// ---------------------------------------------------------------------------

/** Above this many options the action is picked from tiles plus search; at or below, a dropdown. */
export const DROPDOWN_MAX_OPTIONS = 10;
export const PICKER_TILES = 3;
/** Rows the search panel lists before the DM types or picks a kind. */
export const PICKER_SEARCH_SHOWN = 5;

export const usesTilePicker = (list: readonly Option[]) => list.length > DROPDOWN_MAX_OPTIONS;

/** Most probable first when the question was answered (ties in legal order); else code ranking. */
export function rankedOptions(list: readonly Option[], dist: Readonly<Record<string, number>> | undefined, abilities: readonly Ability[]): Option[] {
  if (!dist) return rankOptions(list, abilities);
  const byKey = new Map(list.map((o) => [o.key, o]));
  return rankKeys(
    list.map((o) => o.key),
    dist,
  ).flatMap(({ key }) => byKey.get(key) ?? []);
}

/** The recommended pick first, so it is always one tap away, then the likeliest others. */
export function pickerTiles(ranked: readonly Option[], recommendedKey: string | null): Option[] {
  const recommended = ranked.find((o) => o.key === recommendedKey);
  const rest = ranked.filter((o) => o !== recommended);
  return (recommended ? [recommended, ...rest] : rest).slice(0, PICKER_TILES);
}

export type OptionKind = "ability" | "spell" | "basic";
export const OPTION_KIND_LABEL: Record<OptionKind, string> = { ability: "Abilities", spell: "Spells", basic: "Basic" };

const abilityOf = (o: Option, abilities: readonly Ability[]) => (o.kind === "ability" ? abilities.find((a) => a.id === o.abilityId) : undefined);
const isSpell = (a: Ability) => a.source === "Spellcasting" || a.spellLevel !== undefined;

export function optionKind(o: Option, abilities: readonly Ability[]): OptionKind {
  if (o.kind !== "ability") return "basic";
  const ability = abilityOf(o, abilities);
  return ability && isSpell(ability) ? "spell" : "ability";
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One short line under an option's name: "Spell · 5th level · concentration", "Cantrip", "Recharge 5–6". */
export function optionSubtitle(o: Option, abilities: readonly Ability[]): string {
  const ability = abilityOf(o, abilities);
  if (!ability) return "Basic action";
  const parts: string[] = [];
  if (isSpell(ability)) {
    if (ability.spellLevel === 0) parts.push("Cantrip");
    else parts.push(ability.spellLevel === undefined ? "Spell" : `Spell · ${ordinal(ability.spellLevel)} level`);
    if (ability.uses.kind === "per-day" || ability.uses.kind === "recharge") parts.push(describeUses(ability.uses));
  } else {
    parts.push(capitalize(describeUses(ability.uses)));
  }
  if (ability.concentration) parts.push("concentration");
  return parts.join(" · ");
}

/**
 * The search panel's rows. With no query and no kind, the next likeliest after the tiles; otherwise
 * every option (tiles too) whose name holds the query, of that kind ("all": any), in ranked order.
 */
export function searchRows(
  ranked: readonly Option[],
  tiles: readonly Option[],
  query: string,
  kind: OptionKind | "all" | null,
  abilities: readonly Ability[],
): Option[] {
  const q = query.trim().toLowerCase();
  if (q === "" && kind === null) return ranked.filter((o) => !tiles.includes(o)).slice(0, PICKER_SEARCH_SHOWN);
  return ranked.filter((o) => (kind === null || kind === "all" || optionKind(o, abilities) === kind) && o.name.toLowerCase().includes(q));
}
