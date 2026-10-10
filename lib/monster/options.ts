/**
 * Legal options for one turn (PLAN.md "Legal options"). Deterministic and pure: code decides what
 * is legal and Jev only picks among these (constitution Principle I). The client computes them for
 * display, overrides and the manual fallback; the server recomputes them before asking Jev (R4).
 */
import { z } from "zod";
import { type Condition, type EncounterState, type Movement, MovementSchema, type Situation, type Temperament, ZONE_DEFAULT_FT } from "../encounter/types";
import { MAX_CHOICE_OPTIONS, OPTION_NONE } from "../jev/types";
import { summarize } from "./describe";
import type { Ability, Attack, ReviewedMonster } from "./types";

export const BasicActionSchema = z.enum(["dash", "dodge", "disengage", "hide", "help"]);
export type BasicAction = z.infer<typeof BasicActionSchema>;

/**
 * Whether players are in range. `ft` lists the ids of targetable players (see `targetableIds`)
 * within `ft` feet now, and within `ft` feet after moving up to the monster's speed (a superset of
 * `inRangeNow`). Out-of-range options are still offered, with empty lists.
 */
export const OptionRangeSchema = z.discriminatedUnion("kind", [
  /** Doesn't target a player: Dash, Dodge, healing, self buffs, `none`. */
  z.object({ kind: z.literal("noTarget") }),
  /** Targets a player, but the statblock gives no range code could read. Never assumed. */
  z.object({ kind: z.literal("unknown") }),
  z.object({
    kind: z.literal("ft"),
    ft: z.number().int().min(0),
    inRangeNow: z.array(z.string()),
    inRangeAfterMove: z.array(z.string()),
  }),
]);
export type OptionRange = z.infer<typeof OptionRangeSchema>;

export const LeveledSpellSchema = z.object({
  baseLevel: z.number().int().min(1).max(9),
  /** Slot levels ≥ base with a slot left, ascending. Never empty: the option isn't offered then. */
  availableLevels: z.array(z.number().int().min(1).max(9)).min(1),
});

const OptionBaseSchema = z.object({
  /** Jev criterion key: the ability id, the basic action name, or `none`. */
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  /** One line: name, to-hit/DC, damage, range, area. */
  summary: z.string(),
  /** Spends a slot, a daily use or a recharge. */
  usesResource: z.boolean(),
  /** Only on slot spells. */
  leveledSpell: LeveledSpellSchema.optional(),
  concentration: z.boolean(),
  singleTarget: z.boolean(),
  area: z.boolean(),
  range: OptionRangeSchema,
});

export const OptionSchema = z.discriminatedUnion("kind", [
  OptionBaseSchema.extend({ kind: z.literal("ability"), abilityId: z.string() }),
  OptionBaseSchema.extend({ kind: z.literal("basic"), basic: BasicActionSchema }),
  OptionBaseSchema.extend({ kind: z.literal("none") }),
]);
export type Option = z.infer<typeof OptionSchema>;

/** `code`: the monster holds still. `dm`: it can still move, and the DM picks how by hand. */
export const BlockedSchema = z.object({ reason: z.string(), movementBy: z.enum(["code", "dm"]) });
export type Blocked = z.infer<typeof BlockedSchema>;

export const LegalOptionsSchema = z.object({
  /** Set when the monster can't act. Actions and bonus actions are then empty and Jev isn't called. */
  blocked: BlockedSchema.optional(),
  actions: z.array(OptionSchema).max(MAX_CHOICE_OPTIONS),
  /** Always ends with `none` unless blocked. */
  bonusActions: z.array(OptionSchema).max(MAX_CHOICE_OPTIONS),
  movements: z.array(MovementSchema).max(MAX_CHOICE_OPTIONS),
  /**
   * Players the monster may target this turn, in situation order: everyone except downed players,
   * unless it is feral or a genius. Range lists only contain these; an option of unknown range can
   * reach any of them. Downed players still count toward clusters.
   */
  targetableIds: z.array(z.string()),
});
export type LegalOptions = z.infer<typeof LegalOptionsSchema>;

// ---------------------------------------------------------------------------

/** These include incapacitated and stop movement, so code holds the monster still. */
const HELD: readonly Condition[] = ["stunned", "paralyzed", "petrified", "unconscious"];
const SPEED_ZERO: readonly Condition[] = ["grappled", "restrained"];

const BASIC: Record<BasicAction, { name: string; effect: string }> = {
  dash: { name: "Dash", effect: "extra movement equal to its speed this turn" },
  dodge: { name: "Dodge", effect: "attacks against it have disadvantage and it has advantage on Dexterity saves until its next turn" },
  disengage: { name: "Disengage", effect: "its movement doesn't provoke opportunity attacks this turn" },
  hide: { name: "Hide", effect: "makes a Dexterity (Stealth) check to hide" },
  help: { name: "Help", effect: "gives an ally advantage on its next ability check or attack roll" },
};

/** Only these temperaments go after downed players (PLAN.md "Legal options"). */
const TARGETS_DOWNED: readonly Temperament[] = ["feral", "genius"];

function targetablePlayers(situation: Situation, temperament: Temperament): Situation["players"] {
  return TARGETS_DOWNED.includes(temperament) ? situation.players : situation.players.filter((p) => p.apparentHp !== "down");
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isDefined = <T>(x: T | undefined): x is T => x !== undefined;

function hardBlock(conditions: readonly Condition[]): Blocked | undefined {
  const held = HELD.filter((c) => conditions.includes(c));
  if (held.length > 0) {
    return { reason: `${held.map(capitalize).join(" and ")}: no action or bonus action, and it can't move`, movementBy: "code" };
  }
  if (conditions.includes("incapacitated")) {
    return { reason: "Incapacitated: no action or bonus action; the DM picks its movement", movementBy: "dm" };
  }
  return undefined;
}

/**
 * Feet the monster can move this turn: its fastest mode, or 0 when held, grappled or restrained.
 * The fly speed only counts when the DM hasn't ruled flying out.
 */
function movementSpeed(reviewed: ReviewedMonster, conditions: readonly Condition[], blocked: Blocked | undefined, flyingPossible: boolean): number {
  if (blocked?.movementBy === "code" || SPEED_ZERO.some((c) => conditions.includes(c))) return 0;
  const { fly, ...ground } = reviewed.speed;
  const modes = flyingPossible ? [...Object.values(ground), fly] : Object.values(ground);
  return Math.max(0, ...modes.filter(isDefined));
}

function legalMovements(speed: number, reviewed: ReviewedMonster, flyingPossible: boolean): Movement[] {
  if (speed === 0) return ["hold"];
  const canFly = flyingPossible && (reviewed.speed.fly ?? 0) > 0;
  return MovementSchema.options.filter((m) => m !== "flyUp" || canFly);
}

/** Slot levels at or above `base` with a slot left, ascending. A level with no entry has no slots. */
function slotLevelsFrom(base: number, slots: EncounterState["slots"]): number[] {
  const levels: number[] = [];
  for (let level = base; level <= 9; level++) if ((slots[String(level)] ?? 0) > 0) levels.push(level);
  return levels;
}

function isAvailable(a: Ability, state: EncounterState): boolean {
  switch (a.uses.kind) {
    case "at-will":
      return true;
    case "per-day":
      return (state.perDay[a.id] ?? 0) > 0;
    case "recharge":
      return state.recharge[a.id] === "available";
    case "slot":
      return slotLevelsFrom(a.uses.level, state.slots).length > 0;
  }
}

/** Legal reach of an attack: melee reach (5 ft. by rule when unstated) or the long range. */
function attackReach(attack: Attack): number | undefined {
  const reach = attack.reach ?? (attack.kind === "melee" ? 5 : undefined);
  const range = attack.range ? (attack.range.long ?? attack.range.normal) : undefined;
  if (reach === undefined) return range;
  return range === undefined ? reach : Math.max(reach, range);
}

type Reach = number | "noTarget" | "unknown";

function reachOf(a: Ability, byId: ReadonlyMap<string, Ability>): Reach {
  if (a.attack) return attackReach(a.attack) ?? "unknown";
  if (a.multiattack) {
    const reaches = a.multiattack
      .map((part) => byId.get(part.abilityId)?.attack)
      .filter(isDefined)
      .map(attackReach)
      .filter(isDefined);
    return reaches.length > 0 ? Math.max(...reaches) : "unknown";
  }
  const targetsPlayer = a.singleTarget || a.save !== undefined || a.area !== undefined || (a.damage?.length ?? 0) > 0;
  // Unparsed text might target someone; code can't tell, so it says so rather than guessing.
  if (!targetsPlayer) return a.parsed === "none" ? "unknown" : "noTarget";
  if (a.rangeFt !== undefined && a.rangeFt > 0) return a.rangeFt;
  // No range, or "self": a cone, line or emanation starting at the monster reaches its own size.
  if (a.area) return a.area.size;
  return "unknown";
}

function rangeFlags(reach: Reach, targetable: Situation["players"], speed: number): OptionRange {
  if (reach === "noTarget") return { kind: "noTarget" };
  if (reach === "unknown") return { kind: "unknown" };
  const inRangeNow: string[] = [];
  const inRangeAfterMove: string[] = [];
  for (const p of targetable) {
    const distance = p.distanceFt ?? ZONE_DEFAULT_FT[p.zone];
    if (distance <= reach) inRangeNow.push(p.playerId);
    if (distance - speed <= reach) inRangeAfterMove.push(p.playerId);
  }
  return { kind: "ft", ft: reach, inRangeNow, inRangeAfterMove };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function abilityOption(
  a: Ability,
  names: Record<string, string>,
  byId: ReadonlyMap<string, Ability>,
  state: EncounterState,
  targetable: Situation["players"],
  speed: number,
): Option {
  const condition = a.dependsOnAttackAction ? "; only when it takes the Attack action" : "";
  const option: Option = {
    kind: "ability",
    abilityId: a.id,
    key: a.id,
    name: a.name,
    summary: oneLine(`${a.name}: ${summarize(a, names)}${condition}`),
    usesResource: a.uses.kind !== "at-will",
    concentration: a.concentration ?? false,
    singleTarget: a.singleTarget,
    area: a.area !== undefined,
    range: rangeFlags(reachOf(a, byId), targetable, speed),
  };
  if (a.uses.kind === "slot") {
    option.leveledSpell = { baseLevel: a.uses.level, availableLevels: slotLevelsFrom(a.uses.level, state.slots) };
  }
  return option;
}

function basicOption(basic: BasicAction): Option {
  const { name, effect } = BASIC[basic];
  return {
    kind: "basic",
    basic,
    key: basic,
    name,
    summary: `${name}: ${effect}`,
    usesResource: false,
    concentration: false,
    singleTarget: false,
    area: false,
    range: { kind: "noTarget" },
  };
}

const NO_BONUS_ACTION: Option = {
  kind: "none",
  key: OPTION_NONE,
  name: "None",
  summary: "None: take no bonus action",
  usesResource: false,
  concentration: false,
  singleTarget: false,
  area: false,
  range: { kind: "noTarget" },
};

/**
 * Every action, bonus action and movement intent legal this turn, with range flags. Abilities keep
 * statblock order; each list is capped at MAX_CHOICE_OPTIONS, always keeping the basic actions and
 * `none`. The temperament decides whether downed players can be targeted (`targetableIds`).
 */
export function buildLegalOptions(reviewed: ReviewedMonster, state: EncounterState, situation: Situation, temperament: Temperament): LegalOptions {
  const blocked = hardBlock(state.conditions);
  const { flyingPossible } = situation.terrain;
  const speed = movementSpeed(reviewed, state.conditions, blocked, flyingPossible);
  const movements = legalMovements(speed, reviewed, flyingPossible);
  const targetable = targetablePlayers(situation, temperament);
  const targetableIds = targetable.map((p) => p.playerId);
  if (blocked) return { blocked, actions: [], bonusActions: [], movements, targetableIds };

  const names: Record<string, string> = {};
  const byId = new Map<string, Ability>();
  for (const a of reviewed.abilities) {
    names[a.id] = a.name;
    byId.set(a.id, a);
  }
  const available = reviewed.abilities.filter((a) => isAvailable(a, state));
  const toOption = (a: Ability) => abilityOption(a, names, byId, state, targetable, speed);

  const basics = BasicActionSchema.options.map(basicOption);
  const actions = available
    .filter((a) => a.category === "action")
    .slice(0, MAX_CHOICE_OPTIONS - basics.length)
    .map(toOption);
  const bonusActions = available
    .filter((a) => a.category === "bonus")
    .slice(0, MAX_CHOICE_OPTIONS - 1)
    .map(toOption);

  return { actions: [...actions, ...basics], bonusActions: [...bonusActions, NO_BONUS_ACTION], movements, targetableIds };
}
