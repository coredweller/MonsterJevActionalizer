import { describe, expect, it } from "vitest";
import { createTracker, suggestTemperament } from "@/lib/encounter/state";
import { TrackerSchema } from "@/lib/encounter/types";
import { ability, handReviewed, slots } from "../helpers/reviewed";

const NOW = "2026-10-03T12:00:00.000Z";

describe("createTracker", () => {
  const reviewed = handReviewed(
    "MaestroDrazzuk",
    [
      ability({ id: "act_maestros_blade", name: "Maestro's Blade" }),
      ability({ id: "act_discordant_strike", name: "Discordant Strike", uses: { kind: "recharge", min: 5 } }),
      ability({ id: "leg_conduct", name: "Conduct", source: "LegendaryActions", category: "legendary", uses: { kind: "per-day", max: 1 } }),
      ability({ id: "bon_misty", name: "Misty Step", category: "bonus", uses: { kind: "per-day", max: 2 } }),
    ],
    { spellcasting: slots({ "1": 4, "2": 3, "5": 2 }), hpMax: 136 },
  );

  it("starts with full resources, full HP, round 1 and empty roster and log", () => {
    const t = createTracker(reviewed, "t1", NOW);
    expect(t.id).toBe("t1");
    expect(t.createdAt).toBe(NOW);
    expect(t.name).toBe("Maestro Drazzuk");
    expect(t.state.hp).toBe(136);
    expect(t.state.hpMax).toBe(136);
    expect(t.state.round).toBe(1);
    expect(t.state.slots).toEqual({ "1": 4, "2": 3, "5": 2 });
    expect(t.state.perDay).toEqual({ leg_conduct: 1, bon_misty: 2 });
    expect(t.state.recharge).toEqual({ act_discordant_strike: "available" });
    expect(t.state.conditions).toEqual([]);
    expect(t.state.concentration).toBeNull();
    expect(t.roster).toEqual([]);
    expect(t.log).toEqual([]);
    expect(t.situation.players).toEqual([]);
    expect(TrackerSchema.safeParse(t).success).toBe(true);
  });

  it("uses default settings with temperament from INT", () => {
    const t = createTracker(reviewed, "t1", NOW);
    expect(t.settings).toEqual({ temperament: "cunning", morale: 50, rechargeMode: "auto" });
  });

  it("reads legendary actions from Legendary Action Uses", () => {
    expect(createTracker(reviewed, "t1", NOW).state.legendaryActionsLeft).toBe(3);
    expect(createTracker(handReviewed("TunnelWasp", []), "t2", NOW).state.legendaryActionsLeft).toBe(0);
  });

  it("reads Legendary Resistance from a trait, using the base count of 2024 wording", () => {
    expect(createTracker(handReviewed("BriarthornHag", []), "t1", NOW).state.legendaryResistanceLeft).toBe(3);
  });

  it("tracks Legendary Resistance on its own counter, not as a daily use", () => {
    const lr = ability({ id: "trt_legendary_resistance", name: "Legendary Resistance", source: "SpecialTraits", category: "passive", uses: { kind: "per-day", max: 3 } });
    const t = createTracker(handReviewed("BriarthornHag", [lr]), "t1", NOW);
    expect(t.state.perDay).toEqual({});
    expect(t.state.legendaryResistanceLeft).toBe(3);
  });

  it("never invents Legendary Resistance", () => {
    expect(createTracker(handReviewed("Zarielith", []), "t1", NOW).state.legendaryResistanceLeft).toBe(0);
    expect(createTracker(handReviewed("TunnelWasp", []), "t1", NOW).state.legendaryResistanceLeft).toBe(0);
  });
});

describe("suggestTemperament", () => {
  it.each([
    [1, "mindless"],
    [3, "mindless"],
    [4, "feral"],
    [7, "feral"],
    [8, "cunning"],
    [13, "cunning"],
    [14, "genius"],
    [20, "genius"],
  ] as const)("INT %i → %s", (int, expected) => {
    expect(suggestTemperament(int)).toBe(expected);
  });
});
