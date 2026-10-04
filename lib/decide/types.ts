/**
 * Decision types (data-model.md "Decision", contracts/decide-api.md), as zod schemas with inferred
 * types. Shared by interpret, explain, the `/api/decide` route and the client, which parses the
 * route's response with `DecideResponseSchema`.
 */
import { z } from "zod";
import { MovementSchema, SituationSchema, SlotLevelSchema, TrackerSchema } from "../encounter/types";
import { BlockedSchema, LegalOptionsSchema } from "../monster/options";

/** The `tactic` question's keys (contracts/jev-questions.md). */
export const TacticSchema = z.enum(["aggressive", "focus_weakest", "focus_threat", "control", "defensive", "flee"]);
export type Tactic = z.infer<typeof TacticSchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "dmsCall"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Who chose a target, cluster or slot level. `jev`: the argmax of that candidate question.
 * `only`: there was a single value, so no question was asked. `code`: the option had no candidate
 * question, or Jev's answer had no usable key, so code picked by a fixed rule (lowest apparent HP in
 * range; the cluster catching the most; the lowest available slot).
 */
export const PickSourceSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("jev"), question: z.string(), p: z.number() }),
  z.object({ by: z.literal("only") }),
  z.object({ by: z.literal("code") }),
]);
export type PickSource = z.infer<typeof PickSourceSchema>;

/**
 * A recommended action or bonus action. `key` is a legal option key. For an area option, `targetIds`
 * are the members of the picked cluster.
 */
export const ActionPickSchema = z.object({
  key: z.string(),
  targetIds: z.array(z.string()).optional(),
  targetBy: PickSourceSchema.optional(),
  /** `Cluster.id` (e.g. `cluster_1`), as logged by Apply. */
  clusterId: z.string().optional(),
  clusterBy: PickSourceSchema.optional(),
  slotLevel: SlotLevelSchema.optional(),
  slotLevelBy: PickSourceSchema.optional(),
});
export type ActionPick = z.infer<typeof ActionPickSchema>;

/** The consistency rules and reading steps interpret applies, in the order it applies them. */
export const AdjustmentRuleSchema = z.enum([
  "unknown-keys",
  "choice-not-argmax",
  "tie-break",
  "retreat",
  "spend-resource-low",
  "out-of-range",
  "one-leveled-spell",
  "attack-dependent-bonus",
  "concentration",
  "code-pick",
]);
export type AdjustmentRule = z.infer<typeof AdjustmentRuleSchema>;

export const AdjustmentSchema = z.object({ rule: AdjustmentRuleSchema, detail: z.string() });
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const RunnerUpSchema = z.object({ question: z.string(), key: z.string(), p: z.number() });
export type RunnerUp = z.infer<typeof RunnerUpSchema>;

export const RecommendationSchema = z.object({
  moveBefore: MovementSchema,
  action: ActionPickSchema,
  bonusAction: ActionPickSchema,
  moveAfter: MovementSchema,
  /** null when the tactic answer had no usable key. */
  tactic: TacticSchema.nullable(),
  /** From the final action's probability (CONFIDENCE_HIGH / CONFIDENCE_MEDIUM). */
  confidence: ConfidenceSchema,
  /** Jev's choice distributions per asked question, keeping only the keys that question offered. */
  probabilities: z.record(z.string(), z.record(z.string(), z.number())),
  /** Jev's noul answers: `should_retreat`, `spend_resource`, `multiattack_fallback` when asked. */
  nouls: z.record(z.string(), z.number()),
  runnersUp: z.array(RunnerUpSchema),
  warnings: z.array(z.string()),
  explanation: z.string(),
  adjustments: z.array(AdjustmentSchema),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** What interpret hands explain: everything but the explanation and runners-up. */
export type RecommendationDraft = Omit<Recommendation, "explanation" | "runnersUp">;

/** A hard-blocked monster: no action, bonus action, tactic or probabilities. `null` movement = the DM picks. */
export const BlockedRecommendationSchema = z.object({
  blocked: BlockedSchema,
  moveBefore: z.literal("hold").nullable(),
  moveAfter: z.literal("hold").nullable(),
});
export type BlockedRecommendation = z.infer<typeof BlockedRecommendationSchema>;

// ---------------------------------------------------------------------------
// POST /api/decide (contracts/decide-api.md)
// ---------------------------------------------------------------------------

/** The tracker fields the route needs; the rest of a Tracker is stripped. */
export const DecideTrackerSchema = TrackerSchema.pick({ reviewed: true, state: true, settings: true, roster: true, log: true });
export type DecideTracker = z.infer<typeof DecideTrackerSchema>;

export const DecideRequestSchema = z.object({ tracker: DecideTrackerSchema, situation: SituationSchema });
export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export const DecideErrorKindSchema = z.enum(["invalid-request", "config", "upstream", "timeout"]);
export type DecideErrorKind = z.infer<typeof DecideErrorKindSchema>;

export const DecideResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    recommendation: RecommendationSchema,
    options: LegalOptionsSchema,
    meta: z.object({ model: z.string(), latencyMs: z.number(), usage: z.record(z.string(), z.number()).optional() }),
  }),
  z.object({
    ok: z.literal(true),
    recommendation: BlockedRecommendationSchema,
    options: LegalOptionsSchema,
    meta: z.object({ jevCalled: z.literal(false) }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ kind: DecideErrorKindSchema, message: z.string() }) }),
]);
export type DecideResponse = z.infer<typeof DecideResponseSchema>;
