// Wire schema for one tramo / one set on the live save path.
//
// Identity stays strict (position ≥ 0, modality not empty). Everything a
// device or the athlete can get wrong is accepted here and gated at insert
// by `sanitize-*` — a stray number must cost its field, never the session.

import { z } from 'zod';

export const setInputSchema = z.object({
  set_index: z.number(),
  reps_prescribed: z.number().nullish(),
  reps_actual: z.number().nullish(),
  load_prescribed_kg: z.number().nullish(),
  load_actual_kg: z.number().nullish(),
  rpe: z.number().nullish(),
  rir: z.number().nullish(),
  status: z.string().nullish(),
  confirmed: z.boolean().nullish(),
  tempo: z.string().nullish(),
  rest_s: z.number().nullish(),
  reps_source: z.string().nullish(),
  reps_confidence: z.number().nullish(),
  mean_velocity_first_m_s: z.number().nullish(),
  mean_velocity_last_m_s: z.number().nullish(),
  velocity_loss_pct: z.number().nullish(),
  rom_m: z.number().nullish(),
  velocity_confidence: z.number().nullish(),
});

export type SetInput = z.infer<typeof setInputSchema>;

export const segmentInputSchema = z.object({
  template_segment_id: z.number().nullish(),
  position: z.number().int().min(0),
  modality: z.string().min(1),
  started_at: z.string().nullish(),
  ended_at: z.string().nullish(),
  duration_seconds: z.number().nullish(),
  distance_meters: z.number().nullish(),
  avg_pace_s_per_500m: z.number().nullish(),
  avg_pace_s_per_km: z.number().nullish(),
  avg_power_w: z.number().nullish(),
  stroke_rate_spm: z.number().nullish(),
  run_cadence_spm: z.number().nullish(),
  incline_pct: z.number().nullish(),
  avg_hr: z.number().nullish(),
  max_hr: z.number().nullish(),
  hr_source: z.string().nullish(),
  calories: z.number().nullish(),
  reps_completed: z.number().nullish(),
  weight_used_kg: z.number().nullish(),
  reps_prescribed: z.number().nullish(),
  reps_actual: z.number().nullish(),
  reps_status: z.string().nullish(),
  reps_confirmed: z.boolean().nullish(),
  sensor_work_s: z.number().nullish(),
  sensor_rest_s: z.number().nullish(),
  sensor_timing_confidence: z.number().nullish(),
  reps_source: z.string().nullish(),
  reps_confidence: z.number().nullish(),
  is_structural: z.boolean().nullish(),
  emom_rounds_completed: z.number().nullish(),
  emom_rounds_prescribed: z.number().nullish(),
  rx_scaled: z.string().nullish(),
  scaled_note: z.string().nullish(),
  sets: z.array(setInputSchema).nullish(),
  zone_seconds_json: z.unknown().optional(),
  drag_factor: z.number().nullish(),
  avg_calories_per_hour: z.number().nullish(),
  peak_drive_force_lbs: z.number().nullish(),
  avg_drive_force_lbs: z.number().nullish(),
  erg_splits: z.array(z.unknown()).nullish(),
  leg_index: z.number().nullish(),
  leg_role: z.string().nullish(),
  leg_phase: z.string().nullish(),
  source: z.string().nullish(),
});

export type SegmentInput = z.infer<typeof segmentInputSchema>;
