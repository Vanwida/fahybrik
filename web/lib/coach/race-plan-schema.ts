// Local mirror of /shared/schema/race-plan.ts.
//
// Why mirrored: Turbopack can't resolve the `.js` literal imports from the
// `@fahybrid/shared` workspace package (see #29 follow-up). When that lands
// the local copy can be deleted in favour of the workspace import.
//
// The shape MUST stay byte-equivalent with the shared file. If you change
// one, change the other in the same commit.

import { z } from 'zod';

// IDs cross the wire as strings (bigint-safe). The DB stores bigint; we
// stringify with `::text` when reading and Number() on writes.
const idSchema = z.string().regex(/^\d+$/, 'expected positive integer string');
const isoDateTime = z.string().datetime({ offset: true });

export const HYROX_ELEMENT_COUNT = 16 as const;
export const STATION_INDEX_RUN = [1, 3, 5, 7, 9, 11, 13, 15] as const;
export const STATION_INDEX_STATION = [2, 4, 6, 8, 10, 12, 14, 16] as const;

export const HYROX_STATION_LABELS: Readonly<Record<number, string>> = {
  1: 'Run 1km',
  2: 'SkiErg 1km',
  3: 'Run 1km',
  4: 'Sled push',
  5: 'Run 1km',
  6: 'Sled pull',
  7: 'Run 1km',
  8: 'Burpee broad jump 80m',
  9: 'Run 1km',
  10: 'Row 1km',
  11: 'Run 1km',
  12: 'Farmer carry 200m',
  13: 'Run 1km',
  14: 'Sandbag lunge 200m',
  15: 'Run 1km',
  16: 'Wall ball 100',
} as const;

// ---------------------------------------------------------------------------
// Race plan
// ---------------------------------------------------------------------------

export const racePlanStationPacingSchema = z.object({
  station_index: z.number().int().min(1).max(HYROX_ELEMENT_COUNT),
  label: z.string().min(1).max(80),
  target_pace: z.string().max(40).nullable().default(null),
  note: z.string().max(200).nullable().default(null),
});
export type RacePlanStationPacing = z.infer<typeof racePlanStationPacingSchema>;

export const racePlanNutritionSchema = z.object({
  pre_3h: z.string().max(400).nullable().default(null),
  pre_45m: z.string().max(400).nullable().default(null),
  intra: z.string().max(400).nullable().default(null),
  post: z.string().max(400).nullable().default(null),
});
export type RacePlanNutrition = z.infer<typeof racePlanNutritionSchema>;

export const racePlanKitItemSchema = z.object({
  item: z.string().min(1).max(160),
  checked: z.boolean().default(false),
  notes: z.string().max(200).nullable().default(null),
});
export type RacePlanKitItem = z.infer<typeof racePlanKitItemSchema>;

export const racePlanMentalCueSchema = z.object({
  station_index: z
    .number()
    .int()
    .min(1)
    .max(HYROX_ELEMENT_COUNT)
    .nullable()
    .default(null),
  cue: z.string().min(1).max(280),
});
export type RacePlanMentalCue = z.infer<typeof racePlanMentalCueSchema>;

export const racePlanContingencySchema = z.object({
  trigger: z.string().min(1).max(160),
  action: z.string().min(1).max(280),
});
export type RacePlanContingency = z.infer<typeof racePlanContingencySchema>;

export const racePlanStatus = z.enum(['draft', 'approved', 'locked']);
export type RacePlanStatus = z.infer<typeof racePlanStatus>;

export const racePlanSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  target_event_id: idSchema,
  time_goal_seconds: z.number().int().min(1200).max(14400).nullable(),
  station_pacing: z.array(racePlanStationPacingSchema).max(HYROX_ELEMENT_COUNT),
  nutrition: racePlanNutritionSchema,
  kit: z.array(racePlanKitItemSchema).max(40),
  mental_cues: z.array(racePlanMentalCueSchema).max(40),
  contingency: z.array(racePlanContingencySchema).max(20),
  coach_note: z.string().max(2000).nullable(),
  status: racePlanStatus,
  approved_by_coach_id: idSchema.nullable(),
  approved_at: isoDateTime.nullable(),
  version: z.number().int().min(1),
  parent_race_plan_id: idSchema.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type RacePlan = z.infer<typeof racePlanSchema>;

export const racePlanUpsertSchema = z.object({
  athlete_id: idSchema,
  target_event_id: idSchema,
  time_goal_seconds: z.number().int().min(1200).max(14400).nullable().optional(),
  station_pacing: z.array(racePlanStationPacingSchema).max(HYROX_ELEMENT_COUNT).optional(),
  nutrition: racePlanNutritionSchema.optional(),
  kit: z.array(racePlanKitItemSchema).max(40).optional(),
  mental_cues: z.array(racePlanMentalCueSchema).max(40).optional(),
  contingency: z.array(racePlanContingencySchema).max(20).optional(),
  coach_note: z.string().max(2000).nullable().optional(),
});
export type RacePlanUpsert = z.infer<typeof racePlanUpsertSchema>;

export const racePlanApproveSchema = z.object({
  race_plan_id: idSchema,
});
export type RacePlanApprove = z.infer<typeof racePlanApproveSchema>;

// ---------------------------------------------------------------------------
// Race result
// ---------------------------------------------------------------------------

export const racePlanStationActualSchema = z.object({
  station_index: z.number().int().min(1).max(HYROX_ELEMENT_COUNT),
  duration_seconds: z.number().int().min(0).max(7200),
  notes: z.string().max(200).nullable().default(null),
});
export type RacePlanStationActual = z.infer<typeof racePlanStationActualSchema>;

export const raceResultSchema = z.object({
  id: idSchema,
  race_plan_id: idSchema,
  athlete_id: idSchema,
  finish_time_seconds: z.number().int().min(600).max(21600),
  finish_position: z.number().int().positive().nullable(),
  division: z.string().min(1).max(80).nullable(),
  station_actuals: z.array(racePlanStationActualSchema).max(HYROX_ELEMENT_COUNT),
  recorded_at: isoDateTime,
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type RaceResult = z.infer<typeof raceResultSchema>;

export const raceResultUpsertSchema = z.object({
  race_plan_id: idSchema,
  finish_time_seconds: z.number().int().min(600).max(21600),
  finish_position: z.number().int().positive().nullable().optional(),
  division: z.string().min(1).max(80).nullable().optional(),
  station_actuals: z.array(racePlanStationActualSchema).max(HYROX_ELEMENT_COUNT).default([]),
});
export type RaceResultUpsert = z.infer<typeof raceResultUpsertSchema>;

// ---------------------------------------------------------------------------
// Race debrief
// ---------------------------------------------------------------------------

export const racePaceRealism = z.enum(['realistic', 'too_ambitious', 'too_conservative']);
export type RacePaceRealism = z.infer<typeof racePaceRealism>;

export const raceDebriefSchema = z.object({
  id: idSchema,
  race_result_id: idSchema,
  athlete_id: idSchema,
  soreness_post: z.number().int().min(1).max(5),
  energy_during: z.number().int().min(1).max(5),
  had_crisis: z.boolean(),
  crisis_at_station: z.number().int().min(1).max(HYROX_ELEMENT_COUNT).nullable(),
  crisis_notes: z.string().max(2000).nullable(),
  what_worked: z.string().max(4000).nullable(),
  what_to_improve: z.string().max(4000).nullable(),
  pace_realism: racePaceRealism,
  lessons_text: z.string().max(4000).nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type RaceDebrief = z.infer<typeof raceDebriefSchema>;

export const raceDebriefSubmitSchema = z
  .object({
    race_result_id: idSchema,
    soreness_post: z.number().int().min(1).max(5),
    energy_during: z.number().int().min(1).max(5),
    had_crisis: z.boolean(),
    crisis_at_station: z
      .number()
      .int()
      .min(1)
      .max(HYROX_ELEMENT_COUNT)
      .nullable()
      .default(null),
    crisis_notes: z.string().max(2000).nullable().default(null),
    what_worked: z.string().max(4000).nullable().default(null),
    what_to_improve: z.string().max(4000).nullable().default(null),
    pace_realism: racePaceRealism,
    lessons_text: z.string().max(4000).nullable().default(null),
  })
  .refine(
    (d) => (d.had_crisis ? d.crisis_at_station != null : d.crisis_at_station == null),
    { message: 'crisis_at_station requerido si had_crisis=true', path: ['crisis_at_station'] },
  );
export type RaceDebriefSubmit = z.infer<typeof raceDebriefSubmitSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const RACE_PLAN_UNLOCK_DAYS = 21;
export const RACE_PLAN_APPROVAL_LEAD_DAYS = 7;

export function defaultStationPacing(): RacePlanStationPacing[] {
  const out: RacePlanStationPacing[] = [];
  for (let i = 1; i <= HYROX_ELEMENT_COUNT; i++) {
    out.push({
      station_index: i,
      label: HYROX_STATION_LABELS[i] ?? `Element ${i}`,
      target_pace: null,
      note: null,
    });
  }
  return out;
}

export function defaultNutrition(): RacePlanNutrition {
  return { pre_3h: null, pre_45m: null, intra: null, post: null };
}

export function formatTimeGoal(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseTimeGoal(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  let secs = 0;
  if (parts.length === 3) {
    secs = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  } else if (parts.length === 2) {
    secs = Number(parts[0]) * 60 + Number(parts[1]);
  } else if (parts.length === 1) {
    secs = Number(parts[0]);
  } else {
    return null;
  }
  if (secs < 1200 || secs > 14400) return null;
  return secs;
}
