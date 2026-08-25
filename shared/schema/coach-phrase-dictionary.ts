import { z } from 'zod';
import {
  PHRASE_MAPPING_KINDS,
  PHRASE_MAPPING_PERCENT_MAX,
  PHRASE_MAPPING_VALUE_MAX,
  phraseKeyFrom,
  type CoachPhraseMapping,
} from '../domain/coach/phrase-dictionary';

// Contrato de cable del diccionario de frases de carga.
//   GET /api/coach/phrase-dictionary  → CoachPhraseDictionaryResponse
//   PUT /api/coach/phrase-dictionary  ← coachPhraseDictionaryPutSchema
// snake_case. Guardar reemplaza el conjunto entero. Vacío = no lo sé.

const kindSchema = z.enum(PHRASE_MAPPING_KINDS);

export const coachPhraseMappingPutSchema = z
  .object({
    phrase: z.string().trim().min(1).max(80),
    as: kindSchema,
    value: z.number().positive().max(PHRASE_MAPPING_VALUE_MAX),
    value_max: z.number().positive().max(PHRASE_MAPPING_VALUE_MAX).optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.as !== 'kg' && row.value > PHRASE_MAPPING_PERCENT_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Un porcentaje no pasa de 400.',
      });
    }
    if (row.value_max !== undefined && row.value_max < row.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value_max'],
        message: 'El techo no puede ser menor que el suelo.',
      });
    }
  });

export const coachPhraseDictionaryPutSchema = z
  .object({
    entries: z.array(coachPhraseMappingPutSchema).max(80),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const [i, entry] of body.entries.entries()) {
      const key = phraseKeyFrom(entry.phrase);
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', i, 'phrase'],
          message: 'Esa frase ya está en la lista.',
        });
      }
      seen.add(key);
    }
  });

export type CoachPhraseDictionaryPutInput = z.infer<typeof coachPhraseDictionaryPutSchema>;

export interface CoachPhraseDictionaryResponse {
  entries: CoachPhraseMapping[];
  updated_at: string | null;
}
