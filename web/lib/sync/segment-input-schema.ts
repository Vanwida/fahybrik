// Wire schema for one tramo / one set on the live save path.
//
// Identity stays strict (position ≥ 0, modality not empty, a numeric set_index):
// an element that fails it is dropped by the list that holds it (`lenientList`),
// alone. Everything a device or the athlete can get wrong — a value out of range
// OR of the wrong type — is accepted here and gated at insert by `sanitize-*`:
// a stray number must cost its field, never the tramo, never the session.

import { z } from 'zod';
import { lenient, lenientList } from '@/lib/sync/lenient';

const num = () => lenient(z.number().nullish());
const str = () => lenient(z.string().nullish());
const bool = () => lenient(z.boolean().nullish());

export const setInputSchema = z.object({
  set_index: z.number(),
  reps_prescribed: num(),
  reps_actual: num(),
  load_prescribed_kg: num(),
  load_actual_kg: num(),
  rpe: num(),
  rir: num(),
  status: str(),
  confirmed: bool(),
  tempo: str(),
  rest_s: num(),
  reps_source: str(),
  reps_confidence: num(),
  mean_velocity_first_m_s: num(),
  mean_velocity_last_m_s: num(),
  velocity_loss_pct: num(),
  rom_m: num(),
  velocity_confidence: num(),
});

export type SetInput = z.infer<typeof setInputSchema>;

export const segmentInputSchema = z.object({
  template_segment_id: num(),
  position: z.number().int().min(0),
  modality: z.string().min(1),
  started_at: str(),
  ended_at: str(),
  duration_seconds: num(),
  distance_meters: num(),
  avg_pace_s_per_500m: num(),
  avg_pace_s_per_km: num(),
  avg_power_w: num(),
  stroke_rate_spm: num(),
  run_cadence_spm: num(),
  incline_pct: num(),
  avg_hr: num(),
  max_hr: num(),
  hr_source: str(),
  calories: num(),
  reps_completed: num(),
  weight_used_kg: num(),
  reps_prescribed: num(),
  reps_actual: num(),
  reps_status: str(),
  reps_confirmed: bool(),
  sensor_work_s: num(),
  sensor_rest_s: num(),
  sensor_timing_confidence: num(),
  reps_source: str(),
  reps_confidence: num(),
  is_structural: bool(),
  emom_rounds_completed: num(),
  emom_rounds_prescribed: num(),
  rx_scaled: str(),
  scaled_note: str(),
  // A set without its index is dropped alone; the tramo keeps the rest.
  sets: lenientList(setInputSchema),
  zone_seconds_json: z.unknown().optional(),
  drag_factor: num(),
  avg_calories_per_hour: num(),
  peak_drive_force_lbs: num(),
  avg_drive_force_lbs: num(),
  erg_splits: lenient(z.array(z.unknown()).nullish()),
  leg_index: num(),
  leg_role: str(),
  leg_phase: str(),
  source: str(),
});

export type SegmentInput = z.infer<typeof segmentInputSchema>;
