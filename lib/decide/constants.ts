/** Confidence and consistency thresholds (PLAN.md "Interpretation"; constitution Principle II). */

/** Top-pick probability at or above this is "high" confidence. */
export const CONFIDENCE_HIGH = 0.85;
/** Top-pick probability at or above this (and below high) is "medium"; below it is "DM's call". */
export const CONFIDENCE_MEDIUM = 0.6;
/** `should_retreat` at or above this prefers Disengage or Dash with retreat movement. */
export const RETREAT_THRESHOLD = 0.6;
/** `spend_resource` below this boosts the best option that uses no limited resource (assumed; the plan says "low"). */
export const SPEND_RESOURCE_LOW = 0.4;
/** Probabilities this close count as tied (PLAN.md "Interpretation"), so float noise can't break a tie. */
export const TIE_EPSILON = 1e-9;
/** Single-target candidates that get a `target__<i>` question (research R5). */
export const TARGET_CANDIDATES = 4;
/** Area candidates that get a `cluster__<i>` question (research R5). */
export const CLUSTER_CANDIDATES = 3;
/** Leveled-spell candidates that get a `slot_level__<i>` question ("top 3–4 candidates", PLAN.md). */
export const SLOT_CANDIDATES = 4;
/** Runners-up listed per question on the recommendation card (PLAN.md "Recommendation card"). */
export const RUNNERS_UP_PER_QUESTION = 3;
/** Turn-log entries included in Jev's state. */
export const HISTORY_TURNS = 3;
