import { describe, expect, it } from "vitest";
import { describeUses, summarize } from "@/lib/monster/describe";
import { ability } from "../helpers/reviewed";

describe("describe", () => {
  it("describes uses", () => {
    expect(describeUses({ kind: "at-will" })).toBe("at will");
    expect(describeUses({ kind: "per-day", max: 3 })).toBe("3/day");
    expect(describeUses({ kind: "recharge", min: 5 })).toBe("recharge 5–6");
    expect(describeUses({ kind: "recharge", min: 6 })).toBe("recharge 6");
    expect(describeUses({ kind: "slot", level: 2 })).toBe("level 2 slot");
  });

  it("summarizes an attack with to-hit, reach and damage", () => {
    const a = ability({
      id: "act_bite",
      name: "Bite",
      attack: { kind: "melee", bonus: 6, reach: 5 },
      damage: [{ dice: "2d6 + 3", avg: 10, type: "slashing" }],
    });
    expect(summarize(a)).toBe("melee +6 to hit, reach 5 ft.; 10 (2d6 + 3) slashing");
  });

  it("summarizes a save with area, recharge and Multiattack parts by name", () => {
    const breath = ability({ id: "act_breath", name: "Breath", save: { ability: "Dexterity", dc: 15 }, area: { shape: "cone", size: 30 }, uses: { kind: "recharge", min: 5 } });
    expect(summarize(breath)).toBe("DC 15 Dexterity save; 30-ft. cone; recharge 5–6");
    const multi = ability({ id: "act_multiattack", name: "Multiattack", multiattack: [{ abilityId: "act_bite", count: 2 }] });
    expect(summarize(multi, { act_bite: "Bite" })).toBe("2× Bite");
  });

  it("falls back to (truncated) raw text", () => {
    expect(summarize(ability({ id: "trt_x", name: "X", raw: "Short text." }))).toBe("Short text.");
    expect(summarize(ability({ id: "trt_x", name: "X", raw: "a".repeat(120) }))).toHaveLength(88);
  });
});
