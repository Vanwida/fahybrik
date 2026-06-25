import { z } from 'zod';
import { idSchema, isoDateTime, phaseRole } from './_primitives';

// Coach-defined periodization phase (migration 0052 methodology_phases).
// Replaces the hardcoded atr_block_type enum as the source of phase identity.
// `code` and `label` are FREE per coach (no global enum); `role` is the agnostic
// closed axis that drives the generic color ramp + AI semantics.
export const methodologyPhaseSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  // Stable machine code, unique per coach (e.g. 'acc').
  code: z.string().min(1).max(60),
  // Athlete/coach-facing display name. Editable free string.
  label: z.string().min(1).max(120),
  role: phaseRole,
  // Explicit color override (hex or css var). NULL => derived from role.
  color: z.string().max(60).nullable(),
  // Default duration in microcycles (weeks). NULL => coach decides per use.
  default_weeks: z.number().int().min(1).nullable(),
  sequence_order: z.number().int().nonnegative(),
  is_deload: z.boolean(),
  description: z.string().max(2000).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type MethodologyPhase = z.infer<typeof methodologyPhaseSchema>;

// Insert shape: server supplies coach_id; id/timestamps are DB-generated.
// color/default_weeks/description are optional; is_deload defaults false.
export const methodologyPhaseInsertSchema = methodologyPhaseSchema
  .pick({
    coach_id: true,
    code: true,
    label: true,
    role: true,
    color: true,
    default_weeks: true,
    sequence_order: true,
    is_deload: true,
    description: true,
  })
  .partial({ color: true, default_weeks: true, is_deload: true, description: true });
export type MethodologyPhaseInsert = z.infer<typeof methodologyPhaseInsertSchema>;

// =============================================================================
// EDITOR PAYLOAD — one ordered phase per row, sent as a full SET from the
// periodization editor (PUT /api/coach/methodology/phases). The server diffs
// this set against the coach's existing rows (insert/update/delete) in ONE
// atomic transaction.
//
// Why this shape (vs per-row endpoints): reorder + add + remove are a single
// user gesture ("confirmar periodización"); modelling the whole set as one
// atomic upsert keeps sequence_order contiguous and avoids partial saves.
//
// Coach scope: `coach_id` is NOT accepted from the client — the server fills it
// from the session. `sequence_order` is NOT trusted either — the server derives
// it from array position (0..N-1) so order is always contiguous. `code` is
// OPTIONAL: persisted rows keep theirs; new rows get a server-generated slug.
// =============================================================================
export const methodologyPhaseEditSchema = z.object({
  // Present => update an existing row of THIS coach. Absent/null => insert.
  id: idSchema.nullish(),
  // Optional stable machine code; server generates one for new rows.
  code: z.string().min(1).max(60).nullish(),
  label: z.string().trim().min(1).max(120),
  role: phaseRole,
  color: z.string().trim().min(1).max(60).nullish(),
  default_weeks: z.number().int().min(1).max(52).nullish(),
  is_deload: z.boolean().default(false),
  description: z.string().trim().max(2000).nullish(),
});
export type MethodologyPhaseEdit = z.infer<typeof methodologyPhaseEditSchema>;

// The full request: an ORDERED, non-empty array of phases. Order in the array
// IS the periodization order (server writes sequence_order = index + 1).
export const methodologyPhasesSaveSchema = z.object({
  phases: z.array(methodologyPhaseEditSchema).min(1, 'Define al menos una fase'),
});
export type MethodologyPhasesSave = z.infer<typeof methodologyPhasesSaveSchema>;
