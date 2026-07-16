// The PRESCRIPTION GRAMMAR, as taught to a model.
//
// Two surfaces emit prescriptions through an LLM: the importer's typing pass
// (`llm-assist` — reads the coach's notation and types ONLY what it says) and the
// week composer (`compose-week` — authors a session and MUST state a full dose).
// Their contracts are opposites, but the GRAMMAR they write in is one and the
// same, and it must equal what `prescriptionSchema` accepts.
//
// So the vocabulary lives here, once, DERIVED FROM THE SCHEMA ITSELF
// (`prescriptionSchemeSchema.options`, `modalitySchema.options`) — add a scheme
// to the enum and every prompt learns it on the next build. Each surface supplies
// its own honesty/authoring contract around these lines.

import { prescriptionSchemeSchema, modalitySchema } from './types';

/**
 * The field-by-field grammar of `prescription`. Shared verbatim by every prompt
 * that emits one, so a model taught here can never write a shape the Zod gate
 * downstream rejects.
 */
export function prescriptionGrammarLines(): string[] {
  return [
    'prescription.scheme ∈ ' + prescriptionSchemeSchema.options.join(' | '),
    'prescription.modality (opcional) ∈ ' + modalitySchema.options.join(' | '),
    'Campos de prescription (todos opcionales salvo scheme): modality, rounds, work_s, rest_s, total_s, start, increment, note,',
    '  target (objetivo de intensidad: { kind: "percent_rm"|"kg"|"rpe"|"rir"|"pace"|"hr_zone"|"hr_bpm"|"calories"|"watts"|"bodyweight", value?|min?|max? ; pace usa unit + value_s/min_s/max_s }),',
    '  sets (array por-serie: { measure?: { kind:"reps"|"distance"|"duration"|"calories", ... }, target?, rest_s?, tempo?, note? }).',
    'Los segundos son números en segundos; las distancias en metros; el ritmo en segundos por unidad.',
    'measure: reps usa { kind:"reps", value }, distancia { kind:"distance", meters }, tiempo { kind:"duration", seconds }, calorías { kind:"calories", value }.',
    'pace.unit ∈ per_km (correr) | per_500m (remo/ski) | per_mile.',
  ];
}
