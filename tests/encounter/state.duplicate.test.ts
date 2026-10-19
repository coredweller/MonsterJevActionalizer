import { describe, expect, it } from "vitest";
import {
  apply,
  blankSituation,
  createTracker,
  duplicate,
  freshState,
  setConditions,
  setHp,
  setLegendary,
  setPerDay,
  setRecharge,
  startTurn,
  syncSituation,
  updatePlayerTurn,
} from "@/lib/encounter/state";
import { TrackerSchema, type Player, type Tracker } from "@/lib/encounter/types";
import { ability, handReviewed, playerTurn, slots } from "../helpers/reviewed";

const CREATED = "2026-10-03T12:00:00.000Z";
const NOW = "2026-10-17T12:00:00.000Z";

/** A legendary monster with every kind of resource: a recharge, a daily use, slots and a concentration spell. */
const hag = handReviewed(
  "BriarthornHag",
  [
    ability({ id: "act_thorn_lash", name: "Thorn Lash" }),
    ability({ id: "act_bramble_burst", name: "Bramble Burst", uses: { kind: "recharge", min: 5 }, singleTarget: false }),
    ability({ id: "act_hex_ward", name: "Hex Ward", uses: { kind: "per-day", max: 2 } }),
    ability({ id: "spl_hold_person", name: "Hold Person", source: "Spellcasting", uses: { kind: "slot", level: 2 }, spellLevel: 2, concentration: true }),
  ],
  { spellcasting: slots({ "1": 4, "2": 3 }), hpMax: 90 },
);

const ROSTER: Player[] = [
  { id: "p1", name: "Lio", role: "melee", class: "Fighter", ac: 18 },
  { id: "p2", name: "Sefa", role: "caster", class: "Wizard" },
];

/** A tracker mid-fight: damaged, spent, concentrating, frightened, on round 2, with a log and a filled-in situation. */
function damaged(): Tracker {
  const base = createTracker(hag, "src", CREATED);
  const synced = syncSituation(blankSituation(), ROSTER);
  const situation = {
    ...updatePlayerTurn(synced, playerTurn({ playerId: "p1", apparentHp: "bloodied", hitMonsterLastRound: true, clusteredWith: ["p2"] })),
    allies: { present: true, count: 2 },
    terrain: { difficult: true, chokepoint: true, escapeRoute: true, flyingPossible: false },
    notes: "collapsing bridge",
  };
  const set = { ...base, roster: ROSTER, situation, settings: { temperament: "genius", morale: 20, rechargeMode: "manual" } as const };
  const cast = apply(set, {
    moveBefore: "hold",
    action: { key: "spl_hold_person", name: "Hold Person", abilityId: "spl_hold_person", targetIds: ["p1"], slotLevel: 2 },
    bonusAction: null,
    moveAfter: "retreat",
    situation,
    recommended: true,
  });
  const next = startTurn(cast, () => {
    throw new Error("manual recharge mode must not roll");
  }).tracker;
  const spent = setRecharge(setPerDay(setHp(next, 12), "act_hex_ward", 0), "act_bramble_burst", "spent");
  return setLegendary(setConditions(spent, ["frightened"]), { actions: 1, resistance: 1 });
}

describe("duplicate", () => {
  const source = damaged();

  it("starts from a source that really is mid-fight", () => {
    expect(source.state).toMatchObject({
      hp: 12,
      round: 2,
      slots: { "1": 4, "2": 2 },
      perDay: { act_hex_ward: 0 },
      recharge: { act_bramble_burst: "spent" },
      legendaryActionsLeft: 1,
      legendaryResistanceLeft: 1,
      conditions: ["frightened"],
      concentration: { abilityId: "spl_hold_person", name: "Hold Person" },
    });
    expect(source.log).toHaveLength(1);
    expect(source.situation.notes).toBe("collapsing bridge");
  });

  it("keeps the statblock, roster and settings", () => {
    const copy = duplicate(source, ["Briarthorn Hag"], "copy", NOW);
    expect(copy.reviewed).toEqual(source.reviewed);
    expect(copy.roster).toEqual(ROSTER);
    expect(copy.settings).toEqual({ temperament: "genius", morale: 20, rechargeMode: "manual" });
  });

  it("takes its id and createdAt from the arguments", () => {
    const copy = duplicate(source, ["Briarthorn Hag"], "copy", NOW);
    expect(copy.id).toBe("copy");
    expect(copy.createdAt).toBe(NOW);
  });

  it("resets the state: full HP and resources, no conditions or concentration, round 1", () => {
    const copy = duplicate(source, ["Briarthorn Hag"], "copy", NOW);
    expect(copy.state).toEqual(freshState(hag));
    expect(copy.state).toMatchObject({ hp: 90, round: 1, legendaryActionsLeft: 3, legendaryResistanceLeft: 3, concentration: null });
  });

  it("empties the log", () => {
    expect(duplicate(source, ["Briarthorn Hag"], "copy", NOW).log).toEqual([]);
  });

  it("resets the situation to one default row per roster player, in roster order", () => {
    const copy = duplicate(source, ["Briarthorn Hag"], "copy", NOW);
    expect(copy.situation).toEqual(syncSituation(blankSituation(), ROSTER));
    expect(copy.situation.players.map((p) => p.playerId)).toEqual(["p1", "p2"]);
  });

  it("is a valid tracker", () => {
    expect(TrackerSchema.safeParse(duplicate(source, ["Briarthorn Hag"], "copy", NOW)).success).toBe(true);
  });

  it("does not mutate the source tracker", () => {
    const start = damaged();
    const snapshot = structuredClone(start);
    duplicate(start, ["Briarthorn Hag"], "copy", NOW);
    expect(start).toEqual(snapshot);
  });

  it.each([
    ["Goblin", [], "Goblin 2"],
    ["Goblin", ["Goblin"], "Goblin 2"],
    ["Goblin", ["Goblin", "Goblin 2"], "Goblin 3"],
    ["Goblin 2", ["Goblin", "Goblin 2"], "Goblin 3"],
    ["Goblin", ["Goblin", "Goblin 3"], "Goblin 2"],
    ["Goblin", ["Goblin", "goblin 2"], "Goblin 2"],
    ["Hill Giant 12", ["Hill Giant 12"], "Hill Giant 2"],
    ["Goblin 2 Boss", ["Goblin 2 Boss"], "Goblin 2 Boss 2"],
    ["Goblin2", ["Goblin2"], "Goblin2 2"],
  ] as const)("names %s with %j taken → %s", (name, existingNames, expected) => {
    expect(duplicate({ ...source, name }, existingNames, "copy", NOW).name).toBe(expected);
  });
});
