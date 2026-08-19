import { z } from 'zod';
import { emailSchema } from './_primitives';
import {
  ONBOARDING_BINDS,
  ONBOARDING_FORM_ORIGINS,
  ONBOARDING_NAME_MAX,
  ONBOARDING_OPTION_LABEL_MAX,
  ONBOARDING_OPTIONS_MAX,
  ONBOARDING_PROMPT_MAX,
  ONBOARDING_QUESTION_TITLE_MAX,
  ONBOARDING_QUESTION_TYPES,
  ONBOARDING_QUESTIONS_PER_STEP_MAX,
  ONBOARDING_STEP_TITLE_MAX,
  ONBOARDING_STEPS_MAX,
  definitionIsValid,
  normalizeOnboardingDefinition,
  type OnboardingFormDefinition,
} from '../domain/coach/onboarding-form';

export const destinationEmailSchema = z
  .union([emailSchema, z.literal(''), z.null()])
  .transform((value: string | null): string | null =>
    value == null || value === '' ? null : value,
  );

const optionSchema = z.object({
  code: z.string().min(1).max(60),
  label: z.string().min(0).max(ONBOARDING_OPTION_LABEL_MAX),
});

const questionSchema = z.object({
  id: z.string().min(2).max(48),
  key: z.string().min(1).max(60),
  type: z.enum(ONBOARDING_QUESTION_TYPES),
  title: z.string().max(ONBOARDING_QUESTION_TITLE_MAX),
  prompt: z.string().max(ONBOARDING_PROMPT_MAX).nullable(),
  required: z.boolean(),
  options: z.array(optionSchema).max(ONBOARDING_OPTIONS_MAX),
  bind: z.enum(ONBOARDING_BINDS).nullable(),
});

const stepSchema = z.object({
  id: z.string().min(2).max(48),
  title: z.string().max(ONBOARDING_STEP_TITLE_MAX),
  questions: z.array(questionSchema).min(1).max(ONBOARDING_QUESTIONS_PER_STEP_MAX),
});

export const onboardingFormDefinitionSchema = z
  .object({
    steps: z.array(stepSchema).min(1).max(ONBOARDING_STEPS_MAX),
  })
  .superRefine((def, ctx) => {
    const normalized = normalizeOnboardingDefinition(def);
    if (definitionIsValid(normalized)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El cuestionario no está bien montado.',
    });
  });
export type OnboardingFormDefinitionInput = z.infer<typeof onboardingFormDefinitionSchema>;

export const onboardingFormWriteSchema = z.object({
  name: z.string().trim().min(1).max(ONBOARDING_NAME_MAX),
  definition: onboardingFormDefinitionSchema,
  is_default: z.boolean().optional(),
  destination_email: destinationEmailSchema.optional(),
});
export type OnboardingFormWrite = z.infer<typeof onboardingFormWriteSchema>;

export const onboardingFormUpdateSchema = z.object({
  name: z.string().trim().min(1).max(ONBOARDING_NAME_MAX).optional(),
  definition: onboardingFormDefinitionSchema.optional(),
  is_default: z.boolean().optional(),
  destination_email: destinationEmailSchema.optional(),
});
export type OnboardingFormUpdate = z.infer<typeof onboardingFormUpdateSchema>;

export const onboardingFormOriginSchema = z.enum(ONBOARDING_FORM_ORIGINS);

export const onboardingFormRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: onboardingFormOriginSchema,
  is_default: z.boolean(),
  public_id: z.string(),
  definition: z.custom<OnboardingFormDefinition>(),
  destination_email: z.string().nullable(),
  step_count: z.number().int(),
  question_count: z.number().int(),
  updated_at: z.string(),
});
export type OnboardingFormRecord = z.infer<typeof onboardingFormRecordSchema>;
