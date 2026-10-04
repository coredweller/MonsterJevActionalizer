import { describe, expect, it } from "vitest";
import { apply, createTracker } from "@/lib/encounter/state";
import { ApplyChoiceSchema, TrackerSchema, TurnLogEntrySchema, type ApplyChoice, type Situation, type Tracker } from "@/lib/encounter/types";
import type { Ability } from "@/lib/monster/types";
import { ability, handReviewed } from "../helpers/reviewed";

const NOW = "2026-10-03T12:00:00.000Z";

const spell = (id: string, name: string, level: number, extra: Partial<Ability> = {}) =>
  ability({ id, name, source: "Spellcasting", uses: { kind: "slot", level }, spellLevel: level, known: true, ...extra });

const reviewed = handReviewed(
  "AshenWarpriest",
  [
    ability({ id: "act_mace", name: "Mace" }),
    ability({ id: "act_ash_burst", name: "Ash Burst", uses: { kind: "recharge", min: 5 }, singleTarget: false }),
    ability({ id: "act_cinder_ward", name: "Cinder Ward", uses: { kind: "per-day", max: 2 } }),
    ability({ id: "trt_ash_step", name: "Ash Step", source: "SpecialTraits", category: "bonus", singleTarget: false }),
    spell("spl_guiding_bolt", "Guiding Bolt", 1),
    spell("spl_hold_person", "Hold Person", 2, { concentration: true }),
    spell("spl_spirit_guardians", "Spirit Guardians", 3, { concentration: true, singleTarget: false }),
    spell("spl_spiritual_weapon", "Spiritual Weapon", 2, { category: "bonus" }),
    spell("spl_shield_of_faith", "Shield of Faith", 1, { category: "bonus", concentration: true, singleTarget: false }),
  ],
  { spellcasting: { slots: { "1": 4, "2": 3, "3": 2 }, spells: [] }, hpMax: 60 },
);

const fresh = (): Tracker => createTracker(reviewed, "t1", NOW);

const SITUATION: Situation = {
  players: [
    {
      playerId: "p1",
      zone: "engaged",
      apparentHp: "bloodied",
      conditions: [],
      cover: "none",
      hitMonsterLastRound: true,
      clusteredWith: [],
    },
  ],
  allies: { present: false, count: 0 },
  terrain: { difficult: false, chokepoint: false, escapeRoute: true, flyingPossible: false },
  notes: "bridge",
};

/** A choice: the Mace at p1, no bonus action, holding position. Override parts per test. */
const choice = (over: Partial<ApplyChoice> = {}): ApplyChoice => ({
  moveBefore: "hold",
  action: { key: "act_mace", name: "Mace", abilityId: "act_mace", targetIds: ["p1"] },
  bonusAction: null,
  moveAfter: "hold",
  situation: SITUATION,
  recommended: true,
  ...over,
});

const holdPersonAt = (slotLevel: number): ApplyChoice["action"] => ({
  key: "spl_hold_person",
  name: "Hold Person",
  abilityId: "spl_hold_person",
  targetIds: ["p1"],
  slotLevel,
});

describe("apply: spends what the DM actually chose", () => {
  it("spends the slot level the DM chose, not the spell's base level", () => {
    const t = apply(fresh(), choice({ action: holdPersonAt(3), recommended: false }));
    expect(t.state.slots).toEqual({ "1": 4, "2": 3, "3": 1 });
  });

  it("spends the overridden choice, not what was recommended", () => {
    // Recommended: Guiding Bolt at level 1. The DM overrode it to Hold Person at level 2.
    const t = apply(fresh(), choice({ action: holdPersonAt(2), recommended: false }));
    expect(t.state.slots).toEqual({ "1": 4, "2": 2, "3": 2 });
    expect(t.log.at(-1)?.actionId).toBe("spl_hold_person");
    expect(t.log.at(-1)?.recommended).toBe(false);
  });

  it("spends a slot for a leveled bonus-action spell", () => {
    const t = apply(
      fresh(),
      choice({
        bonusAction: { key: "spl_spiritual_weapon", name: "Spiritual Weapon", abilityId: "spl_spiritual_weapon", targetIds: ["p1"], slotLevel: 2 },
      }),
    );
    expect(t.state.slots).toEqual({ "1": 4, "2": 2, "3": 2 });
    expect(t.log.at(-1)?.bonusSlotLevel).toBe(2);
    expect(t.log.at(-1)?.slotLevel).toBeUndefined();
  });

  it("spends one daily use", () => {
    const t = apply(fresh(), choice({ action: { key: "act_cinder_ward", name: "Cinder Ward", abilityId: "act_cinder_ward", targetIds: [] } }));
    expect(t.state.perDay).toEqual({ act_cinder_ward: 1 });
  });

  it("marks a recharge ability spent", () => {
    const t = apply(
      fresh(),
      choice({ action: { key: "act_ash_burst", name: "Ash Burst", abilityId: "act_ash_burst", targetIds: ["p1"], clusterId: "c0" } }),
    );
    expect(t.state.recharge).toEqual({ act_ash_burst: "spent" });
    expect(t.log.at(-1)?.clusterId).toBe("c0");
  });

  it("spends nothing for an at-will attack or a basic action", () => {
    const before = fresh();
    const mace = apply(before, choice());
    const dash = apply(before, choice({ action: { key: "dash", name: "Dash", abilityId: null, targetIds: [] } }));
    for (const t of [mace, dash]) {
      expect(t.state.slots).toEqual(before.state.slots);
      expect(t.state.perDay).toEqual(before.state.perDay);
      expect(t.state.recharge).toEqual(before.state.recharge);
    }
  });
});

describe("apply: concentration", () => {
  it("sets concentration when a concentration spell is cast", () => {
    const t = apply(fresh(), choice({ action: holdPersonAt(2) }));
    expect(t.state.concentration).toEqual({ abilityId: "spl_hold_person", name: "Hold Person" });
  });

  it("replaces existing concentration with the new spell", () => {
    const first = apply(fresh(), choice({ action: holdPersonAt(2) }));
    const second = apply(
      first,
      choice({ action: { key: "spl_spirit_guardians", name: "Spirit Guardians", abilityId: "spl_spirit_guardians", targetIds: [], slotLevel: 3 } }),
    );
    expect(second.state.concentration).toEqual({ abilityId: "spl_spirit_guardians", name: "Spirit Guardians" });
  });

  it("sets concentration from a bonus-action spell", () => {
    const t = apply(
      fresh(),
      choice({ bonusAction: { key: "spl_shield_of_faith", name: "Shield of Faith", abilityId: "spl_shield_of_faith", targetIds: [], slotLevel: 1 } }),
    );
    expect(t.state.concentration).toEqual({ abilityId: "spl_shield_of_faith", name: "Shield of Faith" });
  });

  it("keeps existing concentration when the spell cast doesn't need it", () => {
    const first = apply(fresh(), choice({ action: holdPersonAt(2) }));
    const second = apply(
      first,
      choice({ action: { key: "spl_guiding_bolt", name: "Guiding Bolt", abilityId: "spl_guiding_bolt", targetIds: ["p1"], slotLevel: 1 } }),
    );
    expect(second.state.concentration).toEqual({ abilityId: "spl_hold_person", name: "Hold Person" });
  });
});

describe("apply: turn log and situation", () => {
  it("pushes a log entry for this round with recommended true", () => {
    const start = fresh();
    start.state.round = 3;
    const t = apply(
      start,
      choice({
        moveBefore: "closeIn",
        moveAfter: "retreat",
        bonusAction: { key: "trt_ash_step", name: "Ash Step (Disengage)", abilityId: "trt_ash_step", targetIds: [] },
      }),
    );
    expect(t.log).toHaveLength(1);
    const entry = t.log[0];
    expect(TurnLogEntrySchema.safeParse(entry).success).toBe(true);
    expect(entry).toEqual({
      round: 3,
      moveBefore: "closeIn",
      actionId: "act_mace",
      actionName: "Mace",
      targetIds: ["p1"],
      bonusActionId: "trt_ash_step",
      bonusActionName: "Ash Step (Disengage)",
      bonusTargetIds: [],
      moveAfter: "retreat",
      recommended: true,
    });
    expect(t.state.round).toBe(3);
  });

  it("logs no action and no bonus action as null ids", () => {
    const t = apply(fresh(), choice({ action: null, bonusAction: null, recommended: false }));
    expect(t.log[0]).toMatchObject({ actionId: null, bonusActionId: null, targetIds: [], bonusTargetIds: [], recommended: false });
  });

  it("appends to the existing log", () => {
    const t = apply(apply(fresh(), choice()), choice({ recommended: false }));
    expect(t.log.map((e) => e.recommended)).toEqual([true, false]);
  });

  it("keeps the situation for the next turn", () => {
    const t = apply(fresh(), choice());
    expect(t.situation).toEqual(SITUATION);
  });

  it("does not mutate the input tracker", () => {
    const start = fresh();
    const snapshot = structuredClone(start);
    apply(start, choice({ action: holdPersonAt(3) }));
    expect(start).toEqual(snapshot);
  });
});

describe("apply: bounds", () => {
  it("never takes slots or daily uses below 0", () => {
    const start = fresh();
    start.state.slots["3"] = 0;
    start.state.perDay.act_cinder_ward = 0;
    const slot = apply(start, choice({ action: holdPersonAt(3) }));
    const daily = apply(start, choice({ action: { key: "act_cinder_ward", name: "Cinder Ward", abilityId: "act_cinder_ward", targetIds: [] } }));
    expect(slot.state.slots["3"]).toBe(0);
    expect(daily.state.perDay.act_cinder_ward).toBe(0);
  });

  it("leaves HP alone, so it never goes below 0", () => {
    const start = fresh();
    start.state.hp = 0;
    const t = apply(start, choice({ action: holdPersonAt(2) }));
    expect(t.state.hp).toBe(0);
    expect(TrackerSchema.safeParse(t).success).toBe(true);
  });
});

describe("apply: rejects choices that don't match the monster", () => {
  it("throws on an ability the monster doesn't have", () => {
    expect(() => apply(fresh(), choice({ action: { key: "x", name: "X", abilityId: "act_missing", targetIds: [] } }))).toThrow(/act_missing/);
  });

  it("throws when a slot spell has no slot level", () => {
    expect(() =>
      apply(fresh(), choice({ action: { key: "spl_hold_person", name: "Hold Person", abilityId: "spl_hold_person", targetIds: [] } })),
    ).toThrow(/slot level/i);
  });

  it("throws when the slot level is below the spell's level", () => {
    expect(() => apply(fresh(), choice({ action: holdPersonAt(1) }))).toThrow(/slot level/i);
  });

  it("throws when a slot level is given for an ability that doesn't use slots", () => {
    expect(() =>
      apply(fresh(), choice({ action: { key: "act_mace", name: "Mace", abilityId: "act_mace", targetIds: [], slotLevel: 2 } })),
    ).toThrow(/slot level/i);
  });
});

describe("ApplyChoiceSchema", () => {
  it("accepts a valid choice and rejects a bad movement", () => {
    expect(ApplyChoiceSchema.safeParse(choice({ action: holdPersonAt(3) })).success).toBe(true);
    expect(ApplyChoiceSchema.safeParse({ ...choice(), moveBefore: "teleport" }).success).toBe(false);
  });
});
