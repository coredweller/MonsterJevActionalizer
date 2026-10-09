/**
 * The five recorded Jev scenarios (docs/PLAN.md "Verification", tasks.md T046). Each builds a tracker
 * from a monster fixture through the app's own pipeline (normalize → parse → extract → confirm →
 * createTracker), plus a situation. Deterministic: fixed ids and timestamps, so a rebuilt request
 * matches the recorded one byte for byte (derived fixtures rely on that).
 *
 * Used by scripts/record-jev.ts, and offline by tests/helpers/fixtures.test.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apply, createTracker } from "../../lib/encounter/state";
import { type Player, type PlayerTurn, type Situation, type Tracker, TrackerSchema } from "../../lib/encounter/types";
import { confirmReview, extractAbilities } from "../../lib/monster/extract";
import { normalize } from "../../lib/monster/normalize";
import { parseMonster } from "../../lib/monster/schema";
import type { Ability, ReviewedMonster } from "../../lib/monster/types";

export const SCENARIO_NAMES = [
  "lone-melee",
  "spread-party",
  "low-hp-retreat",
  "concentrating-caster",
  "warpriest-dual-spells",
  // Not a PLAN.md scenario: gives the bonus-action range rule (F07) a real out-of-range bonus action.
  "out-of-range-bonus",
] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface Scenario {
  readonly name: ScenarioName;
  readonly purpose: string;
  readonly tracker: Tracker;
  readonly situation: Situation;
}

const NOW = "2026-10-03T00:00:00.000Z";

/** A monster fixture through the same steps the loader UI runs. Fixtures are drift-free, so any change is an error. */
function reviewedFixture(file: string): ReviewedMonster {
  const raw: unknown = JSON.parse(readFileSync(fileURLToPath(new URL(`../monsters/${file}`, import.meta.url)), "utf8"));
  const normalized = normalize(raw, { filename: file });
  if (normalized.errors.length > 0 || normalized.changes.length > 0) {
    throw new Error(`${file}: expected a drift-free fixture, got ${normalized.errors.length} errors and ${normalized.changes.length} changes`);
  }
  const parsed = parseMonster(normalized.fixed);
  if (!parsed.success) throw new Error(`${file}: does not parse after normalize`);
  return confirmReview(extractAbilities(parsed.data), NOW);
}

function abilityNamed(reviewed: ReviewedMonster, name: string): Ability {
  const found = reviewed.abilities.find((a) => a.name === name);
  if (!found) throw new Error(`No ability "${name}" on ${reviewed.monster.body.CharacterName}`);
  return found;
}

const hero = (id: string, name: string, role: Player["role"], cls: string, ac: number): Player => ({ id, name, role, class: cls, ac });

const turn = (playerId: string, zone: PlayerTurn["zone"], extra: Partial<PlayerTurn> = {}): PlayerTurn => ({
  playerId,
  zone,
  apparentHp: "healthy",
  conditions: [],
  cover: "none",
  hitMonsterLastRound: false,
  clusteredWith: [],
  ...extra,
});

const situation = (players: PlayerTurn[], terrain: Partial<Situation["terrain"]> = {}, notes = ""): Situation => ({
  players,
  allies: { present: false, count: 0 },
  terrain: { difficult: false, chokepoint: false, escapeRoute: false, flyingPossible: false, ...terrain },
  notes,
});

/** A fresh tracker for `file` with this roster and situation, before any scenario edits. */
function start(name: ScenarioName, file: string, roster: Player[], s: Situation): Tracker {
  return { ...createTracker(reviewedFixture(file), `scenario-${name}`, NOW), roster, situation: s };
}

function build(name: ScenarioName): Omit<Scenario, "name"> {
  switch (name) {
    case "lone-melee": {
      const s = situation([turn("brakka", "engaged")]);
      return {
        purpose: "A lone player engaged in melee with a Tunnel Wasp.",
        tracker: start(name, "TunnelWasp.CR5.2014.json", [hero("brakka", "Brakka", "melee", "Fighter", 18)], s),
        situation: s,
      };
    }
    case "spread-party": {
      const s = situation([
        turn("wren", "far", { apparentHp: "down" }),
        turn("kell", "near", { distanceFt: 25, clusteredWith: ["iso"], hitMonsterLastRound: true }),
        turn("iso", "near", { clusteredWith: ["kell"] }),
        turn("bree", "far", { distanceFt: 50, cover: "half" }),
      ]);
      const roster = [
        hero("wren", "Wren", "caster", "Wizard", 12),
        hero("kell", "Kell", "melee", "Paladin", 18),
        hero("iso", "Iso", "ranged", "Ranger", 15),
        hero("bree", "Bree", "healer", "Cleric", 16),
      ];
      return {
        purpose: "A spread-out party with a downed caster and two clustered players: expect a cluster pick for an area effect.",
        tracker: start(name, "MaestroDrazzuk.CR10.2014.json", roster, s),
        situation: s,
      };
    }
    case "low-hp-retreat": {
      const s = situation(
        [turn("brakka", "engaged", { hitMonsterLastRound: true }), turn("sefa", "engaged", { hitMonsterLastRound: true }), turn("lio", "near")],
        { escapeRoute: true },
        "A door behind the enforcer leads out to the street.",
      );
      const roster = [hero("brakka", "Brakka", "melee", "Fighter", 18), hero("sefa", "Sefa", "melee", "Rogue", 15), hero("lio", "Lio", "caster", "Sorcerer", 13)];
      const fresh = start(name, "TieflingEnforcer.CR6.2014.json", roster, s);
      // No setHp reducer yet (T060): HP and morale are set directly and the tracker is schema-checked below.
      return {
        purpose: "A Tiefling Enforcer at low HP with cowardly morale and an escape route: expect a retreat.",
        tracker: { ...fresh, state: { ...fresh.state, hp: 14 }, settings: { ...fresh.settings, morale: 10 } },
        situation: s,
      };
    }
    case "concentrating-caster": {
      const s = situation([turn("brakka", "engaged"), turn("lio", "near", { clusteredWith: ["sefa"] }), turn("sefa", "near", { apparentHp: "bloodied" })]);
      const roster = [hero("brakka", "Brakka", "melee", "Fighter", 18), hero("lio", "Lio", "caster", "Sorcerer", 13), hero("sefa", "Sefa", "melee", "Rogue", 15)];
      const fresh = start(name, "MaestroDrazzuk.CR10.2014.json", roster, s);
      // Last round it cast Suggestion on Brakka, through the real apply reducer (spends the slot, sets concentration, logs the turn).
      const suggestion = abilityNamed(fresh.reviewed, "Suggestion");
      const cast = apply(fresh, {
        moveBefore: "hold",
        action: { key: suggestion.id, name: suggestion.name, abilityId: suggestion.id, targetIds: ["brakka"], slotLevel: 2 },
        bonusAction: null,
        moveAfter: "hold",
        situation: s,
        recommended: true,
      });
      // No startTurn reducer yet (T060): this is round 2.
      return {
        purpose: "Maestro Drazzuk already concentrating on Suggestion, with leveled concentration spells available: check the warning and slot level.",
        tracker: { ...cast, state: { ...cast.state, round: cast.state.round + 1 } },
        situation: s,
      };
    }
    case "out-of-range-bonus": {
      // Maestro moves 30 ft.; Unsettling Words reaches 60 ft. At 70–90 ft. nobody is in its range now,
      // but everyone is after closing in. Hypnotic Pattern (120 ft.) reaches everyone without moving.
      const s = situation([
        turn("brakka", "veryFar", { distanceFt: 70 }),
        turn("lio", "veryFar", { distanceFt: 80, clusteredWith: ["sefa"] }),
        turn("sefa", "veryFar", { distanceFt: 90 }),
      ]);
      const roster = [hero("brakka", "Brakka", "melee", "Fighter", 18), hero("lio", "Lio", "caster", "Sorcerer", 13), hero("sefa", "Sefa", "melee", "Rogue", 15)];
      return {
        purpose: "Maestro Drazzuk with the whole party 70–90 ft. away: Unsettling Words (60 ft.) reaches nobody without closing in first.",
        tracker: start(name, "MaestroDrazzuk.CR10.2014.json", roster, s),
        situation: s,
      };
    }
    case "warpriest-dual-spells": {
      const s = situation([turn("brakka", "engaged"), turn("sefa", "engaged"), turn("lio", "near")]);
      const roster = [hero("brakka", "Brakka", "melee", "Fighter", 18), hero("sefa", "Sefa", "melee", "Rogue", 15), hero("lio", "Lio", "caster", "Sorcerer", 13)];
      return {
        purpose: "The Ashen Warpriest at full slots with leveled spells as both action and bonus action: expect at most one leveled spell, and War Priest only after an attack.",
        tracker: start(name, "AshenWarpriest.CR5.2014.json", roster, s),
        situation: s,
      };
    }
  }
}

export function buildScenario(name: ScenarioName): Scenario {
  const { purpose, tracker, situation: s } = build(name);
  // Throws if a scenario edit left the tracker invalid.
  return { name, purpose, tracker: TrackerSchema.parse(tracker), situation: s };
}

export function buildScenarios(): Scenario[] {
  return SCENARIO_NAMES.map(buildScenario);
}

export const isScenarioName = (s: string): s is ScenarioName => (SCENARIO_NAMES as readonly string[]).includes(s);
