import { describe, expect, it } from "vitest";
import {
  confirmReview,
  extractAbilities,
  parseArea,
  parseAttack,
  parseDamage,
  parseHp,
  parseSave,
  parseSpeed,
  parseUses,
  spellsMissingLevel,
  type ReviewDraft,
} from "@/lib/monster/extract";
import { parseMonster } from "@/lib/monster/schema";
import { ReviewedMonsterSchema, SpellEntrySchema, type Ability } from "@/lib/monster/types";
import { loadMonsterFixture, loadMonsterFixtures } from "../helpers/fixtures";

function draft(name: string): ReviewDraft {
  const parsed = parseMonster(loadMonsterFixture(name).raw);
  if (!parsed.success) throw new Error(`${name} does not parse`);
  return extractAbilities(parsed.data);
}

function byName(d: ReviewDraft, name: string): Ability {
  const found = d.abilities.find((a) => a.name === name);
  if (!found) throw new Error(`No ability "${name}" in ${d.abilities.map((a) => a.name).join(", ")}`);
  return found;
}

describe("extractAbilities on every fixture", () => {
  it.each(loadMonsterFixtures().map((f) => [f.name] as const))("%s extracts unique ids, raw text and an HP/speed", (name) => {
    const d = draft(name);
    expect(d.hpMax).toBeGreaterThan(0);
    expect(Object.keys(d.speed).length).toBeGreaterThan(0);
    const ids = d.abilities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of d.abilities) expect(typeof a.raw).toBe("string");
  });
});

describe("2014 wording", () => {
  it("TunnelWasp: Multiattack = Mandibles + Sting, with to-hit and reach parsed", () => {
    const d = draft("TunnelWasp");
    const mandibles = byName(d, "Mandibles");
    const sting = byName(d, "Sting");
    expect(byName(d, "Multiattack").multiattack).toEqual([
      { abilityId: mandibles.id, count: 1 },
      { abilityId: sting.id, count: 1 },
    ]);
    expect(mandibles.attack).toEqual({ kind: "melee", bonus: 6, reach: 5 });
    expect(mandibles.damage).toEqual([{ dice: "2d6 + 3", avg: 12, type: "slashing" }]);
    expect(sting.attack).toEqual({ kind: "melee", bonus: 6, reach: 5 });
    expect(mandibles.category).toBe("action");
    expect(mandibles.singleTarget).toBe(true);
    expect(d.hpMax).toBe(50);
    expect(d.speed).toEqual({ walk: 40, burrow: 20, climb: 30 });
    expect(d.intScore).toBe(3);
  });

  it("TieflingEnforcer: recharge ability and a two-attack Multiattack", () => {
    const d = draft("TieflingEnforcer");
    expect(byName(d, "Infernal Rebuke").uses).toEqual({ kind: "recharge", min: 5 });
    expect(byName(d, "Infernal Rebuke").category).toBe("reaction");
    expect(byName(d, "Multiattack").multiattack).toEqual([{ abilityId: byName(d, "Hellfire Longsword").id, count: 2 }]);
  });

  it("MaestroDrazzuk: spell slots per level and spells from the Spellcasting trait", () => {
    const d = draft("MaestroDrazzuk");
    expect(d.spellcasting?.slots).toEqual({ "1": 4, "2": 3, "3": 3, "4": 3, "5": 2 });
    expect(d.spellcasting?.saveDc).toBe(17);
    expect(d.spellcasting?.attackBonus).toBe(9);
    const shatter = byName(d, "Shatter");
    expect(shatter).toMatchObject({ source: "Spellcasting", category: "action", uses: { kind: "slot", level: 2 }, spellLevel: 2, known: true });
    expect(shatter.save).toEqual({ ability: "Constitution", dc: 17 });
    expect(shatter.area).toEqual({ shape: "sphere", size: 10 });
    expect(byName(d, "Vicious Mockery").uses).toEqual({ kind: "at-will" });
    expect(byName(d, "Discordant Strike").area).toEqual({ shape: "emanation", size: 30 });
    expect(byName(d, "Discordant Strike").save).toEqual({ ability: "Wisdom", dc: 17 });
    expect(byName(d, "Conduct").uses).toEqual({ kind: "per-day", max: 1 });
    expect(byName(d, "Conduct").category).toBe("legendary");
    expect(byName(d, "Unsettling Words").category).toBe("bonus");
  });

  describe("AshenWarpriest", () => {
    const d = draft("AshenWarpriest");

    it("has slots 4/3/2", () => {
      expect(d.spellcasting?.slots).toEqual({ "1": 4, "2": 3, "3": 2 });
    });

    it.each(["Healing Word", "Spiritual Weapon", "Shield of Faith", "Mass Healing Word"])("categorises %s as bonus from the SRD casting time", (name) => {
      expect(byName(d, name).category).toBe("bonus");
    });

    it.each(["Guiding Bolt", "Hold Person", "Spirit Guardians"])("categorises %s as action", (name) => {
      expect(byName(d, name).category).toBe("action");
    });

    it("marks concentration spells", () => {
      expect(byName(d, "Shield of Faith").concentration).toBe(true);
      expect(byName(d, "Hold Person").concentration).toBe(true);
      expect(byName(d, "Spirit Guardians").concentration).toBe(true);
      expect(byName(d, "Guiding Bolt").concentration).toBe(false);
    });

    it("gives Guiding Bolt a ranged spell attack using the spellcasting bonus", () => {
      expect(byName(d, "Guiding Bolt").attack).toEqual({ kind: "ranged", bonus: 7, range: { normal: 120 } });
      expect(byName(d, "Guiding Bolt").uses).toEqual({ kind: "slot", level: 1 });
    });

    it("reads Ash Step (Disengage) as a trait-granted bonus ability", () => {
      expect(byName(d, "Ash Step")).toMatchObject({ source: "SpecialTraits", category: "bonus", singleTarget: false });
    });

    it("reads War Priest as a bonus Mace attack that depends on the Attack action", () => {
      const warPriest = byName(d, "War Priest");
      expect(warPriest).toMatchObject({ category: "bonus", dependsOnAttackAction: true, singleTarget: true });
      expect(warPriest.multiattack).toEqual([{ abilityId: byName(d, "Mace").id, count: 1 }]);
    });

    it("reads Light Crossbow's normal/long range", () => {
      expect(byName(d, "Light Crossbow").attack).toEqual({ kind: "ranged", bonus: 5, range: { normal: 80, long: 320 } });
    });

    it("reads both damage parts of the Mace", () => {
      expect(byName(d, "Mace").damage).toEqual([
        { dice: "1d6 + 3", avg: 6, type: "bludgeoning" },
        { dice: "1d8", avg: 4, type: "fire" },
      ]);
    });

    it("only offensive spells and attacks need a player target", () => {
      expect(byName(d, "Multiattack").singleTarget).toBe(true);
      expect(byName(d, "Guiding Bolt").singleTarget).toBe(true);
      expect(byName(d, "Hold Person").singleTarget).toBe(true);
      expect(byName(d, "Healing Word").singleTarget).toBe(false);
      expect(byName(d, "Shield of Faith").singleTarget).toBe(false);
    });

    it("does not list the Spellcasting trait itself as an ability", () => {
      expect(d.abilities.some((a) => a.name === "Spellcasting")).toBe(false);
    });
  });

  it('Fiddlebits has no bonus-action ability ("uses your bonus action to command" is not the pattern)', () => {
    const d = draft("Fiddlebits");
    expect(d.abilities.filter((a) => a.category === "bonus")).toEqual([]);
    expect(byName(d, "Steel Defender").category).toBe("passive");
  });

  it("keeps unparseable text with parsed: none and the raw text", () => {
    const d = draft("Zarielith");
    const magicResistance = byName(d, "Magic Resistance");
    expect(magicResistance.parsed).toBe("none");
    expect(magicResistance.raw).toBe("Zarielith has advantage on saving throws against spells and other magical effects.");
  });

  it("HollowWailcap: hover fly speed and a 1/Day trait", () => {
    const d = draft("HollowWailcap");
    expect(d.speed).toEqual({ walk: 10, fly: 20 });
    expect(byName(d, "Neurosporic Burst").uses).toEqual({ kind: "per-day", max: 1 });
    expect(byName(d, "Neurosporic Burst").category).toBe("passive");
  });
});

describe("2024 wording: BriarthornHag", () => {
  const d = draft("BriarthornHag");

  it("Thorn Lash: Melee Attack Roll +7, reach 10 ft., 2d6+4 piercing plus 2d6 poison", () => {
    const lash = byName(d, "Thorn Lash");
    expect(lash.attack).toEqual({ kind: "melee", bonus: 7, reach: 10 });
    expect(lash.damage).toEqual([
      { dice: "2d6 + 4", avg: 11, type: "piercing" },
      { dice: "2d6", avg: 7, type: "poison" },
    ]);
    expect(lash.parsed).toBe("full");
  });

  it("Thorn Dart: Ranged Attack Roll +7, range 60/240 ft.", () => {
    expect(byName(d, "Thorn Dart").attack).toEqual({ kind: "ranged", bonus: 7, range: { normal: 60, long: 240 } });
  });

  it("Bramble Burst: Dexterity DC 15, 30-foot cone, Recharge 5–6 with an en dash", () => {
    const burst = byName(d, "Bramble Burst");
    expect(burst.save).toEqual({ ability: "Dexterity", dc: 15 });
    expect(burst.area).toEqual({ shape: "cone", size: 30 });
    expect(burst.uses).toEqual({ kind: "recharge", min: 5 });
    expect(burst.singleTarget).toBe(false);
    expect(burst.damage).toEqual([{ dice: "6d8", avg: 27, type: "piercing" }]);
  });

  it("Spellcasting is an action with at-will cantrips, 1/Day Each spells and no slots", () => {
    expect(d.spellcasting?.slots).toEqual({});
    expect(d.spellcasting?.saveDc).toBe(15);
    for (const name of ["Dancing Lights", "Mage Hand", "Minor Illusion"])
      expect(byName(d, name)).toMatchObject({ category: "action", uses: { kind: "at-will" }, source: "Spellcasting" });
    for (const name of ["Entangle", "Hold Person", "Plant Growth", "Thornward Hex"])
      expect(byName(d, name)).toMatchObject({ category: "action", uses: { kind: "per-day", max: 1 } });
  });

  it("Misty Step (2/Day) is a bonus ability with 2 daily uses", () => {
    expect(byName(d, "Misty Step")).toMatchObject({ category: "bonus", uses: { kind: "per-day", max: 2 } });
  });

  it("Bramble Shield is a reaction", () => {
    expect(byName(d, "Bramble Shield").category).toBe("reaction");
  });

  it("Thornward Hex is marked unknown", () => {
    expect(byName(d, "Thornward Hex").known).toBe(false);
    expect(d.spellcasting?.spells.find((s) => s.name === "Thornward Hex")?.known).toBe(false);
    expect(byName(d, "Entangle").known).toBe(true);
  });

  it("leaves an unknown at-will/X-day spell's level empty instead of guessing", () => {
    expect(byName(d, "Thornward Hex").spellLevel).toBeUndefined();
    expect(d.spellcasting?.spells.find((s) => s.name === "Thornward Hex")?.level).toBeUndefined();
    expect(byName(d, "Entangle").spellLevel).toBe(1);
    expect(byName(d, "Mage Hand").spellLevel).toBe(0);
  });

  it("lists the spells still missing a level, so the review screen can hold Confirm", () => {
    expect(spellsMissingLevel(d)).toEqual(["Thornward Hex"]);
    expect(spellsMissingLevel(draft("AshenWarpriest"))).toEqual([]);
    expect(spellsMissingLevel(draft("TunnelWasp"))).toEqual([]);
  });

  it("Lash points at the Thorn Lash attack it makes", () => {
    expect(byName(d, "Lash").multiattack).toEqual([{ abilityId: byName(d, "Thorn Lash").id, count: 1 }]);
  });

  it("Misty Step takes the SRD spell's data", () => {
    expect(byName(d, "Misty Step")).toMatchObject({ known: true, concentration: false, rangeFt: 0, parsed: "full" });
  });

  it("Misty Step (2/Day) is the known level-2 spell despite its uses suffix", () => {
    expect(byName(d, "Misty Step")).toMatchObject({
      known: true,
      spellLevel: 2,
      category: "bonus",
      uses: { kind: "per-day", max: 2 },
    });
  });

  it("Grasping Roots is a legendary save option", () => {
    expect(byName(d, "Grasping Roots")).toMatchObject({ category: "legendary", save: { ability: "Strength", dc: 15 }, rangeFt: 60 });
  });
});

describe("SpellEntrySchema", () => {
  const entry = { abilityId: "spell_thornward_hex", name: "Thornward Hex", uses: { kind: "per-day", max: 1 }, known: false };

  it("accepts an unknown spell with no level yet", () => {
    expect(SpellEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("still parses a previously saved entry that has a level", () => {
    expect(SpellEntrySchema.safeParse({ ...entry, level: 0 }).success).toBe(true);
  });

  it("still parses a ReviewedMonster saved before levels became optional", () => {
    const reviewed = confirmReview(draft("BriarthornHag"), "2026-10-03T00:00:00.000Z");
    const saved = {
      ...reviewed,
      abilities: reviewed.abilities.map((a) => (a.name === "Thornward Hex" ? { ...a, spellLevel: 0 } : a)),
      spellcasting: reviewed.spellcasting && {
        ...reviewed.spellcasting,
        spells: reviewed.spellcasting.spells.map((s) => (s.name === "Thornward Hex" ? { ...s, level: 0 } : s)),
      },
    };
    expect(ReviewedMonsterSchema.safeParse(JSON.parse(JSON.stringify(saved))).success).toBe(true);
  });
});

describe("inline wording variants", () => {
  it("parses a 2024 melee attack roll", () => {
    expect(parseAttack("Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.")).toEqual({ kind: "melee", bonus: 4, reach: 5 });
  });

  it("parses a 2014 ranged weapon attack with range", () => {
    expect(parseAttack("Ranged Weapon Attack: +5 to hit, range 80/320 ft., one target.")).toEqual({
      kind: "ranged",
      bonus: 5,
      range: { normal: 80, long: 320 },
    });
  });

  it("parses both save wordings", () => {
    expect(parseSave("each creature must make a DC 15 Dexterity saving throw")).toEqual({ ability: "Dexterity", dc: 15 });
    expect(parseSave("Constitution Saving Throw: DC 13, one creature")).toEqual({ ability: "Constitution", dc: 13 });
    expect(parseSave("must succeed on a DC 13 Wisdom save or be frightened")).toEqual({ ability: "Wisdom", dc: 13 });
  });

  it("parses damage dice with average and type", () => {
    expect(parseDamage("Hit: 10 (2d6 + 3) slashing damage plus 7 (2d6) fire damage.")).toEqual([
      { dice: "2d6 + 3", avg: 10, type: "slashing" },
      { dice: "2d6", avg: 7, type: "fire" },
    ]);
    expect(parseDamage("take 2d6 psychic damage")).toEqual([{ dice: "2d6", avg: 7, type: "psychic" }]);
  });

  it("parses areas", () => {
    expect(parseArea("exhales fire in a 60-foot cone")).toEqual({ shape: "cone", size: 60 });
    expect(parseArea("each creature in a 20-foot-radius sphere")).toEqual({ shape: "sphere", size: 20 });
    expect(parseArea("in a 30-ft radius")).toEqual({ shape: "radius", size: 30 });
    expect(parseArea("a 100-foot line that is 5 feet wide")).toEqual({ shape: "line", size: 100 });
  });

  it("parses uses from names and text", () => {
    expect(parseUses("Fire Breath (Recharge 5-6)", "")).toEqual({ kind: "recharge", min: 5 });
    expect(parseUses("Bite (Recharge 6)", "")).toEqual({ kind: "recharge", min: 6 });
    expect(parseUses("Teleport (3/Day)", "")).toEqual({ kind: "per-day", max: 3 });
    expect(parseUses("Teleport", "The mage teleports (3/Day).")).toEqual({ kind: "per-day", max: 3 });
    expect(parseUses("Claw", "")).toEqual({ kind: "at-will" });
  });

  it("parseHp takes the leading integer", () => {
    expect(parseHp("135 (18d10 + 36)")).toBe(135);
    expect(parseHp("50")).toBe(50);
    expect(parseHp("lots")).toBeUndefined();
  });

  it("parseSpeed builds a map of movement modes", () => {
    expect(parseSpeed("30 ft., fly 60 ft.")).toEqual({ walk: 30, fly: 60 });
    expect(parseSpeed("0 ft., fly 40 ft. (hover)")).toEqual({ walk: 0, fly: 40 });
    expect(parseSpeed("30 ft., climb 30 ft., swim 20 ft.")).toEqual({ walk: 30, climb: 30, swim: 20 });
  });
});
