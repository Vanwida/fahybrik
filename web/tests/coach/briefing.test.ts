import { describe, expect, test } from 'vitest';
import { buildBriefing } from '@/lib/coach/briefing';
import {
  readLoadCoverage,
  summarizeLoad,
} from '@fahybrid/shared/domain/training-load';
import type { AlertReason, CohortRow } from '@fahybrid/shared/domain/coach/types';

// Built from the real reader over an empty series rather than hand-written:
// a fabricated coverage literal in a fixture is exactly the kind of plausible
// default this field exists to kill.
const NO_WORK_COVERAGE = readLoadCoverage(summarizeLoad([]));

// Real-shaped cohort fixture (is_demo: false) — buildBriefing is pure over a
// CohortRow[], so we exercise it with honest rows instead of the deleted demo
// generator. Defaults are all-null/empty; each test overrides only what it asserts.
function row(overrides: Partial<CohortRow> = {}): CohortRow {
  return {
    athlete_id: '1',
    full_name: 'Atleta Real',
    is_demo: false,
    block_type: 'Semana base',
    block_week: 1,
    compliance_pct: 80,
    hrv_delta_ms: null,
    hrv_trend: null,
    acr: null,
    tsb: null,
    ctl: null,
    atl: null,
    load_coverage: NO_WORK_COVERAGE,
    next_session: null,
    last_sync_at: null,
    sync_minutes_ago: null,
    race_readiness: null,
    polarization_pct: null,
    z45_pct_7d: null,
    vo2max: null,
    vo2max_trend: null,
    sleep_avg_7d_h: null,
    rhr: null,
    days_to_a_event: null,
    volume_7d_h: null,
    sessions_today: { am: null, pm: null },
    last_checkin_at: null,
    in_gym_today: false,
    alerts: [],
    primary_alert: null,
    flags: {
      transition_ready: false,
      test_today: false,
      twice_daily_today: false,
      a_event_within_30d: false,
    },
    programming_status: 'ok',
    programming_label: null,
    readiness_score: null,
    ...overrides,
  };
}

const CRITICAL_ALERT: AlertReason = {
  kind: 'hrv_crash',
  severity: 'critical',
  label: 'HRV crash',
  detail: '▼ 12 ms vs baseline',
};

function cohortFixture(): CohortRow[] {
  return [
    row({
      athlete_id: '1',
      full_name: 'Bruno Ferrer',
      sessions_today: { am: 'done', pm: 'pending' },
      alerts: [CRITICAL_ALERT],
      primary_alert: CRITICAL_ALERT,
    }),
    row({
      athlete_id: '2',
      full_name: 'Marc Vidal',
      sessions_today: { am: 'pending', pm: null },
    }),
  ];
}

describe('buildBriefing', () => {
  test('morning greeting uses BUENOS DÍAS and first name uppercase', () => {
    const briefing = buildBriefing({
      coach_first_name: 'Pablo Castaño',
      cohort: cohortFixture(),
      now: new Date('2026-05-07T09:00:00Z'),
    });
    expect(briefing.greeting).toBe('BUENOS DÍAS, PABLO');
    expect(briefing.time_of_day).toBe('morning');
  });

  test('aggregates session counts and alerts from the cohort', () => {
    const briefing = buildBriefing({
      coach_first_name: 'Pablo',
      cohort: cohortFixture(),
    });
    const sessionLine = briefing.lines.find((l) => l.id === 'sessions');
    expect(sessionLine).toBeTruthy();
    const alertLine = briefing.lines.find((l) => l.id === 'alerts');
    expect(alertLine?.emphasis).toBe('critical');
  });

  test('first-time state when cohort is empty', () => {
    const briefing = buildBriefing({ coach_first_name: 'Pablo', cohort: [] });
    expect(briefing.is_first_time).toBe(true);
    expect(briefing.active_athlete_count).toBe(0);
  });

  test('night greeting after 22h', () => {
    const briefing = buildBriefing({
      coach_first_name: 'Pablo',
      cohort: cohortFixture(),
      now: new Date('2026-05-07T22:30:00'),
    });
    expect(briefing.time_of_day).toBe('night');
    expect(briefing.greeting).toBe('BUENAS NOCHES, PABLO');
  });
});
