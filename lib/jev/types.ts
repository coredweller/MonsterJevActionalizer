/**
 * TypeSafe System One (Jev) wire format.
 *
 * Request types are copied verbatim from the reference prototype
 * (`typesafe-assist/smart-assistant/prototype/src/types.ts`, lines 10–76).
 * Response types are external data, so they exist only as zod schemas with inferred types
 * (constitution, Technical Constraints). A compile-time check at the bottom of this file keeps
 * them aligned with the prototype's interfaces.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Request (copied from the prototype)
// ---------------------------------------------------------------------------

/** A Choice question: pick one labelled option from `criteria`. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** option key -> rubric sentence describing when that option applies */
  criteria: Record<string, string | null>;
}

/** A Noul question: a single yes/no probability. */
export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
}

/** A Score question: a number on a legend scale. */
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria?: Record<string, string>;
}

export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export interface SystemOneRequest {
  state: unknown;
  model: string;
  questions: Record<string, Question>;
}

/** Hard limit from the TypeSafe API on Choice cardinality. */
export const MAX_CHOICE_OPTIONS = 255;

/** Sentinel option letting the model opt out of a Choice question. */
export const OPTION_NONE = "none";

// ---------------------------------------------------------------------------
// Response (zod only)
// ---------------------------------------------------------------------------

export const ChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  /** Not always the argmax of `probabilities`: read the distribution, not this field. */
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
export type ChoiceAnswer = z.infer<typeof ChoiceAnswerSchema>;

export const NoulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number(),
});
export type NoulAnswer = z.infer<typeof NoulAnswerSchema>;

export const ScoreAnswerSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
export type ScoreAnswer = z.infer<typeof ScoreAnswerSchema>;

export const AnswerSchema = z.discriminatedUnion("type", [ChoiceAnswerSchema, NoulAnswerSchema, ScoreAnswerSchema]);
export type Answer = z.infer<typeof AnswerSchema>;

export const SystemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), AnswerSchema),
  usage: z.record(z.string(), z.number()).optional(),
});
export type SystemOneResponse = z.infer<typeof SystemOneResponseSchema>;

// ---------------------------------------------------------------------------
// Drift check: type-only copy of the prototype's response interfaces. If the zod schemas above
// stop matching them in either direction, `npm run typecheck` fails on the constants below.
// When the prototype changes, update this copy and the schemas together.
// ---------------------------------------------------------------------------

interface PrototypeChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

interface PrototypeNoulAnswer {
  type: "noul";
  noul: number;
}

interface PrototypeScoreAnswer {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

type PrototypeAnswer = PrototypeChoiceAnswer | PrototypeNoulAnswer | PrototypeScoreAnswer;

interface PrototypeSystemOneResponse {
  model: string;
  answers: Record<string, PrototypeAnswer>;
  usage?: Record<string, number>;
}

/** `true` only when each type is assignable to the other. Tuples stop union distribution. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _answerMatchesPrototype: MutuallyAssignable<Answer, PrototypeAnswer> = true;
const _responseMatchesPrototype: MutuallyAssignable<SystemOneResponse, PrototypeSystemOneResponse> = true;
