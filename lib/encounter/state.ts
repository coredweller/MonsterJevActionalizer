/**
 * Encounter reducers. All pure: ids, timestamps and randomness are parameters.
 */
import type { ReviewedMonster } from "../monster/types";
import type { EncounterState, Settings, Situation, Temperament, Tracker } from "./types";

export function suggestTemperament(int: number): Temperament {
  if (int <= 3) return "mindless";
  if (int <= 7) return "feral";
  if (int <= 13) return "cunning";
  return "genius";
}

export const DEFAULT_MORALE = 50;

export function blankSituation(): Situation {
  return {
    players: [],
    allies: { present: false, count: 0 },
    terrain: { difficult: false, chokepoint: false, escapeRoute: false, flyingPossible: false },
    notes: "",
  };
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
