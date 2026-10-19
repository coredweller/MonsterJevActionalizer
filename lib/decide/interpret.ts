/**
 * Turns Jev's answers into one consistent recommendation (PLAN.md "Interpretation"; constitution
 * Principle II). Jev answers every question independently, so cross-question consistency is code's job.
 *
 * Fixed order, each step recorded in `adjustments`:
 *  1. Read the answers. Keys the request didn't offer are ignored (`unknown-keys`). Each question's
 *     pick is the argmax of `probabilities`, never `choice` alone (`choice-not-argmax`). A tie at the
 *     max (within TIE_EPSILON) goes to Jev's `choice` if it is tied, otherwise to the first tied key in legal order
 *     (`tie-break`). A question with no usable answer falls back to code ranking (`code-pick`).
 *  2. `retreat`: should_retreat ≥ RETREAT_THRESHOLD → Disengage or Dash (the more probable), hold, then retreat.
 *  3. `spend-resource-low`: spend_resource < SPEND_RESOURCE_LOW → a pick that spends a slot, recharge
 *     or daily use gives way to the most probable option that spends none.
 *  4. `out-of-range`: an action, then a bonus action, with no target in reach after move_before → the
 *     most probable one in reach. Range lists only hold targetable players (downed players are left
 *     out unless the monster is feral or a genius; buildLegalOptions decides).
 *  5. `one-leveled-spell`: action and bonus action both leveled spells → the less probable one is
 *     replaced by its best alternative that isn't one.
 *  6. `attack-dependent-bonus`: a bonus action that needs the Attack action is replaced when the
 *     action isn't an attack.
 *  7. `concentration`: a concentration spell while concentrating stands, with a warning naming the
 *     spell it ends.
 * Then targets, clusters and slot levels for the final picks (Jev's candidate answer, the only value,
 * or a code pick), confidence from the action's probability, and the template explanation.
 *
 * Every replacement is the most probable option that passes the rules already applied plus the
 * standing rules (action and bonus action in reach; never two leveled spells; never an attack-dependent bonus
 * without an attack), so a later step can't undo an earlier one. Dash and Disengage, and `none`, pass
 * every rule, so a replacement always exists.
 */
import type { Movement, PlayerTurn, Situation } from "../encounter/types";
import type { SystemOneResponse } from "../jev/types";
import type { Blocked, LegalOptions, Option } from "../monster/options";
import type { Ability } from "../monster/types";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, RETREAT_THRESHOLD, SPEND_RESOURCE_LOW, TIE_EPSILON } from "./constants";
import { explain } from "./explain";
import { askedNoulKeys, type Candidates, type OptionList, rankOptions } from "./questions";
import {
  type ActionPick,
  type Adjustment,
  type AdjustmentRule,
  type BlockedRecommendation,
  type Confidence,
  type DecideTracker,
  type PickSource,
  type Recommendation,
  type Tactic,
  TacticSchema,
} from "./types";

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

export function confidenceFor(p: number | null): Confidence {
  if (p !== null && p >= CONFIDENCE_HIGH) return "high";
  if (p !== null && p >= CONFIDENCE_MEDIUM) return "medium";
  return "dmsCall";
}

/** Movement code can't decide for a hard-blocked monster is left to the DM (null). Jev isn't called. */
export function blockedRecommendation(blocked: Blocked): BlockedRecommendation {
  const move = blocked.movementBy === "code" ? "hold" : null;
  return { blocked, moveBefore: move, moveAfter: move };
}

const abilityOf = (o: Option, abilities: readonly Ability[]): Ability | undefined =>
  o.kind === "ability" ? abilities.find((a) => a.id === o.abilityId) : undefined;

/**
 * A slot spell, or an innate spell of level 1+ (e.g. Hold Person 1/day). An innate spell the extractor
 * gave no `spellLevel` (e.g. "Misty Step (2/Day)") can't be detected.
 */
export function isLeveledSpell(o: Option, abilities: readonly Ability[]): boolean {
  return o.leveledSpell !== undefined || (abilityOf(o, abilities)?.spellLevel ?? 0) >= 1;
}

/** The Attack action: a weapon attack or Multiattack, not a spell (Guiding Bolt's spell attack isn't one). */
function isAttackAction(o: Option, abilities: readonly Ability[]): boolean {
  const a = abilityOf(o, abilities);
  if (!a || a.spellLevel !== undefined || a.source === "Spellcasting") return false;
  return a.attack !== undefined || a.multiattack !== undefined;
}

const needsAttackAction = (o: Option, abilities: readonly Ability[]) => abilityOf(o, abilities)?.dependsOnAttackAction === true;

/** Movements that bring the monster toward a target, so "in range after moving" counts. */
const CLOSING: ReadonlySet<Movement> = new Set<Movement>(["closeIn", "reachOther"]);

/** Targetable players an option reaches this turn given move_before, in situation order. Unknown range rules out only what options.ts already did (total cover). */
function playersInReach(o: Option, moveBefore: Movement): readonly string[] {
  switch (o.range.kind) {
    case "ft":
      return CLOSING.has(moveBefore) ? o.range.inRangeAfterMove : o.range.inRangeNow;
    case "unknown":
      return o.range.possibleTargetIds;
    case "noTarget":
      return [];
  }
}

/** Only a measured range can be out of reach; no target needed or an unknown range passes. */
const inReach = (o: Option, moveBefore: Movement) => o.range.kind !== "ft" || playersInReach(o, moveBefore).length > 0;

const HP_ORDER: Record<PlayerTurn["apparentHp"], number> = { down: 0, nearDown: 1, bloodied: 2, healthy: 3 };

const pct = (p: number) => `${Math.round(p * 100)}%`;
const levelKey = (n: number) => `level__${n}`;

function lookup<V>(map: ReadonlyMap<string, V>, key: string, what: string): V {
  const found = map.get(key);
  if (found === undefined) throw new Error(`interpret: no ${what} "${key}" in the candidate table`);
  return found;
}

// ---------------------------------------------------------------------------
// Reading the answers
// ---------------------------------------------------------------------------

interface ChoiceRead {
  /** Only the keys the question offered. */
  readonly dist: Readonly<Record<string, number>>;
  /** Jev's `choice`, or null when it isn't an offered key. */
  readonly choice: string | null;
}

/** Every asked choice question → its criterion keys in legal order. Mirrors buildJevRequest. */
function askedChoices(options: LegalOptions, candidates: Candidates): Map<string, readonly string[]> {
  const asked = new Map<string, readonly string[]>();
  const addIfChoice = (question: string, keys: readonly string[]) => {
    if (keys.length >= 2) asked.set(question, keys);
  };
  addIfChoice("tactic", TacticSchema.options);
  addIfChoice("move_before", options.movements);
  addIfChoice("move_after", options.movements);
  addIfChoice("action", options.actions.map((o) => o.key));
  addIfChoice("bonus_action", options.bonusActions.map((o) => o.key));

  const playerKeyOf = new Map(Object.entries(candidates.players).map(([key, id]) => [id, key]));
  const clusterKeyOf = new Map(Object.entries(candidates.clusterKeys).map(([key, c]) => [c.id, key]));
  for (const t of candidates.targets) if (t.asked) asked.set(t.key, t.playerIds.map((id) => lookup(playerKeyOf, id, "player")));
  for (const c of candidates.clusters) if (c.asked) asked.set(c.key, c.clusterIds.map((id) => lookup(clusterKeyOf, id, "cluster")));
  for (const s of candidates.slotLevels) if (s.asked) asked.set(s.key, s.levels.map(levelKey));
  return asked;
}

function readAnswers(
  response: SystemOneResponse,
  asked: ReadonlyMap<string, readonly string[]>,
  askedNouls: readonly string[],
  adjust: (rule: AdjustmentRule, detail: string) => void,
): { choices: Map<string, ChoiceRead>; nouls: Record<string, number> } {
  const choices = new Map<string, ChoiceRead>();
  const nouls: Record<string, number> = {};
  const ignored: string[] = [];

  for (const [question, answer] of Object.entries(response.answers)) {
    const keys = asked.get(question);
    if (keys && answer.type === "choice") {
      const dist: Record<string, number> = {};
      for (const [key, p] of Object.entries(answer.probabilities)) {
        if (keys.includes(key) && Number.isFinite(p) && p >= 0) dist[key] = p;
        else ignored.push(`${question}.${key}`);
      }
      const choice = keys.includes(answer.choice) ? answer.choice : null;
      if (choice === null) ignored.push(`${question}.choice=${answer.choice}`);
      if (Object.keys(dist).length > 0) choices.set(question, { dist, choice });
      else ignored.push(`${question} (no usable key)`);
    } else if (askedNouls.includes(question) && answer.type === "noul" && answer.noul >= 0 && answer.noul <= 1) {
      nouls[question] = answer.noul;
    } else {
      ignored.push(question);
    }
  }
  if (ignored.length > 0) adjust("unknown-keys", `Ignored what the request didn't ask for: ${ignored.join(", ")}`);
  return { choices, nouls };
}

// ---------------------------------------------------------------------------
// Targets, clusters and slot levels of a final pick: Jev's candidate answer, the only value when
// no question was asked, or a code pick when the option had no candidate question (research R5)
// or Jev's answer had no usable key.
// ---------------------------------------------------------------------------

interface ResolveContext {
  readonly candidates: Candidates;
  readonly situation: Situation;
  readonly options: LegalOptions;
  readonly moveBefore: Movement;
  readonly adjust: (rule: AdjustmentRule, detail: string) => void;
  /** Jev's argmax (with the tie-break) for a candidate question, or undefined when it has no usable answer. */
  readonly jevPick: (question: string, keys: readonly string[]) => { key: string; source: PickSource } | undefined;
}

type TargetPart = Pick<ActionPick, "targetIds" | "targetBy" | "clusterId" | "clusterBy">;
type SlotPart = Pick<ActionPick, "slotLevel" | "slotLevelBy">;

/**
 * An area option's group; its members are the targets. Code pick: among groups with a member in
 * reach, the one with the most players. The whole group counts, downed members too (research R6).
 */
function areaPart(o: Option, list: OptionList, ctx: ResolveContext): TargetPart {
  const clusters = new Map(Object.entries(ctx.candidates.clusterKeys));
  const keyOfId = new Map([...clusters].map(([key, c]) => [c.id, key]));
  const cand = ctx.candidates.clusters.find((c) => c.optionKey === o.key && c.list === list);
  const offered = cand?.clusterIds.map((id) => lookup(keyOfId, id, "cluster")) ?? [];

  const jev = cand?.asked ? ctx.jevPick(cand.key, offered) : undefined;
  if (jev) {
    const c = lookup(clusters, jev.key, "cluster");
    return { clusterId: c.id, clusterBy: jev.source, targetIds: c.playerIds };
  }
  const only = cand && !cand.asked && offered.length === 1 ? offered[0] : undefined;
  if (only !== undefined) {
    const c = lookup(clusters, only, "cluster");
    return { clusterId: c.id, clusterBy: { by: "only" }, targetIds: c.playerIds };
  }

  // Ties go to the first group in situation order.
  const reach = new Set(playersInReach(o, ctx.moveBefore));
  let top: { id: string; playerIds: string[]; caught: number } | undefined;
  for (const c of clusters.values()) {
    const caught = c.playerIds.length;
    if (c.playerIds.some((id) => reach.has(id)) && (!top || caught > top.caught)) top = { ...c, caught };
  }
  if (!top) return {};
  ctx.adjust("code-pick", `${o.name}: no usable group answer; aimed at ${top.playerIds.join(", ")} (catches the most)`);
  return { clusterId: top.id, clusterBy: { by: "code" }, targetIds: top.playerIds };
}

/** A single-target option's target. Code pick: the lowest apparent HP in reach, ties in situation order. */
function targetPart(o: Option, list: OptionList, ctx: ResolveContext): TargetPart {
  const players = new Map(Object.entries(ctx.candidates.players));
  const keyOfId = new Map([...players].map(([key, id]) => [id, key]));
  const cand = ctx.candidates.targets.find((c) => c.optionKey === o.key && c.list === list);

  const jev = cand?.asked ? ctx.jevPick(cand.key, cand.playerIds.map((id) => lookup(keyOfId, id, "player"))) : undefined;
  if (jev) return { targetIds: [lookup(players, jev.key, "player")], targetBy: jev.source };
  const only = cand && !cand.asked && cand.playerIds.length === 1 ? cand.playerIds[0] : undefined;
  if (only !== undefined) return { targetIds: [only], targetBy: { by: "only" } };

  const hp = new Map(ctx.situation.players.map((pl) => [pl.playerId, HP_ORDER[pl.apparentHp]]));
  // Array.prototype.sort is stable, so equal HP keeps situation order.
  const lowest = [...playersInReach(o, ctx.moveBefore)].sort((a, b) => (hp.get(a) ?? 0) - (hp.get(b) ?? 0))[0];
  ctx.adjust("code-pick", `${o.name}: no usable target answer; ${lowest === undefined ? "no target in reach" : `${lowest} (lowest apparent HP in range)`}`);
  return { targetIds: lowest === undefined ? [] : [lowest], targetBy: { by: "code" } };
}

/** A slot spell's level. Code pick: the lowest level with a slot left. */
function slotPart(o: Option, available: readonly number[], list: OptionList, ctx: ResolveContext): SlotPart {
  const cand = ctx.candidates.slotLevels.find((c) => c.optionKey === o.key && c.list === list);
  const levels = new Map((cand?.levels ?? []).map((n) => [levelKey(n), n]));

  const jev = cand?.asked ? ctx.jevPick(cand.key, [...levels.keys()]) : undefined;
  if (jev) return { slotLevel: lookup(levels, jev.key, "slot level"), slotLevelBy: jev.source };
  const only = cand && !cand.asked && cand.levels.length === 1 ? cand.levels[0] : undefined;
  if (only !== undefined) return { slotLevel: only, slotLevelBy: { by: "only" } };

  const lowest = available[0];
  if (lowest === undefined) throw new Error(`interpret: ${o.name} is offered with no slot level available`);
  ctx.adjust("code-pick", `${o.name}: no usable slot answer; level ${lowest} (lowest available)`);
  return { slotLevel: lowest, slotLevelBy: { by: "code" } };
}

// ---------------------------------------------------------------------------
// interpret
// ---------------------------------------------------------------------------

export function interpret(
  response: SystemOneResponse,
  options: LegalOptions,
  candidates: Candidates,
  tracker: DecideTracker,
  situation: Situation,
): Recommendation {
  const abilities = tracker.reviewed.abilities;
  const adjustments: Adjustment[] = [];
  const warnings: string[] = [];
  const adjust = (rule: AdjustmentRule, detail: string) => adjustments.push({ rule, detail });

  // ---- 1. Read ------------------------------------------------------------
  const { choices, nouls } = readAnswers(response, askedChoices(options, candidates), askedNoulKeys(options), adjust);
  const p = (question: string, key: string): number | null => {
    const read = choices.get(question);
    return read ? (read.dist[key] ?? 0) : null;
  };

  /** The most probable allowed key; ties go to Jev's choice if it is tied, else the first in `keys` order. */
  const best = (question: string, keys: readonly string[], allowed: (key: string) => boolean): string | undefined => {
    const read = choices.get(question);
    if (!read) return undefined;
    const pool = keys.filter(allowed);
    const prob = (k: string) => read.dist[k] ?? 0;
    const max = Math.max(...pool.map(prob));
    const tied = pool.filter((k) => max - prob(k) <= TIE_EPSILON);
    const pick = read.choice !== null && tied.includes(read.choice) ? read.choice : tied[0];
    if (tied.length > 1 && pick !== undefined) {
      adjust("tie-break", `${question}: ${tied.join(", ")} tie at ${pct(max)}; took ${pick} (${pick === read.choice ? "Jev's choice" : "first in legal order"})`);
    }
    return pick;
  };

  /** A question's argmax before any rule, noting when Jev's `choice` disagrees with it. */
  const firstPick = (question: string, keys: readonly string[]): string | undefined => {
    const pick = best(question, keys, () => true);
    const read = choices.get(question);
    const choice = read?.choice ?? null;
    if (read && pick !== undefined && choice !== null && (read.dist[choice] ?? 0) < (read.dist[pick] ?? 0)) {
      adjust("choice-not-argmax", `${question}: Jev's choice ${choice} (${pct(read.dist[choice] ?? 0)}) isn't the most probable; took ${pick} (${pct(read.dist[pick] ?? 0)})`);
    }
    return pick;
  };

  const optionIn = (list: readonly Option[], key: string): Option => {
    const found = list.find((o) => o.key === key);
    if (!found) throw new Error(`interpret: "${key}" is not a legal option`);
    return found;
  };

  const tacticKey = firstPick("tactic", TacticSchema.options);
  const tactic: Tactic | null = TacticSchema.options.find((t) => t === tacticKey) ?? null;
  const firstMove = (question: string): Movement => {
    const key = firstPick(question, options.movements);
    return options.movements.find((m) => m === key) ?? options.movements[0] ?? "hold";
  };

  // Mutable picks: each rule below may replace them, in order.
  let moveBefore = firstMove("move_before");
  let moveAfter = firstMove("move_after");

  const firstOption = (question: string, list: readonly Option[]): Option => {
    const key = firstPick(question, list.map((o) => o.key));
    if (key !== undefined) return optionIn(list, key);
    const ranked = rankOptions(list, abilities)[0];
    if (!ranked) throw new Error(`interpret: no legal options for ${question}`);
    if (list.length > 1) adjust("code-pick", `${question}: no usable answer from Jev; took ${ranked.name} by code ranking`);
    return ranked;
  };
  let action = firstOption("action", options.actions);
  let bonus = firstOption("bonus_action", options.bonusActions);

  // Rules applied so far, kept for every later replacement.
  const actionRules: ((o: Option) => boolean)[] = [];
  const bonusRules: ((o: Option) => boolean)[] = [];
  const actionAllowed = (o: Option) =>
    actionRules.every((rule) => rule(o)) &&
    inReach(o, moveBefore) &&
    !(isLeveledSpell(o, abilities) && isLeveledSpell(bonus, abilities));
  const bonusAllowed = (o: Option) =>
    bonusRules.every((rule) => rule(o)) &&
    inReach(o, moveBefore) &&
    !(isLeveledSpell(o, abilities) && isLeveledSpell(action, abilities)) &&
    !(needsAttackAction(o, abilities) && !isAttackAction(action, abilities));

  /** The most probable option passing `allowed`; by code ranking when Jev's answer is unusable. */
  const replacement = (question: string, list: readonly Option[], allowed: (o: Option) => boolean): Option => {
    const key = best(question, list.map((o) => o.key), (k) => allowed(optionIn(list, k)));
    const found = key !== undefined ? optionIn(list, key) : rankOptions(list, abilities).find(allowed);
    if (!found) throw new Error(`interpret: no ${question} passes the consistency rules`);
    return found;
  };
  const replaceAction = () => (action = replacement("action", options.actions, actionAllowed));
  const replaceBonus = () => (bonus = replacement("bonus_action", options.bonusActions, bonusAllowed));
  const showP = (question: string, o: Option) => {
    const value = p(question, o.key);
    return value === null ? o.name : `${o.name} (${pct(value)})`;
  };

  // ---- 2. Retreat ----------------------------------------------------------
  const retreat = nouls.should_retreat;
  if (retreat !== undefined && retreat >= RETREAT_THRESHOLD) {
    if (options.movements.includes("retreat")) {
      const before = action;
      moveBefore = "hold";
      moveAfter = "retreat";
      actionRules.push((o) => o.kind === "basic" && (o.basic === "disengage" || o.basic === "dash"));
      replaceAction();
      adjust("retreat", `should_retreat ${pct(retreat)} ≥ ${pct(RETREAT_THRESHOLD)}: ${before.name} → ${showP("action", action)}, hold, then retreat`);
    } else {
      adjust("retreat", `should_retreat ${pct(retreat)} ≥ ${pct(RETREAT_THRESHOLD)}, but it can't move, so the picks stand`);
    }
  }

  // ---- 3. Spend resource low ---------------------------------------------
  const spend = nouls.spend_resource;
  if (spend !== undefined && spend < SPEND_RESOURCE_LOW) {
    const noResource = (o: Option) => !o.usesResource;
    if (action.usesResource) {
      const before = action;
      actionRules.push(noResource);
      replaceAction();
      adjust("spend-resource-low", `spend_resource ${pct(spend)} < ${pct(SPEND_RESOURCE_LOW)}: action ${before.name} → ${showP("action", action)}`);
    }
    if (bonus.usesResource) {
      const before = bonus;
      bonusRules.push(noResource);
      replaceBonus();
      adjust("spend-resource-low", `spend_resource ${pct(spend)} < ${pct(SPEND_RESOURCE_LOW)}: bonus action ${before.name} → ${showP("bonus_action", bonus)}`);
    }
  }

  // ---- 4. Out of range -----------------------------------------------------
  if (!inReach(action, moveBefore)) {
    const before = action;
    replaceAction();
    adjust("out-of-range", `${before.name} has no target in reach after "${moveBefore}": → ${showP("action", action)}`);
  }
  if (!inReach(bonus, moveBefore)) {
    const before = bonus;
    replaceBonus();
    adjust("out-of-range", `bonus action ${before.name} has no target in reach after "${moveBefore}": → ${showP("bonus_action", bonus)}`);
  }

  // ---- 5. One leveled spell per turn --------------------------------------
  if (isLeveledSpell(action, abilities) && isLeveledSpell(bonus, abilities)) {
    const pa = p("action", action.key) ?? 0;
    const pb = p("bonus_action", bonus.key) ?? 0;
    const both = `${showP("action", action)} and ${showP("bonus_action", bonus)} are both leveled spells`;
    // On a tie (within TIE_EPSILON) the action is kept: it's the turn's main choice.
    if (pb - pa <= TIE_EPSILON) {
      const before = bonus;
      replaceBonus();
      adjust("one-leveled-spell", `${both}: bonus action ${before.name} → ${showP("bonus_action", bonus)}`);
    } else {
      const before = action;
      replaceAction();
      adjust("one-leveled-spell", `${both}: action ${before.name} → ${showP("action", action)}`);
    }
  }

  // ---- 6. Attack-dependent bonus action ----------------------------------
  if (needsAttackAction(bonus, abilities) && !isAttackAction(action, abilities)) {
    const before = bonus;
    replaceBonus();
    adjust("attack-dependent-bonus", `${before.name} needs the Attack action, and ${action.name} isn't one: → ${showP("bonus_action", bonus)}`);
  }

  // ---- 7. Concentration ----------------------------------------------------
  let held = tracker.state.concentration?.name ?? null;
  for (const o of [action, bonus]) {
    if (!o.concentration) continue;
    if (held !== null) {
      const warning = `Casting ${o.name} ends concentration on ${held}.`;
      warnings.push(warning);
      adjust("concentration", warning);
    }
    held = o.name;
  }

  // ---- Targets, clusters and slot levels ---------------------------------
  const ctx: ResolveContext = {
    candidates,
    situation,
    options,
    moveBefore,
    adjust,
    jevPick: (question, keys) => {
      const key = best(question, keys, () => true);
      return key === undefined ? undefined : { key, source: { by: "jev", question, p: p(question, key) ?? 0 } };
    },
  };
  const resolve = (o: Option, list: OptionList): ActionPick => ({
    key: o.key,
    ...(o.area ? areaPart(o, list, ctx) : o.singleTarget ? targetPart(o, list, ctx) : {}),
    ...(o.leveledSpell ? slotPart(o, o.leveledSpell.availableLevels, list, ctx) : {}),
  });
  const draft = {
    moveBefore,
    action: resolve(action, "actions"),
    bonusAction: resolve(bonus, "bonusActions"),
    moveAfter,
    tactic,
    confidence: confidenceFor(p("action", action.key)),
    probabilities: Object.fromEntries([...choices].map(([question, read]) => [question, { ...read.dist }])),
    nouls,
    warnings,
    adjustments,
  };
  return { ...draft, ...explain(draft, options, tracker.roster) };
}
