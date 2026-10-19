import { describe, expect, it, vi } from "vitest";
import {
  apply,
  createTracker,
  recordResult,
  setConcentration,
  setConditions,
  setHp,
  setLegendary,
  setPerDay,
  setRecharge,
  setSettings,
  setSlots,
  startTurn,
} from "@/lib/encounter/state";
import { TrackerSchema, type ApplyChoice, type Tracker } from "@/lib/encounter/types";
import { ability, handReviewed, slots } from "../helpers/reviewed";

const NOW = "2026-10-12T12:00:00.000Z";

/** A general monster with every kind of resource: two recharge abilities, a daily use and slots. */
const warpriest = handReviewed(
  "AshenWarpriest",
  [
    ability({ id: "act_mace", name: "Mace" }),
    ability({ id: "act_ash_burst", name: "Ash Burst", uses: { kind: "recharge", min: 5 }, singleTarget: false }),
    ability({ id: "act_cinder_ward", name: "Cinder Ward", uses: { kind: "per-day", max: 2 } }),
    ability({ id: "act_ember_roar", name: "Ember Roar", uses: { kind: "recharge", min: 6 }, singleTarget: false }),
    ability({ id: "spl_hold_person", name: "Hold Person", source: "Spellcasting", uses: { kind: "slot", level: 2 }, spellLevel: 2, concentration: true }),
  ],
  { spellcasting: slots({ "1": 4, "2": 3 }), hpMax: 60 },
);

/** A legendary monster: 3 legendary actions and Legendary Resistance (3/Day) from its statblock. */
const hag = handReviewed("BriarthornHag", [ability({ id: "act_thorn_lash", name: "Thorn Lash" })]);

const general = (): Tracker => createTracker(warpriest, "t1", NOW);
const legendary = (): Tracker => createTracker(hag, "t2", NOW);

/** An rng that returns these values in order and fails the test if called once more. */
function rngOf(...values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i++];
    if (value === undefined) throw new Error(`rng called ${i} times, expected ${values.length}`);
    return value;
  };
}

const withState = (t: Tracker, state: Partial<Tracker["state"]>): Tracker => ({ ...t, state: { ...t.state, ...state } });
const bothSpent = (t: Tracker): Tracker => withState(t, { recharge: { act_ash_burst: "spent", act_ember_roar: "spent" } });
const manual = (t: Tracker): Tracker => ({ ...t, settings: { ...t.settings, rechargeMode: "manual" } });

describe("startTurn", () => {
  it("moves the round on and leaves the log and situation alone", () => {
    const before = general();
    const { tracker } = startTurn(before, rngOf());
    expect(tracker.state.round).toBe(2);
    expect(tracker.log).toBe(before.log);
    expect(tracker.situation).toBe(before.situation);
    expect(before.state.round).toBe(1);
  });

  it("auto mode: rolls 1 + floor(rng * 6) per spent recharge ability, in ability order, and recharges on roll ≥ min", () => {
    // 0.7 → 5: Ash Burst (5–6) recharges, Ember Roar (6) doesn't.
    const { tracker, rolls } = startTurn(bothSpent(general()), rngOf(0.7, 0.7));
    expect(rolls).toEqual([
      { abilityId: "act_ash_burst", name: "Ash Burst", roll: 5, min: 5, recharged: true },
      { abilityId: "act_ember_roar", name: "Ember Roar", roll: 5, min: 6, recharged: false },
    ]);
    expect(tracker.state.recharge).toEqual({ act_ash_burst: "available", act_ember_roar: "spent" });
  });

  it("auto mode: the d6 runs 1 to 6", () => {
    const { rolls } = startTurn(bothSpent(general()), rngOf(0, 0.9999));
    expect(rolls.map((r) => r.roll)).toEqual([1, 6]);
    expect(rolls.map((r) => r.recharged)).toEqual([false, true]);
  });

  it("auto mode: an available recharge ability isn't rolled", () => {
    const t = withState(general(), { recharge: { act_ash_burst: "available", act_ember_roar: "spent" } });
    const { tracker, rolls } = startTurn(t, rngOf(0.9999));
    expect(rolls).toEqual([{ abilityId: "act_ember_roar", name: "Ember Roar", roll: 6, min: 6, recharged: true }]);
    expect(tracker.state.recharge).toEqual({ act_ash_burst: "available", act_ember_roar: "available" });
  });

  it("manual mode: makes no rolls and leaves recharge as it is", () => {
    const rng = vi.fn(() => 0.9999);
    const { tracker, rolls } = startTurn(manual(bothSpent(general())), rng);
    expect(rng).not.toHaveBeenCalled();
    expect(rolls).toEqual([]);
    expect(tracker.state.recharge).toEqual({ act_ash_burst: "spent", act_ember_roar: "spent" });
    expect(tracker.state.round).toBe(2);
  });

  it.each([
    ["auto", (t: Tracker) => t],
    ["manual", manual],
  ])("%s mode: refills legendary actions but not Legendary Resistance", (_mode, mode) => {
    const t = mode(withState(legendary(), { legendaryActionsLeft: 0, legendaryResistanceLeft: 1 }));
    const { tracker } = startTurn(t, rngOf());
    expect(tracker.state.legendaryActionsLeft).toBe(3);
    expect(tracker.state.legendaryResistanceLeft).toBe(1);
  });

  it("a general monster keeps 0 legendary actions", () => {
    expect(startTurn(general(), rngOf()).tracker.state.legendaryActionsLeft).toBe(0);
  });
});

describe("recordResult", () => {
  const mace: ApplyChoice = {
    moveBefore: "hold",
    action: { key: "act_mace", name: "Mace", abilityId: "act_mace", targetIds: [] },
    bonusAction: null,
    moveAfter: "hold",
    situation: general().situation,
    recommended: true,
  };
  const twoTurns = (): Tracker => apply(apply(general(), mace), mace);

  it("sets the result on entry i only", () => {
    const t = recordResult(twoTurns(), 0, "hit");
    expect(t.log[0]?.result).toBe("hit");
    expect(t.log[1]?.result).toBeUndefined();
  });

  it("sets a note with the result, and an empty note removes it", () => {
    const noted = recordResult(twoTurns(), 1, "downed", "dropped the cleric");
    expect(noted.log[1]).toMatchObject({ result: "downed", note: "dropped the cleric" });
    const cleared = recordResult(noted, 1, "downed", "");
    expect(cleared.log[1]).not.toHaveProperty("note");
  });

  it("leaving the note out keeps the current one", () => {
    const t = recordResult(recordResult(twoTurns(), 0, "hit", "flanked"), 0, "miss");
    expect(t.log[0]).toMatchObject({ result: "miss", note: "flanked" });
  });

  it("an undefined result clears it", () => {
    const t = recordResult(recordResult(twoTurns(), 0, "miss"), 0, undefined);
    expect(t.log[0]).not.toHaveProperty("result");
  });

  it("does not change the tracker it was given", () => {
    const before = twoTurns();
    recordResult(before, 0, "hit");
    expect(before.log[0]?.result).toBeUndefined();
  });

  it.each([-1, 2])("throws for a log entry that doesn't exist (%i)", (i) => {
    expect(() => recordResult(twoTurns(), i, "hit")).toThrow(new RegExp(`log entry ${i}`));
  });
});

describe("manual edits clamp to [0, max]", () => {
  it.each([
    [30, 30],
    [-5, 0],
    [999, 60],
  ])("setHp(%i) → %i", (hp, expected) => {
    expect(setHp(general(), hp).state.hp).toBe(expected);
  });

  it.each([
    [1, 2, { "1": 2, "2": 3 }],
    [2, 99, { "1": 4, "2": 3 }],
    [2, -1, { "1": 4, "2": 0 }],
  ])("setSlots(level %i, %i)", (level, n, expected) => {
    expect(setSlots(general(), level, n).state.slots).toEqual(expected);
  });

  it("setSlots throws for a slot level the monster doesn't have", () => {
    expect(() => setSlots(general(), 5, 1)).toThrow(/level 5/);
  });

  it.each([
    [1, 1],
    [5, 2],
    [-1, 0],
  ])("setPerDay(%i) → %i", (n, expected) => {
    expect(setPerDay(general(), "act_cinder_ward", n).state.perDay).toEqual({ act_cinder_ward: expected });
  });

  it("setPerDay throws for an ability without daily uses", () => {
    expect(() => setPerDay(general(), "act_mace", 1)).toThrow(/act_mace/);
  });

  it("setLegendary clamps each counter it's given and leaves the other alone", () => {
    const t = setLegendary(legendary(), { actions: 9 });
    expect(t.state).toMatchObject({ legendaryActionsLeft: 3, legendaryResistanceLeft: 3 });
    expect(setLegendary(t, { resistance: -1 }).state).toMatchObject({ legendaryActionsLeft: 3, legendaryResistanceLeft: 0 });
    expect(setLegendary(t, { actions: 1, resistance: 2 }).state).toMatchObject({ legendaryActionsLeft: 1, legendaryResistanceLeft: 2 });
  });

  it("setLegendary on a general monster stays at 0", () => {
    expect(setLegendary(general(), { actions: 2, resistance: 2 }).state).toMatchObject({ legendaryActionsLeft: 0, legendaryResistanceLeft: 0 });
  });

  it("edits don't change the tracker they were given", () => {
    const before = general();
    setHp(before, 1);
    setSlots(before, 1, 0);
    expect(before.state).toMatchObject({ hp: 60, slots: { "1": 4, "2": 3 } });
  });
});

describe("manual edits without a range", () => {
  it("setRecharge marks a recharge ability spent or available", () => {
    const spent = setRecharge(general(), "act_ash_burst", "spent");
    expect(spent.state.recharge).toEqual({ act_ash_burst: "spent", act_ember_roar: "available" });
    expect(setRecharge(spent, "act_ash_burst", "available").state.recharge.act_ash_burst).toBe("available");
  });

  it("setRecharge throws for an ability without a recharge", () => {
    expect(() => setRecharge(general(), "act_mace", "spent")).toThrow(/act_mace/);
  });

  it("setConditions replaces the list and drops duplicates", () => {
    const t = setConditions(general(), ["prone", "grappled", "prone"]);
    expect(t.state.conditions).toEqual(["prone", "grappled"]);
    expect(setConditions(t, []).state.conditions).toEqual([]);
  });

  it("setConcentration sets and clears concentration", () => {
    const t = setConcentration(general(), { abilityId: "spl_hold_person", name: "Hold Person" });
    expect(t.state.concentration).toEqual({ abilityId: "spl_hold_person", name: "Hold Person" });
    expect(setConcentration(t, null).state.concentration).toBeNull();
  });

  it("setConcentration throws for an ability the monster doesn't have", () => {
    expect(() => setConcentration(general(), { abilityId: "spl_bless", name: "Bless" })).toThrow(/spl_bless/);
  });
});

describe("setSettings", () => {
  // The warpriest's INT suggests "cunning"; the defaults are cunning, morale 50, auto recharge.
  it.each([
    [{ temperament: "feral" as const }, { temperament: "feral", morale: 50, rechargeMode: "auto" }],
    [{ morale: 20 }, { temperament: "cunning", morale: 20, rechargeMode: "auto" }],
    [{ rechargeMode: "manual" as const }, { temperament: "cunning", morale: 50, rechargeMode: "manual" }],
  ])("sets %o and keeps the other settings", (patch, expected) => {
    expect(general().settings).toEqual({ temperament: "cunning", morale: 50, rechargeMode: "auto" });
    expect(setSettings(general(), patch).settings).toEqual(expected);
  });

  it("sets several settings at once", () => {
    expect(setSettings(general(), { temperament: "genius", morale: 90, rechargeMode: "manual" }).settings).toEqual({
      temperament: "genius",
      morale: 90,
      rechargeMode: "manual",
    });
  });

  it.each([
    [-10, 0],
    [0, 0],
    [100, 100],
    [150, 100],
    [33.4, 33],
    [66.5, 67],
  ])("morale %d is stored as %i", (morale, expected) => {
    expect(setSettings(general(), { morale }).settings.morale).toBe(expected);
  });

  it("the result still passes TrackerSchema", () => {
    const t = setSettings(general(), { temperament: "mindless", morale: 12.7, rechargeMode: "manual" });
    expect(TrackerSchema.safeParse(t).success).toBe(true);
  });

  it("touches nothing but the settings, and doesn't change the tracker it was given", () => {
    const before = general();
    const after = setSettings(before, { morale: 5 });
    expect(before.settings).toEqual({ temperament: "cunning", morale: 50, rechargeMode: "auto" });
    expect(after.state).toBe(before.state);
    expect(after.log).toBe(before.log);
    expect(after.situation).toBe(before.situation);
    expect({ ...after, settings: before.settings }).toEqual(before);
  });
});
