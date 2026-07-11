import { z } from 'zod';
import { idSchema, isoDateTime } from './_primitives';

// Program sequences (migration 0059 program_sequences / program_sequence_items).
// A "Secuencia" is one cell of the periodization matrix (level × days) for a
// coach: an ORDERED list of microciclos (program_month_templates) the athlete
// walks through automatically, plus an end-policy and a per-loop progression.
//
// AGNOSTIC: levels via athlete_levels (NOT a level enum). The ORDER of items IS
// the periodization — there is no phase entity. All identity/coach scope is filled
// from the session server-side, never trusted from the client.

// ---------------------------------------------------------------------------
// Closed agnostic axes (the only constrained dimensions).
// ---------------------------------------------------------------------------
// What happens after the last microciclo finishes.
export const sequenceEndPolicy = z.enum(['repeat', 'level_up', 'stop']);
export type SequenceEndPolicy = z.infer<typeof sequenceEndPolicy>;

// What the per-loop progression increment applies to (agnostic across modalities).
export const sequenceProgressionTarget = z.enum(['strength_load', 'volume', 'pace']);
export type SequenceProgressionTarget = z.infer<typeof sequenceProgressionTarget>;

// HYROX/hybrid realistic training cadence. SINGLE SOURCE for the band: the Zod
// schema, the assign-sequence resolver, the training-days endpoint and the
// athlete-detail selector all derive from these two constants.
export const SEQUENCE_DAYS_MIN = 3;
export const SEQUENCE_DAYS_MAX = 6;
export const sequenceDaysPerWeek = z
  .number()
  .int()
  .min(SEQUENCE_DAYS_MIN)
  .max(SEQUENCE_DAYS_MAX);

// ---------------------------------------------------------------------------
// Full row shapes (what GET returns).
// ---------------------------------------------------------------------------
export const programSequenceItemSchema = z.object({
  id: idSchema,
  sequence_id: idSchema,
  // 1-indexed, contiguous within the sequence.
  position: z.number().int().min(1),
  // The microciclo (program_month_templates row) this slot points at.
  month_template_id: idSchema,
});
export type ProgramSequenceItem = z.infer<typeof programSequenceItemSchema>;

export const programSequenceSchema = z.object({
  id: idSchema,
  coach_id: idSchema,
  // Agnostic level (athlete_levels FK).
  level_id: idSchema,
  days_per_week: sequenceDaysPerWeek,
  end_policy: sequenceEndPolicy,
  // Per-loop progression. progression_pct NULL => loop flat. When present,
  // applies_to must also be present (and vice versa) — enforced below.
  progression_pct: z.number().min(0).max(100).nullable(),
  progression_applies_to: sequenceProgressionTarget.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
  items: z.array(programSequenceItemSchema),
});
export type ProgramSequence = z.infer<typeof programSequenceSchema>;

// ---------------------------------------------------------------------------
// EDITOR PAYLOAD — the whole ordered item set + policy for one matrix cell,
// saved atomically (PUT /api/coach/sequences). The server diffs items against
// the cell's current rows (insert/update/delete) in ONE transaction and derives
// `position` from array order (1..N), so ordering is always contiguous.
//
// Coach scope: `coach_id` is NEVER accepted from the client. `position` is NEVER
// trusted (derived from array index). `(level_id, days_per_week)` identify the
// cell — the server upserts the program_sequences row for that cell.
// ---------------------------------------------------------------------------
export const programSequenceItemEditSchema = z.object({
  // The microciclo this slot points at. Required.
  month_template_id: idSchema,
});
export type ProgramSequenceItemEdit = z.infer<typeof programSequenceItemEditSchema>;

export const programSequenceSaveSchema = z
  .object({
    level_id: idSchema,
    days_per_week: sequenceDaysPerWeek,
    end_policy: sequenceEndPolicy.default('repeat'),
    progression_pct: z.number().min(0).max(100).nullish(),
    progression_applies_to: sequenceProgressionTarget.nullish(),
    // ORDERED microciclos. Order in the array IS the walkthrough order. May be
    // empty (a cell can be defined with policy first, items added later).
    items: z.array(programSequenceItemEditSchema),
  })
  // progression_pct and progression_applies_to are an all-or-nothing pair:
  // a percentage with no target (or a target with no percentage) is incoherent.
  .refine(
    (v) =>
      (v.progression_pct == null && v.progression_applies_to == null) ||
      (v.progression_pct != null && v.progression_applies_to != null),
    {
      message:
        'progression_pct y progression_applies_to deben ir juntos (ambos definidos o ambos vacíos).',
      path: ['progression_pct'],
    },
  );
export type ProgramSequenceSave = z.infer<typeof programSequenceSaveSchema>;

// ---------------------------------------------------------------------------
// CELL COPY PAYLOAD — duplicate a whole matrix cell into another (level × days).
// The SOURCE cell is the route coordinate; the body carries only the TARGET.
// days_per_week reuses `sequenceDaysPerWeek` (3-6 band) — the DB CHECK constraint
// forbids anything outside it, so the target selector can never offer an invalid
// cadence. Coach scope + the "target must be empty" guard are server-side.
// ---------------------------------------------------------------------------
export const programSequenceDuplicateSchema = z.object({
  target_level_id: idSchema,
  target_days_per_week: sequenceDaysPerWeek,
});
export type ProgramSequenceDuplicate = z.infer<typeof programSequenceDuplicateSchema>;
