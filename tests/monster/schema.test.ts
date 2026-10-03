import { describe, expect, it } from "vitest";
import {
  GeneralMonsterBodySchema,
  LegendaryMonsterBodySchema,
  abilityModifier,
  classify,
  parseMonster,
} from "@/lib/monster/schema";
import { loadMonsterFixture, loadMonsterFixtures } from "../helpers/fixtures";

describe("monster schema", () => {
  it.each(loadMonsterFixtures().map((f) => [f.file, f] as const))("%s parses with the schema classify picks", (_, f) => {
    const kind = classify(f.raw);
    const schema = kind === "legendary" ? LegendaryMonsterBodySchema : GeneralMonsterBodySchema;
    const result = schema.safeParse(f.raw);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    const parsed = parseMonster(f.raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe(kind);
  });

  it("classifies the legendary fixtures as legendary and the rest as general", () => {
    const legendary = loadMonsterFixtures()
      .filter((f) => classify(f.raw) === "legendary")
      .map((f) => f.name);
    expect(legendary.sort()).toEqual(["BriarthornHag", "MaestroDrazzuk", "Zarielith"]);
  });

  it('accepts Modifier as "+3", 3 or missing, and normalises it to a number', () => {
    const base = loadMonsterFixture("TunnelWasp").raw as Record<string, unknown>;
    const scores = (Modifier: unknown) => ({
      ...base,
      AbilityScores: {
        Strength: Modifier === undefined ? { Score: 16 } : { Score: 16, Modifier },
        Dexterity: { Score: 15, Modifier: "+2" },
        Constitution: { Score: 18, Modifier: 4 },
        Intelligence: { Score: 3 },
        Wisdom: { Score: 12, Modifier: "+1" },
        Charisma: { Score: 5, Modifier: "-3" },
      },
    });
    for (const m of ["+3", 3, undefined]) {
      const r = GeneralMonsterBodySchema.safeParse(scores(m));
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.AbilityScores.Strength.Modifier).toBe(3);
      expect(r.data.AbilityScores.Intelligence.Modifier).toBe(-4);
      expect(r.data.AbilityScores.Charisma.Modifier).toBe(-3);
    }
  });

  it("computes abilityModifier as floor((score - 10) / 2)", () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(3)).toBe(-4);
    expect(abilityModifier(20)).toBe(5);
  });

  it("does not treat a general body with BonusActions as legendary", () => {
    const raw = { ...(loadMonsterFixture("TunnelWasp").raw as object), BonusActions: { Dash: "Dashes." } };
    expect(classify(raw)).toBe("general");
  });

  it.each([["LegendaryActions"], ["Legendary Actions"], ["Legendary_Actions"], ["LegendaryTraits"], ["LairActions"], ["MythicTrait"]])(
    "classifies a body with %s as legendary",
    (key) => {
      const raw = { ...(loadMonsterFixture("TunnelWasp").raw as object), [key]: {} };
      expect(classify(raw)).toBe("legendary");
    },
  );

  it('fails a strict parse when Level is "5"', () => {
    const raw = { ...(loadMonsterFixture("TunnelWasp").raw as object), Level: "5" };
    expect(GeneralMonsterBodySchema.safeParse(raw).success).toBe(false);
  });
});
