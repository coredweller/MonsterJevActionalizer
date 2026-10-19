import { describe, expect, it } from "vitest";
import { lookupSpell } from "@/lib/monster/spells";

describe("lookupSpell", () => {
  it("finds an SRD spell case-insensitively, with level, casting time and concentration", () => {
    const r = lookupSpell("hold PERSON");
    expect(r.known).toBe(true);
    if (!r.known) return;
    expect(r.spell).toMatchObject({ name: "Hold Person", level: 2, castingTime: "action", concentration: true, save: "Wisdom" });
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(lookupSpell("  Fireball ").known).toBe(true);
    expect(lookupSpell("Mass  Healing Word").known).toBe(true);
  });

  it("keeps Spirit Guardians' Wisdom save and its 15-ft. emanation, which the source states only in its text", () => {
    const r = lookupSpell("Spirit Guardians");
    expect(r.known).toBe(true);
    if (!r.known) return;
    expect(r.spell).toMatchObject({ level: 3, save: "Wisdom", area: { shape: "emanation", size: 15 }, concentration: true });
  });

  it("returns { known: false } for a spell that isn't in the SRD table", () => {
    expect(lookupSpell("Thornward Hex")).toEqual({ known: false });
  });

  it.each([
    ["Misty Step (2/Day)", "Misty Step"],
    ["Misty Step (2/day)", "Misty Step"],
    ["Hold Person (1/Day Each)", "Hold Person"],
    ["Fireball (Recharge 5–6)", "Fireball"],
    ["Counterspell (Recharge after a Short or Long Rest)", "Counterspell"],
  ])("ignores the trailing uses suffix in %s", (name, spellName) => {
    const r = lookupSpell(name);
    expect(r.known && r.spell.name).toBe(spellName);
  });

  it.each(["Healing Word", "Spiritual Weapon", "Misty Step"])("%s has castingTime bonus", (name) => {
    const r = lookupSpell(name);
    expect(r.known && r.spell.castingTime).toBe("bonus");
  });
});
