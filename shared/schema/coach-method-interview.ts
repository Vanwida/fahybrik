import { z } from 'zod';
import {
  INTERVIEW_MIRROR_MAX,
  INTERVIEW_NOTE_MAX,
  MULTI_FIELDS,
  NOTE_FIELDS,
  OPTION_IDS,
  SINGLE_FIELDS,
  type CoachMethodAnswers,
} from '../domain/coach/method-interview';

// Cable GET/PUT /api/coach/method-interview
// Una fuente: la ruta valida con esto y el editor no inventa otro shape.

function enumOf(ids: readonly string[]): z.ZodEnum<[string, ...string[]]> {
  const [first, ...rest] = ids;
  if (!first) throw new Error('option list vacía');
  return z.enum([first, ...rest]);
}

const singleShape = Object.fromEntries(
  SINGLE_FIELDS.map((field) => [field, enumOf(OPTION_IDS[field]).nullable()]),
) as { [K in (typeof SINGLE_FIELDS)[number]]: z.ZodNullable<z.ZodEnum<[string, ...string[]]>> };

const multiShape = Object.fromEntries(
  MULTI_FIELDS.map((field) => [field, z.array(enumOf(OPTION_IDS[field])).nullable()]),
) as { [K in (typeof MULTI_FIELDS)[number]]: z.ZodNullable<z.ZodArray<z.ZodEnum<[string, ...string[]]>>> };

const noteShape = Object.fromEntries(
  NOTE_FIELDS.map((field) => [field, z.string().max(INTERVIEW_NOTE_MAX).nullable()]),
) as { [K in (typeof NOTE_FIELDS)[number]]: z.ZodNullable<z.ZodString> };

export const coachMethodAnswersSchema = z
  .object({
    ...singleShape,
    ...multiShape,
    ...noteShape,
  })
  .strict();

export const coachMethodInterviewPutSchema = z
  .object({
    answers: coachMethodAnswersSchema,
    mirror_text: z.string().max(INTERVIEW_MIRROR_MAX).nullable().optional(),
  })
  .strict();

export type CoachMethodInterviewPutInput = z.infer<typeof coachMethodInterviewPutSchema>;

export interface CoachMethodInterviewResponse {
  answers: CoachMethodAnswers;
  generated_mirror: string;
  mirror_text: string;
  mirror_is_edited: boolean;
  answered_count: number;
  question_count: number;
  updated_at: string | null;
}
