import { describe, expect, it } from "vitest";
import { describeUses, statblockSections, summarize } from "@/lib/monster/describe";
import { ability, extractedReviewed } from "../helpers/reviewed";

describe("statblockSections", () => {
  it("lays a legendary monster out in statblock order, keeping entry names and text as written", () => {
    const hag = extractedReviewed("BriarthornHag");
    const { sections, unplaced } = statblockSections(hag);
    expect(sections.map((s) => s.title)).toEqual(["Traits", "Actions", "Bonus Actions", "Reactions", "Legendary Actions"]);
    expect(sections[0]?.entries.map((e) => e.name)).toEqual(["Thorn Warden", "Legendary Resistance (3/Day, or 4/Day in Lair)"]);

    const actions = sections[1]?.entries ?? [];
    expect(actions.map((e) => e.name)).toEqual(["Multiattack", "Thorn Lash", "Thorn Dart", "Bramble Burst (Recharge 5–6)", "Spellcasting"]);
    const burst = actions[3];
    expect(burst?.ability?.name).toBe("Bramble Burst");
    expect(burst?.text).toBe(hag.monster.body.Actions["Bramble Burst (Recharge 5–6)"]);
    expect(actions[4]).toMatchObject({ name: "Spellcasting", spellcasting: true });
    expect(actions[4]?.ability).toBeUndefined();

    expect(sections[4]?.intro).toBe("Briarthorn Hag can take 3 legendary actions, choosing from the options below.");
    expect(sections[4]?.entries.map((e) => e.ability?.name)).toEqual(["Lash", "Grasping Roots"]);
    expect(unplaced).toEqual([]);
  });

  it("adds a Lair Actions section with an initiative 20 intro", () => {
    const { sections } = statblockSections(extractedReviewed("MirewardenKethra"));
    const lair = sections.find((s) => s.title === "Lair Actions");
    expect(lair?.intro).toBe("On initiative count 20 (losing ties), it takes one lair action.");
    expect(lair?.entries.map((e) => e.name)).toEqual(["Sucking Mud", "Rising Waters", "Will-o'-Wisps"]);
    expect(lair?.entries.every((e) => e.ability?.category === "lair")).toBe(true);
  });

  it("gives a general monster only Traits and Actions, and leaves out empty sections", () => {
    const { sections } = statblockSections(extractedReviewed("TunnelWasp"));
    expect(sections.map((s) => s.title)).toEqual(["Traits", "Actions"]);
  });

  it("returns an ability it can't match to an entry as unplaced, never dropping it", () => {
    const hag = extractedReviewed("BriarthornHag");
    const stray = ability({ id: "act_stray", name: "Stray", source: "Actions", raw: "Not in the statblock." });
    expect(statblockSections({ ...hag, abilities: [...hag.abilities, stray] }).unplaced).toEqual([stray]);
  });
});

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
