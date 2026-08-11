import { describe, expect, it } from 'vitest';
import { deriveRecoveryVerdict } from '@/lib/dashboard/coach/biometria-recovery';
import type { BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';

function emptyBody(over: Partial<BodyPayload> = {}): BodyPayload {
  return {
    generated_at_iso: '2026-08-11T12:00:00.000Z',
    athlete_id: '1',
    athlete_name: 'Test',
    has_any_data: true,
    hrv: {
      daily: [],
      baseline_28d: [],
      current_baseline_ms: null,
      drops_count: 0,
      spikes_count: 0,
      last_value_ms: null,
      last_delta_ms: null,
      rmssd_avg_ms: null,
      sdnn_avg_ms: null,
    },
    sleep: {
      nights: [],
      avg_total_hours: null,
      avg_efficiency_pct: null,
      avg_wakeups: null,
      bedtime_variance_min: null,
      waketime_variance_min: null,
    },
    rhr: {
      daily: [],
      baseline_30d: null,
      trend_30d: null,
      delta_30d_bpm: null,
      last_bpm: null,
    },
    vo2max: { monthly: [], current_value: null, delta_3m: null },
    composition: {
      weight_daily: [],
      weight_weekly_avg: [],
      current_weight_kg: null,
      weight_delta_30d_kg: null,
      body_fat_pct: null,
      body_fat_delta_30d_pct: null,
      dexa_snapshots: [],
      hydration_avg_l: null,
    },
    wellness: { metrics: [], checkins_done_30d: 0, checkins_total_30d: 0 },
    ...over,
  };
}

describe('deriveRecoveryVerdict (Whoop/Oura-shaped)', () => {
  it('unknown when there is no physiological signal', () => {
    const v = deriveRecoveryVerdict(emptyBody());
    expect(v.band).toBe('unknown');
    expect(v.has_signal).toBe(false);
  });

  it('green when HRV at baseline, RHR calm, sleep enough', () => {
    const v = deriveRecoveryVerdict(
      emptyBody({
        hrv: {
          ...emptyBody().hrv,
          last_value_ms: 50,
          current_baseline_ms: 50,
          drops_count: 0,
        },
        rhr: {
          ...emptyBody().rhr,
          last_bpm: 52,
          baseline_30d: 52,
          trend_30d: 'flat',
          delta_30d_bpm: 0,
        },
        sleep: {
          ...emptyBody().sleep,
          nights: [{ iso_date: '2026-08-10', total_hours: 7.5, deep_hours: null, rem_hours: null, light_hours: null, efficiency_pct: null, wakeups: null, bedtime_iso: null, waketime_iso: null }],
        },
      }),
    );
    expect(v.band).toBe('green');
    expect(v.label).toBe('Puede cargar');
  });

  it('red when HRV is far under baseline', () => {
    const v = deriveRecoveryVerdict(
      emptyBody({
        hrv: {
          ...emptyBody().hrv,
          last_value_ms: 35,
          current_baseline_ms: 50, // 70% of baseline
          drops_count: 0,
        },
      }),
    );
    expect(v.band).toBe('red');
    expect(v.label).toBe('Descargar');
  });

  it('yellow when sleep is short but not catastrophic', () => {
    const v = deriveRecoveryVerdict(
      emptyBody({
        hrv: {
          ...emptyBody().hrv,
          last_value_ms: 50,
          current_baseline_ms: 50,
        },
        sleep: {
          ...emptyBody().sleep,
          nights: [{ iso_date: '2026-08-10', total_hours: 6.0, deep_hours: null, rem_hours: null, light_hours: null, efficiency_pct: null, wakeups: null, bedtime_iso: null, waketime_iso: null }],
        },
      }),
    );
    expect(v.band).toBe('yellow');
    expect(v.label).toBe('Mantener');
  });
});
