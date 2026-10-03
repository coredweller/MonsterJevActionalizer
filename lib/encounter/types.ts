/** Encounter types (data-model.md "Encounter"), as zod schemas with inferred types. */
import { z } from "zod";
import { ReviewedMonsterSchema } from "../monster/types";

export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;
export const ConditionSchema = z.enum(CONDITIONS);
export type Condition = z.infer<typeof ConditionSchema>;

export const ConcentrationSchema = z.object({ abilityId: z.string(), name: z.string() });

export const EncounterStateSchema = z.object({
  hp: z.number().int().min(0),
  hpMax: z.number().int().min(1),
  /** Slot level ("1".."9") → remaining. */
  slots: z.record(z.string(), z.number().int().min(0)),
  /** Ability id → remaining daily uses. */
  perDay: z.record(z.string(), z.number().int().min(0)),
  recharge: z.record(z.string(), z.enum(["available", "spent"])),
  legendaryActionsLeft: z.number().int().min(0),
  legendaryResistanceLeft: z.number().int().min(0),
  conditions: z.array(ConditionSchema),
  concentration: ConcentrationSchema.nullable(),
  round: z.number().int().min(1),
});
export type EncounterState = z.infer<typeof EncounterStateSchema>;

export const TemperamentSchema = z.enum(["mindless", "feral", "cunning", "genius"]);
export type Temperament = z.infer<typeof TemperamentSchema>;

export const SettingsSchema = z.object({
  temperament: TemperamentSchema,
  morale: z.number().int().min(0).max(100),
  rechargeMode: z.enum(["auto", "manual"]),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const PlayerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  role: z.enum(["melee", "ranged", "caster", "healer"]),
  class: z.string(),
  ac: z.number().int().min(0).optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const ZoneSchema = z.enum(["engaged", "near", "far", "veryFar"]);
export type Zone = z.infer<typeof ZoneSchema>;

/** Default distance per zone, used only when no exact distance is given. */
export const ZONE_DEFAULT_FT: Record<Zone, number> = { engaged: 5, near: 30, far: 60, veryFar: 61 };

export const ApparentHpSchema = z.enum(["healthy", "bloodied", "nearDown", "down"]);
export type ApparentHp = z.infer<typeof ApparentHpSchema>;

export const PlayerTurnSchema = z.object({
  playerId: z.string(),
  zone: ZoneSchema,
  distanceFt: z.number().int().min(0).optional(),
  apparentHp: ApparentHpSchema,
  conditions: z.array(z.string()),
  cover: z.enum(["none", "half", "threeQuarters", "total"]),
  hitMonsterLastRound: z.boolean(),
  clusteredWith: z.array(z.string()),
});
export type PlayerTurn = z.infer<typeof PlayerTurnSchema>;

export const SituationSchema = z.object({
  players: z.array(PlayerTurnSchema),
  allies: z.object({ present: z.boolean(), count: z.number().int().min(0) }),
  terrain: z.object({
    difficult: z.boolean(),
    chokepoint: z.boolean(),
    escapeRoute: z.boolean(),
    flyingPossible: z.boolean(),
  }),
  notes: z.string(),
});
export type Situation = z.infer<typeof SituationSchema>;

export const MovementSchema = z.enum(["hold", "closeIn", "reachOther", "retreat", "takeCover", "flyUp"]);
export type Movement = z.infer<typeof MovementSchema>;

export const TurnResultSchema = z.enum(["hit", "miss", "downed", "effect"]);
export type TurnResult = z.infer<typeof TurnResultSchema>;

export const TurnLogEntrySchema = z.object({
  round: z.number().int().min(1),
  moveBefore: MovementSchema,
  /** Option key of the action taken, or null when the monster took none. */
  actionId: z.string().nullable(),
  actionName: z.string(),
  targetIds: z.array(z.string()),
  clusterId: z.string().optional(),
  slotLevel: z.number().int().min(1).max(9).optional(),
  /** Option key of the bonus action, or null for none. */
  bonusActionId: z.string().nullable(),
  bonusActionName: z.string(),
  bonusTargetIds: z.array(z.string()).default([]),
  moveAfter: MovementSchema,
  result: TurnResultSchema.optional(),
  note: z.string().optional(),
  recommended: z.boolean(),
});
export type TurnLogEntry = z.infer<typeof TurnLogEntrySchema>;

export const TrackerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  reviewed: ReviewedMonsterSchema,
  state: EncounterStateSchema,
  roster: z.array(PlayerSchema),
  situation: SituationSchema,
  log: z.array(TurnLogEntrySchema),
  settings: SettingsSchema,
  createdAt: z.string(),
});
export type Tracker = z.infer<typeof TrackerSchema>;
