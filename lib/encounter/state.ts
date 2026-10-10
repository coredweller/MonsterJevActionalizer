/**
 * Encounter reducers. All pure: ids, timestamps and randomness are parameters.
 */
import type { ReviewedMonster } from "../monster/types";
import type {
  ApplyChoice,
  ChosenOption,
  EncounterState,
  Player,
  PlayerTurn,
  Settings,
  Situation,
  Temperament,
  Tracker,
  TurnLogEntry,
} from "./types";

export function suggestTemperament(int: number): Temperament {
  if (int <= 3) return "mindless";
  if (int <= 7) return "feral";
  if (int <= 13) return "cunning";
  return "genius";
}

export const DEFAULT_MORALE = 50;

/** Flying is assumed possible; the DM ticks "Flying not possible" for a low ceiling and the like (F29). */
export function blankSituation(): Situation {
  return {
    players: [],
    allies: { present: false, count: 0 },
    terrain: { difficult: false, chokepoint: false, escapeRoute: false, flyingPossible: true },
    notes: "",
  };
}

/** The row a newly added player starts with: near, healthy, in the open, not clustered. */
export function defaultPlayerTurn(playerId: string): PlayerTurn {
  return { playerId, zone: "near", apparentHp: "healthy", conditions: [], cover: "none", hitMonsterLastRound: false, clusteredWith: [] };
}

/** Each player's cluster links with self links, unknown ids and duplicates dropped, then mirrored so every link goes both ways. */
function symmetricLinks(players: readonly PlayerTurn[]): Map<string, Set<string>> {
  const linked = new Map(players.map((p) => [p.playerId, new Set<string>()]));
  for (const p of players) {
    for (const other of p.clusteredWith) {
      if (other === p.playerId || !linked.has(other)) continue;
      linked.get(p.playerId)?.add(other);
      linked.get(other)?.add(p.playerId);
    }
  }
  return linked;
}

/** Writes the links back in situation order, so the lists are stable whichever way a link was added. */
function withLinks(players: readonly PlayerTurn[], linked: Map<string, Set<string>>): PlayerTurn[] {
  return players.map((p) => ({ ...p, clusteredWith: players.filter((o) => linked.get(p.playerId)?.has(o.playerId)).map((o) => o.playerId) }));
}

/**
 * The situation with one row per roster player, in roster order: carried-over rows are kept,
 * new players get `defaultPlayerTurn`, removed players' rows are dropped. "Clustered with" means
 * standing together, so it is kept symmetric and only names players on the roster.
 */
export function syncSituation(situation: Situation, roster: readonly Player[]): Situation {
  const byId = new Map(situation.players.map((p) => [p.playerId, p]));
  const players = roster.map((r) => byId.get(r.id) ?? defaultPlayerTurn(r.id));
  return { ...situation, players: withLinks(players, symmetricLinks(players)) };
}

/**
 * Replaces one player's row. Its `clusteredWith` is authoritative for that player's links: each
 * listed player gains the link back and each unlisted one loses it. Links between other players
 * are untouched. Throws for a player not in the situation (sync with the roster first).
 */
export function updatePlayerTurn(situation: Situation, turn: PlayerTurn): Situation {
  const id = turn.playerId;
  if (!situation.players.some((p) => p.playerId === id)) throw new Error(`updatePlayerTurn: player "${id}" is not in the situation`);
  const players = situation.players.map((p) => (p.playerId === id ? turn : p));
  const linked = symmetricLinks(players.map((p) => (p.playerId === id ? p : { ...p, clusteredWith: p.clusteredWith.filter((o) => o !== id) })));
  return { ...situation, players: withLinks(players, linked) };
}

export function legendaryActionMax(reviewed: ReviewedMonster): number {
  const { monster } = reviewed;
  return monster.kind === "legendary" ? Number(monster.body.LegendaryActions["Legendary Action Uses"]) : 0;
}

const LEGENDARY_RESISTANCE = /Legendary Resistance\s*\((\d+)\s*\/\s*Day/i;

/**
 * Legendary Resistance uses from a "Legendary Resistance (N/Day)" trait name. 2024's
 * "(3/Day, or 4/Day in Lair)" gives the base 3. No trait → 0: it is never invented.
 */
export function legendaryResistanceMax(reviewed: ReviewedMonster): number {
  const body = reviewed.monster.body;
  const names = [
    ...Object.keys(body.SpecialTraits),
    ...(reviewed.monster.kind === "legendary" ? Object.keys(reviewed.monster.body.LegendaryTraits) : []),
  ];
  for (const name of names) {
    const m = LEGENDARY_RESISTANCE.exec(name);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** Daily uses per ability. Legendary Resistance is tracked on its own counter, not here. */
export function perDayMax(reviewed: ReviewedMonster): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of reviewed.abilities) if (a.uses.kind === "per-day" && !/^Legendary Resistance\b/i.test(a.name)) out[a.id] = a.uses.max;
  return out;
}

export function slotMax(reviewed: ReviewedMonster): Record<string, number> {
  return { ...(reviewed.spellcasting?.slots ?? {}) };
}

/** Encounter state with every resource at its maximum, round 1. */
export function freshState(reviewed: ReviewedMonster): EncounterState {
  const recharge: EncounterState["recharge"] = {};
  for (const a of reviewed.abilities) if (a.uses.kind === "recharge") recharge[a.id] = "available";
  return {
    hp: reviewed.hpMax,
    hpMax: reviewed.hpMax,
    slots: slotMax(reviewed),
    perDay: perDayMax(reviewed),
    recharge,
    legendaryActionsLeft: legendaryActionMax(reviewed),
    legendaryResistanceLeft: legendaryResistanceMax(reviewed),
    conditions: [],
    concentration: null,
    round: 1,
  };
}

export function defaultSettings(reviewed: ReviewedMonster): Settings {
  return { temperament: suggestTemperament(reviewed.intScore), morale: DEFAULT_MORALE, rechargeMode: "auto" };
}

export function createTracker(reviewed: ReviewedMonster, id: string, now: string): Tracker {
  return {
    id,
    name: reviewed.monster.body.CharacterName,
    reviewed,
    state: freshState(reviewed),
    roster: [],
    situation: blankSituation(),
    log: [],
    settings: defaultSettings(reviewed),
    createdAt: now,
  };
}

/**
 * State after using one chosen action or bonus action: spends its slot (at the level the DM
 * chose), daily use or recharge, never below 0, and sets concentration for a concentration spell
 * (replacing any current one). Throws when the choice doesn't fit the monster, since spending
 * the wrong resource silently would corrupt the tracker.
 */
function spend(state: EncounterState, reviewed: ReviewedMonster, chosen: ChosenOption | null): EncounterState {
  if (chosen === null) return state;
  if (chosen.abilityId === null) {
    if (chosen.slotLevel !== undefined) throw new Error(`apply: slot level given for basic action "${chosen.name}"`);
    return state;
  }
  const ability = reviewed.abilities.find((a) => a.id === chosen.abilityId);
  if (!ability) throw new Error(`apply: the monster has no ability "${chosen.abilityId}"`);
  const { uses } = ability;
  if (uses.kind !== "slot" && chosen.slotLevel !== undefined) {
    throw new Error(`apply: slot level given for "${ability.name}", which doesn't use spell slots`);
  }

  const next: EncounterState = { ...state };
  switch (uses.kind) {
    case "at-will":
      break;
    case "per-day": {
      const left = state.perDay[ability.id];
      if (left === undefined) throw new Error(`apply: no daily-use counter for "${ability.name}"`);
      next.perDay = { ...state.perDay, [ability.id]: Math.max(0, left - 1) };
      break;
    }
    case "recharge":
      next.recharge = { ...state.recharge, [ability.id]: "spent" };
      break;
    case "slot": {
      const level = chosen.slotLevel;
      if (level === undefined || level < uses.level) {
        throw new Error(`apply: "${ability.name}" needs a slot level of ${uses.level} or higher`);
      }
      const left = state.slots[String(level)];
      if (left === undefined) throw new Error(`apply: the monster has no level ${level} spell slots`);
      next.slots = { ...state.slots, [String(level)]: Math.max(0, left - 1) };
      break;
    }
    default: {
      const unreachable: never = uses;
      return unreachable;
    }
  }
  if (ability.concentration) next.concentration = { abilityId: ability.id, name: ability.name };
  return next;
}

/**
 * Applies what the DM actually chose (never the recommendation): spends resources, updates
 * concentration, pushes a turn-log entry for the current round and carries the situation forward.
 * HP and the round are untouched: damage is a manual edit and the round advances in `startTurn`.
 */
export function apply(tracker: Tracker, choice: ApplyChoice): Tracker {
  const { action, bonusAction } = choice;
  const state = spend(spend(tracker.state, tracker.reviewed, action), tracker.reviewed, bonusAction);

  const entry: TurnLogEntry = {
    round: tracker.state.round,
    moveBefore: choice.moveBefore,
    actionId: action?.key ?? null,
    actionName: action?.name ?? "None",
    targetIds: action?.targetIds ?? [],
    bonusActionId: bonusAction?.key ?? null,
    bonusActionName: bonusAction?.name ?? "None",
    bonusTargetIds: bonusAction?.targetIds ?? [],
    moveAfter: choice.moveAfter,
    recommended: choice.recommended,
  };
  if (action?.clusterId !== undefined) entry.clusterId = action.clusterId;
  if (action?.slotLevel !== undefined) entry.slotLevel = action.slotLevel;
  if (bonusAction?.slotLevel !== undefined) entry.bonusSlotLevel = bonusAction.slotLevel;

  return { ...tracker, state, situation: choice.situation, log: [...tracker.log, entry] };
}
