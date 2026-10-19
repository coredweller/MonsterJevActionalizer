import { describe, expect, it } from "vitest";
import {
  CHANGE_KINDS,
  PB_BY_CR,
  editField,
  moveUnknownToNotes,
  normalize,
  proficiencyBonusForCr,
  reapply,
  revert,
  type NormalizeResult,
} from "@/lib/monster/normalize";
import { GeneralMonsterBodySchema, LegendaryMonsterBodySchema } from "@/lib/monster/schema";
import { loadMonsterFixture, loadMonsterFixtures } from "../helpers/fixtures";

type Body = Record<string, unknown>;
const clone = <T>(x: T): T => structuredClone(x);
const body = (name: string): Body => clone(loadMonsterFixture(name).raw) as Body;
const fixed = (r: NormalizeResult) => r.fixed as Body;
const kinds = (r: NormalizeResult) => r.changes.map((c) => c.kind);

function expectValid(r: NormalizeResult) {
  expect(r.errors, JSON.stringify(r.errors)).toEqual([]);
  const schema = r.kind === "legendary" ? LegendaryMonsterBodySchema : GeneralMonsterBodySchema;
  expect(schema.safeParse(r.fixed).success).toBe(true);
}

describe("normalize: one case per known drift", () => {
  it("fills an empty Equipment block with blanks", () => {
    const raw = body("TunnelWasp");
    raw.Equipment = {};
    const r = normalize(raw);
    expect(fixed(r).Equipment).toEqual({ Armor: "", Weapons: "", Other: "" });
    expect(kinds(r)).toEqual(["fill-default"]);
    expect(r.changes[0].path).toEqual(["Equipment"]);
    expectValid(r);
  });

  it("coerces numeric strings for Level, AC and Score", () => {
    const raw = body("TunnelWasp");
    raw.Level = "5";
    raw.AC = "14";
    (raw.AbilityScores as Record<string, Body>).Strength.Score = "16";
    const r = normalize(raw);
    expect(fixed(r).Level).toBe(5);
    expect(fixed(r).AC).toBe(14);
    expect((fixed(r).AbilityScores as Record<string, Body>).Strength.Score).toBe(16);
    expect(kinds(r)).toEqual(["coerce-number", "coerce-number", "coerce-number"]);
    expect(r.changes.map((c) => c.path)).toContainEqual(["AbilityScores", "Strength", "Score"]);
    expectValid(r);
  });

  it("computes a missing Modifier from Score", () => {
    const raw = body("TunnelWasp");
    delete (raw.AbilityScores as Record<string, Body>).Intelligence.Modifier;
    const r = normalize(raw);
    expect((fixed(r).AbilityScores as Record<string, Body>).Intelligence.Modifier).toBe("-4");
    expect(kinds(r)).toEqual(["compute-modifier"]);
    expectValid(r);
  });

  it.each([["Legendary Actions"], ["Legendary_Actions"]])("renames %s to LegendaryActions", (alias) => {
    const raw = body("Zarielith");
    raw[alias] = raw.LegendaryActions;
    delete raw.LegendaryActions;
    const r = normalize(raw);
    expect(fixed(r).LegendaryActions).toEqual(body("Zarielith").LegendaryActions);
    expect(alias in fixed(r)).toBe(false);
    expect(kinds(r)).toEqual(["rename-key"]);
    expect(r.changes[0]).toMatchObject({ path: [alias], before: alias, after: "LegendaryActions" });
    expectValid(r);
  });

  it("renames Equipment.Weapon to Weapons", () => {
    const raw = body("TunnelWasp");
    raw.Equipment = { Armor: "", Weapon: "Sting", Other: "" };
    const r = normalize(raw);
    expect(fixed(r).Equipment).toEqual({ Armor: "", Weapons: "Sting", Other: "" });
    expect(kinds(r)).toEqual(["rename-key"]);
    expect(r.changes[0].path).toEqual(["Equipment", "Weapon"]);
    expectValid(r);
  });

  it('renames "Saving Throws" to SavingThrows', () => {
    const raw = body("TunnelWasp");
    raw["Saving Throws"] = raw.SavingThrows;
    delete raw.SavingThrows;
    const r = normalize(raw);
    expect(fixed(r).SavingThrows).toEqual(body("TunnelWasp").SavingThrows);
    expect(kinds(r)).toEqual(["rename-key"]);
    expectValid(r);
  });

  it("lists the four quickstart drifts as four separate changes", () => {
    const raw = body("Zarielith");
    raw.Level = "10";
    raw["Legendary Actions"] = raw.LegendaryActions;
    delete raw.LegendaryActions;
    raw.Equipment = { Weapon: "Cursed Scepter of Binding" };
    const r = normalize(raw);
    expect(r.changes).toHaveLength(4);
    expect(kinds(r).sort()).toEqual(["coerce-number", "fill-default", "rename-key", "rename-key"]);
    expectValid(r);
  });

  describe("general monster with a flat legendary-actions map", () => {
    const raw = body("TunnelWasp");
    raw.SpecialTraits = {
      ...(raw.SpecialTraits as Body),
      "Nimble Escape": "The wasp can take the Disengage or Hide action as a bonus action on each of its turns.",
    };
    raw["Legendary Actions"] = { Sting: "The wasp makes one Sting attack.", Buzz: "The wasp moves half its speed." };
    const r = normalize(raw, { filename: "TunnelWasp.CR5.2014.json" });
    const out = fixed(r);

    it("upgrades to the legendary template", () => {
      expect(r.kind).toBe("legendary");
      expect(kinds(r)).toContain("upgrade-legendary");
      expectValid(r);
    });

    it("wraps the flat map, keeping the real action names as Options", () => {
      expect(out.LegendaryActions).toEqual({
        "Legendary Action Uses": "3",
        Options: { Sting: "The wasp makes one Sting attack.", Buzz: "The wasp moves half its speed." },
      });
      expect(kinds(r)).toContain("wrap-legendary-actions");
    });

    it("fills ChallengeRating from the filename and ProficiencyBonus from the CR table", () => {
      expect(out.ChallengeRating).toBe("5");
      expect(out.ProficiencyBonus).toBe("+3");
      expect(kinds(r)).toEqual(expect.arrayContaining(["fill-cr", "derive-pb"]));
    });

    it("adds empty legendary sections without inventing Legendary Resistance", () => {
      expect(out.BonusActions).toEqual({
        "Nimble Escape": "The wasp can take the Disengage or Hide action as a bonus action on each of its turns.",
      });
      expect(out.Reactions).toEqual({});
      expect(out.LairActions).toEqual({});
      expect(out.RegionalEffects).toEqual([]);
      expect(out.MythicTrait).toEqual({ Name: "", Description: "" });
      expect(out.LegendaryTraits).toEqual({});
      expect(out.DamageResistances).toBe("");
      expect(out.DamageImmunities).toBe("");
      expect(out.ConditionImmunities).toBe("");
    });

    it('moves "as a bonus action" traits into BonusActions', () => {
      expect("Nimble Escape" in (out.SpecialTraits as Body)).toBe(false);
      expect(kinds(r)).toContain("move-bonus-action");
      expect(Object.keys(out.SpecialTraits as Body)).toEqual(["Burrow Ambusher", "Hive Alert", "Chitinous Plating"]);
    });
  });

  it("sets needsCr when CR is missing and there is no filename", () => {
    const raw = body("TunnelWasp");
    raw.LegendaryActions = { "Legendary Action Uses": "3", Options: { Sting: "Stings." } };
    const r = normalize(raw);
    expect(r.needsCr).toBe(true);
    expect(fixed(r).ChallengeRating).toBeUndefined();
    expect(r.errors.map((e) => e.path)).toContainEqual(["ChallengeRating"]);
    const withCr = normalize(raw, { cr: "5" });
    expect(withCr.needsCr).toBe(false);
    expect(fixed(withCr).ProficiencyBonus).toBe("+3");
    expectValid(withCr);
  });

  it("keeps an unknown key and lists it in unknownKeys", () => {
    const raw = body("TunnelWasp");
    raw.Habitat = "Underdark";
    raw.Equipment = { ...(raw.Equipment as Body), Trinket: "A shiny bead" };
    const r = normalize(raw);
    expect(fixed(r).Habitat).toBe("Underdark");
    expect(r.unknownKeys).toEqual([["Habitat"], ["Equipment", "Trinket"]]);
    expect(r.changes).toEqual([]);
    expectValid(r);
  });

  it("moveUnknownToNotes appends to Notes, removes the key and records a revertible change", () => {
    const raw = body("TunnelWasp");
    raw.Habitat = "Underdark";
    const r = normalize(raw);
    expect(fixed(r).Notes).toBe(raw.Notes); // never applied without being asked
    const moved = moveUnknownToNotes(r, ["Habitat"]);
    expect("Habitat" in fixed(moved)).toBe(false);
    expect(fixed(moved).Notes).toBe(`${raw.Notes as string}\nHabitat: Underdark`);
    expect(moved.unknownKeys).toEqual([]);
    const change = moved.changes.find((c) => c.kind === "move-to-notes");
    expect(change).toMatchObject({ path: ["Habitat"], before: "Underdark" });
    const undone = revert(moved, change!.id);
    expect(fixed(undone).Habitat).toBe("Underdark");
    expect(fixed(undone).Notes).toBe(raw.Notes);
  });

  it("gives every change a kind, path, before, after and message", () => {
    const raw = body("Zarielith");
    raw.Level = "10";
    raw.Equipment = {};
    for (const c of normalize(raw).changes) {
      expect(c.id).toBeTruthy();
      expect(CHANGE_KINDS).toContain(c.kind);
      expect(Array.isArray(c.path)).toBe(true);
      expect(c).toHaveProperty("before");
      expect(c).toHaveProperty("after");
      expect(c.message.length).toBeGreaterThan(0);
    }
  });

  it("has the standard proficiency-bonus table", () => {
    expect(PB_BY_CR.length).toBeGreaterThan(0);
    expect(proficiencyBonusForCr("1/4")).toBe(2);
    expect(proficiencyBonusForCr("4")).toBe(2);
    expect(proficiencyBonusForCr("5")).toBe(3);
    expect(proficiencyBonusForCr("10")).toBe(4);
    expect(proficiencyBonusForCr("17")).toBe(6);
    expect(proficiencyBonusForCr("30")).toBe(9);
    expect(proficiencyBonusForCr("lots")).toBeUndefined();
  });
});

describe("normalize: invariants", () => {
  it.each(loadMonsterFixtures().map((f) => [f.file, f] as const))("%s normalizes with zero changes", (file, f) => {
    const r = normalize(f.raw, { filename: file });
    expect(r.changes).toEqual([]);
    expect(r.unknownKeys).toEqual([]);
    expectValid(r);
  });

  const drifted = (() => {
    const raw = body("TunnelWasp");
    raw.Level = "5";
    raw.Equipment = { Weapon: "Sting" };
    raw["Saving Throws"] = raw.SavingThrows;
    delete raw.SavingThrows;
    delete (raw.AbilityScores as Record<string, Body>).Wisdom.Modifier;
    raw["Legendary Actions"] = { Sting: "The wasp makes one Sting attack." };
    raw.SpecialTraits = { ...(raw.SpecialTraits as Body), Zip: "It can Dash as a bonus action." };
    return raw;
  })();

  it("is idempotent: normalize(normalize(x).fixed) has zero changes", () => {
    const once = normalize(drifted, { filename: "TunnelWasp.CR5.2014.json" });
    expect(once.changes.length).toBeGreaterThan(5);
    const twice = normalize(once.fixed, { filename: "TunnelWasp.CR5.2014.json" });
    expect(twice.changes).toEqual([]);
  });

  it("revert restores that field and leaves the other changes applied", () => {
    const once = normalize(drifted, { filename: "TunnelWasp.CR5.2014.json" });
    const levelChange = once.changes.find((c) => c.kind === "coerce-number" && c.path[0] === "Level")!;
    const reverted = revert(once, levelChange.id);
    expect(fixed(reverted).Level).toBe("5");
    expect(reverted.changes).toHaveLength(once.changes.length - 1);
    expect(fixed(reverted).SavingThrows).toEqual(body("TunnelWasp").SavingThrows);
    expect(reverted.errors.map((e) => e.path)).toContainEqual(["Level"]);
  });

  it("reapply undoes a revert", () => {
    const once = normalize(drifted, { filename: "TunnelWasp.CR5.2014.json" });
    const id = once.changes.find((c) => c.path[0] === "Level")!.id;
    const back = reapply(revert(once, id), id);
    expect(back.changes).toEqual(once.changes);
    expect(back.fixed).toEqual(once.fixed);
  });

  it("editField fixes a remaining error in place and keeps the other changes revertible", () => {
    const once = normalize(drifted, { filename: "TunnelWasp.CR5.2014.json" });
    const reverted = revert(once, once.changes.find((c) => c.path[0] === "Level")!.id);
    expect(reverted.errors.find((e) => e.path[0] === "Level")?.expected).toBe("number");
    const edited = editField(reverted, ["Level"], 7);
    expect(fixed(edited).Level).toBe(7);
    expect(edited.errors).toEqual([]);
    expect(edited.changes.length).toBe(reverted.changes.length);
  });

  it("editField maps a renamed key back to its source spelling", () => {
    const raw = body("TunnelWasp");
    raw["Saving Throws"] = "nope";
    delete raw.SavingThrows;
    const r = normalize(raw);
    expect(r.errors.map((e) => e.path)).toContainEqual(["SavingThrows"]);
    const edited = editField(r, ["SavingThrows"], { Dexterity: "+5" });
    expect(fixed(edited).SavingThrows).toEqual({ Dexterity: "+5" });
    expect(kinds(edited)).toEqual(["rename-key"]);
    expectValid(edited);
  });

  it("never produces a change of an unlisted kind, nor invents resistances, immunities, LR or actions", () => {
    const r = normalize(drifted, { filename: "TunnelWasp.CR5.2014.json" });
    for (const c of r.changes) expect(CHANGE_KINDS).toContain(c.kind);
    const out = fixed(r);
    expect(out.LegendaryTraits).toEqual({});
    expect(out.DamageResistances).toBe("");
    expect(out.DamageImmunities).toBe("");
    expect(out.ConditionImmunities).toBe("");
    expect(out.Actions).toEqual(body("TunnelWasp").Actions);
    expect(JSON.stringify(out)).not.toMatch(/Legendary Resistance/);
  });
});
