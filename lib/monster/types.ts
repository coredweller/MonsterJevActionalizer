/**
 * Extraction types (data-model.md "Extraction"). Every type is a zod schema with the
 * TypeScript type inferred from it, because a ReviewedMonster is read back from storage.
 */
import { z } from "zod";
import { MonsterSchema } from "./schema";

export const AbilitySourceSchema = z.enum([
  "Actions",
  "BonusActions",
  "Reactions",
  "SpecialTraits",
  "LegendaryActions",
  "LairActions",
  "Spellcasting",
]);
export type AbilitySource = z.infer<typeof AbilitySourceSchema>;

export const AbilityCategorySchema = z.enum(["action", "bonus", "reaction", "passive", "legendary", "lair"]);
export type AbilityCategory = z.infer<typeof AbilityCategorySchema>;

export const AbilityUsesSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("at-will") }),
  z.object({ kind: z.literal("per-day"), max: z.number().int().min(1) }),
  /** `min` is the lowest d6 roll that recharges it: 5 for "Recharge 5–6". */
  z.object({ kind: z.literal("recharge"), min: z.number().int().min(1).max(6) }),
  z.object({ kind: z.literal("slot"), level: z.number().int().min(1).max(9) }),
]);
export type AbilityUses = z.infer<typeof AbilityUsesSchema>;

export const AbilityNameSchema = z.enum(["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]);
export type AbilityName = z.infer<typeof AbilityNameSchema>;

export const RangeSchema = z.object({ normal: z.number().int().min(0), long: z.number().int().min(0).optional() });
export const AttackSchema = z.object({
  kind: z.enum(["melee", "ranged"]),
  bonus: z.number().int(),
  reach: z.number().int().min(0).optional(),
  range: RangeSchema.optional(),
});
export type Attack = z.infer<typeof AttackSchema>;

export const SaveSchema = z.object({ ability: AbilityNameSchema, dc: z.number().int().min(1) });
export type Save = z.infer<typeof SaveSchema>;

export const AreaShapeSchema = z.enum(["cone", "line", "sphere", "cube", "cylinder", "radius", "emanation"]);
export const AreaSchema = z.object({ shape: AreaShapeSchema, size: z.number().int().min(1) });
export type Area = z.infer<typeof AreaSchema>;

export const DamageSchema = z.object({ dice: z.string(), avg: z.number().min(0), type: z.string() });
export type Damage = z.infer<typeof DamageSchema>;

export const MultiattackPartSchema = z.object({ abilityId: z.string(), count: z.number().int().min(1) });

export const AbilitySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  source: AbilitySourceSchema,
  category: AbilityCategorySchema,
  uses: AbilityUsesSchema,
  attack: AttackSchema.optional(),
  save: SaveSchema.optional(),
  area: AreaSchema.optional(),
  damage: z.array(DamageSchema).optional(),
  multiattack: z.array(MultiattackPartSchema).optional(),
  /** Range in feet for non-attack abilities and spells (e.g. "within 60 feet"). */
  rangeFt: z.number().int().min(0).optional(),
  concentration: z.boolean().optional(),
  singleTarget: z.boolean(),
  /** e.g. "when it takes the Attack action, it can … as a bonus action". */
  dependsOnAttackAction: z.boolean().optional(),
  /** Set on spells: the spell's base level (0 for cantrips) and whether the SRD table knows it. */
  spellLevel: z.number().int().min(0).max(9).optional(),
  known: z.boolean().optional(),
  raw: z.string(),
  parsed: z.enum(["full", "partial", "none"]),
});
export type Ability = z.infer<typeof AbilitySchema>;

export const SrdSpellSchema = z.object({
  name: z.string(),
  level: z.number().int().min(0).max(9),
  castingTime: z.enum(["action", "bonus", "reaction", "other"]),
  range: z.string(),
  area: AreaSchema.optional(),
  save: AbilityNameSchema.optional(),
  attack: z.enum(["melee", "ranged"]).optional(),
  damage: z.string().optional(),
  concentration: z.boolean(),
});
export type SrdSpell = z.infer<typeof SrdSpellSchema>;

export const SpellEntrySchema = z.object({
  abilityId: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(9),
  uses: AbilityUsesSchema,
  known: z.boolean(),
  spell: SrdSpellSchema.optional(),
});
export type SpellEntry = z.infer<typeof SpellEntrySchema>;

export const SpellcastingSchema = z.object({
  /** Slot level ("1".."9") → max slots. Empty for 2024 at-will / X/day casters. */
  slots: z.record(z.string().regex(/^[1-9]$/), z.number().int().min(0)),
  spells: z.array(SpellEntrySchema),
  saveDc: z.number().int().optional(),
  attackBonus: z.number().int().optional(),
});
export type Spellcasting = z.infer<typeof SpellcastingSchema>;

export const MovementModeSchema = z.enum(["walk", "fly", "swim", "climb", "burrow"]);
export type MovementMode = z.infer<typeof MovementModeSchema>;
export const SpeedMapSchema = z
  .object({
    walk: z.number().int().min(0),
    fly: z.number().int().min(0),
    swim: z.number().int().min(0),
    climb: z.number().int().min(0),
    burrow: z.number().int().min(0),
  })
  .partial();
export type SpeedMap = z.infer<typeof SpeedMapSchema>;

export const ReviewedMonsterSchema = z.object({
  monster: MonsterSchema,
  abilities: z.array(AbilitySchema),
  spellcasting: SpellcastingSchema.optional(),
  hpMax: z.number().int().min(1),
  speed: SpeedMapSchema,
  intScore: z.number().int().min(1).max(30),
  confirmedAt: z.string(),
});
export type ReviewedMonster = z.infer<typeof ReviewedMonsterSchema>;
