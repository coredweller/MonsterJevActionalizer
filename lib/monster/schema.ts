/**
 * Monster statblock schemas, copied from
 * DandDTemplateParserTypeScript/src/routes/monsters.ts (zod v3).
 *
 * Differences from the source:
 *   - `Modifier` is optional and accepts a number or a signed string ("+3", "-4"). It is
 *     normalised to a number, computed from `Score` when missing.
 *   - Top-level bodies and `Equipment` use `.passthrough()` so unknown keys survive parsing
 *     (the normalizer flags them; they are never silently dropped).
 */
import { z } from "zod";

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

const ModifierSchema = z.union([
  z.number().int(),
  z.string().regex(/^[+-]?\d+$/, 'Modifier must be a whole number like "+3" or "-1"'),
]);

const AbilityScoreSchema = z
  .object({
    Score: z
      .number()
      .int()
      .min(1, "Ability score must be between 1 and 30.")
      .max(30, "Ability score must be between 1 and 30."),
    Modifier: ModifierSchema.optional(),
  })
  .transform(({ Score, Modifier }) => ({
    Score,
    Modifier: Modifier === undefined ? abilityModifier(Score) : Number(Modifier),
  }));

export const AbilityScoresSchema = z.object({
  Strength: AbilityScoreSchema,
  Dexterity: AbilityScoreSchema,
  Constitution: AbilityScoreSchema,
  Intelligence: AbilityScoreSchema,
  Wisdom: AbilityScoreSchema,
  Charisma: AbilityScoreSchema,
});

export const EquipmentSchema = z.object({ Armor: z.string(), Weapons: z.string(), Other: z.string() }).passthrough();

const GeneralMonsterFields = z.object({
  CharacterName: z.string().min(1, "CharacterName is required"),
  Level: z.number().int(),
  Race: z.string(),
  Class: z.string(),
  Alignment: z.string(),
  HP: z.string(),
  AC: z.number().int(),
  Speed: z.string(),
  AbilityScores: AbilityScoresSchema,
  SavingThrows: z.record(z.string(), z.string()),
  Skills: z.record(z.string(), z.string()),
  Senses: z.string(),
  Languages: z.string(),
  SpecialTraits: z.record(z.string(), z.string()),
  Actions: z.record(z.string(), z.string()),
  Equipment: EquipmentSchema,
  Notes: z.string(),
});

export const GeneralMonsterBodySchema = GeneralMonsterFields.passthrough();

export const LegendaryActionsSchema = z.object({
  "Legendary Action Uses": z.string().regex(/^\d+$/, "Legendary Action Uses must be a whole number"),
  Options: z.record(z.string(), z.string()),
});
export const MythicTraitSchema = z.object({ Name: z.string(), Description: z.string() });

export const LegendaryMonsterBodySchema = GeneralMonsterFields.extend({
  DamageResistances: z.string(),
  DamageImmunities: z.string(),
  ConditionImmunities: z.string(),
  ChallengeRating: z.string(),
  ProficiencyBonus: z.string(),
  BonusActions: z.record(z.string(), z.string()),
  Reactions: z.record(z.string(), z.string()),
  LegendaryTraits: z.record(z.string(), z.string()),
  LegendaryActions: LegendaryActionsSchema,
  MythicTrait: MythicTraitSchema,
  LairActions: z.record(z.string(), z.string()),
  RegionalEffects: z.array(z.string()),
}).passthrough();

export type GeneralMonster = z.infer<typeof GeneralMonsterBodySchema>;
export type LegendaryMonster = z.infer<typeof LegendaryMonsterBodySchema>;

export const MonsterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("general"), body: GeneralMonsterBodySchema }),
  z.object({ kind: z.literal("legendary"), body: LegendaryMonsterBodySchema }),
]);
export type Monster = z.infer<typeof MonsterSchema>;
export type MonsterKind = Monster["kind"];

/** Keys whose presence makes a statblock legendary (canonical names and known aliases). */
export const LEGENDARY_MARKER_KEYS = [
  "LegendaryActions",
  "Legendary Actions",
  "Legendary_Actions",
  "LegendaryTraits",
  "LairActions",
  "MythicTrait",
] as const;

/** Legendary if it has legendary actions (or an alias), legendary traits, lair actions or a mythic trait. */
export function classify(raw: unknown): MonsterKind {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "general";
  return LEGENDARY_MARKER_KEYS.some((k) => k in raw) ? "legendary" : "general";
}

/** Parse with the schema `classify` picks. */
export function parseMonster(raw: unknown): z.SafeParseReturnType<unknown, Monster> {
  const kind = classify(raw);
  return MonsterSchema.safeParse({ kind, body: raw });
}
