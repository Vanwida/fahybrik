// Translation of free-form provider metric names → canonical biometric_metric
// enum (see infra/migrations/0001_init.sql).
//
// HealthKit ships strings like "heart_rate", "hrv_sdnn", "vo2_max"; Garmin
// summaries include their own naming. We narrow both into the small enum so
// downstream consumers (cohort, briefing, deep-dive) only have to know one
// vocabulary.
//
// Returning null means: drop the sample silently. We never throw on unknown
// metric names — providers add new ones (e.g., walking_steadiness) and we'd
// rather log + drop than 500 the whole batch.

export type CanonicalMetric =
  | 'hr'
  | 'hr_resting'
  | 'hrv'
  | 'sleep_duration'
  | 'sleep_score'
  | 'vo2max'
  | 'recovery'
  | 'training_load'
  | 'body_battery'
  | 'stress'
  | 'respiration'
  | 'spo2'
  | 'steps'
  | 'calories_active'
  | 'weight'
  | 'body_fat';

const HEALTHKIT_METRIC_MAP: Record<string, CanonicalMetric> = {
  heart_rate: 'hr',
  hr: 'hr',
  resting_heart_rate: 'hr_resting',
  hr_resting: 'hr_resting',
  hrv_sdnn: 'hrv',
  hrv: 'hrv',
  vo2_max: 'vo2max',
  vo2max: 'vo2max',
  active_energy_kcal: 'calories_active',
  active_energy: 'calories_active',
  body_mass_kg: 'weight',
  body_mass: 'weight',
  body_fat_percentage: 'body_fat',
  oxygen_saturation: 'spo2',
  respiratory_rate: 'respiration',
  step_count: 'steps',
  steps: 'steps',
  sleep_duration: 'sleep_duration',
};

export function canonicalizeHealthkitMetric(metric: string): CanonicalMetric | null {
  return HEALTHKIT_METRIC_MAP[metric.toLowerCase()] ?? null;
}

// Garmin Health Activity API field → metric mapping is done inline in the
// webhook (each summary type has its own shape). This helper is for the
// per-sample push (heartRateVariabilities, userMetrics).
const GARMIN_METRIC_MAP: Record<string, CanonicalMetric> = {
  hrv: 'hrv',
  hr: 'hr',
  heartRate: 'hr',
  restingHeartRate: 'hr_resting',
  vo2Max: 'vo2max',
  steps: 'steps',
  bodyBattery: 'body_battery',
  stress: 'stress',
  sleepDuration: 'sleep_duration',
  weight: 'weight',
  bodyFat: 'body_fat',
};

export function canonicalizeGarminMetric(metric: string): CanonicalMetric | null {
  return GARMIN_METRIC_MAP[metric] ?? null;
}
