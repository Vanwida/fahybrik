// Demo cohort generator. Used when Pablo's account has < 3 real athletes so the
// dashboard looks alive for in-progress demos. Every row is flagged is_demo=true
// so the UI can render a subtle marker (and so we never confuse demo metrics
// for real ones in analytics).

import type { AlertReason, CohortRow } from './types';

interface PersonaSeed {
  full_name: string;
  block_type: 'ACC' | 'TRANS' | 'REAL';
  block_week: number;
  compliance_pct: number;
  hrv_delta_ms: number;
  hrv_trend: 'up' | 'down' | 'flat';
  acr: number;
  tsb: number;
  ctl: number;
  atl: number;
  next_session_label: string;
  next_session_offset_days: number | null;
  sync_minutes_ago: number;
  race_readiness: number;
  polarization: { low: number; mid: number; high: number };
  z45_pct_7d: number;
  vo2max: number;
  vo2max_trend: 'up' | 'down' | 'flat';
  sleep_avg_7d_h: number;
  rhr: number;
  days_to_a_event: number;
  volume_7d_h: number;
  sessions_today: { am: 'done' | 'pending' | null; pm: 'done' | 'pending' | null };
  last_checkin_minutes_ago: number | null;
  in_gym_today: boolean;
  alerts: AlertReason[];
  flags: {
    transition_ready: boolean;
    test_today: boolean;
    twice_daily_today: boolean;
    a_event_within_30d: boolean;
  };
}

// 13 archetypes. First three carry the alerts shown in the spec ASCII (Marc V,
// Sara P, Jordi L). Rest fill the cohort with realistic distributions.
const PERSONAS: ReadonlyArray<PersonaSeed> = [
  {
    full_name: 'Marc Vidal',
    block_type: 'REAL',
    block_week: 2,
    compliance_pct: 71,
    hrv_delta_ms: -12,
    hrv_trend: 'down',
    acr: 1.42,
    tsb: -14,
    ctl: 78,
    atl: 92,
    next_session_label: 'Hoy · PM',
    next_session_offset_days: 0,
    sync_minutes_ago: 120,
    race_readiness: 64,
    polarization: { low: 68, mid: 12, high: 20 },
    z45_pct_7d: 22,
    vo2max: 58.2,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 6.3,
    rhr: 52,
    days_to_a_event: 42,
    volume_7d_h: 11.4,
    sessions_today: { am: 'done', pm: 'pending' },
    last_checkin_minutes_ago: 240,
    in_gym_today: true,
    alerts: [
      {
        kind: 'hrv_crash',
        severity: 'critical',
        label: 'HRV crash',
        detail: '▼ 32% sem',
      },
    ],
    flags: { transition_ready: false, test_today: true, twice_daily_today: true, a_event_within_30d: false },
  },
  {
    full_name: 'Sara Puig',
    block_type: 'TRANS',
    block_week: 3,
    compliance_pct: 88,
    hrv_delta_ms: 0,
    hrv_trend: 'flat',
    acr: 1.0,
    tsb: 4,
    ctl: 62,
    atl: 58,
    next_session_label: 'Mañana',
    next_session_offset_days: 1,
    sync_minutes_ago: 60 * 24 * 4,
    race_readiness: 72,
    polarization: { low: 80, mid: 4, high: 16 },
    z45_pct_7d: 18,
    vo2max: 54.0,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.1,
    rhr: 49,
    days_to_a_event: 56,
    volume_7d_h: 9.2,
    sessions_today: { am: null, pm: null },
    last_checkin_minutes_ago: null,
    in_gym_today: false,
    alerts: [
      {
        kind: 'no_sync',
        severity: 'critical',
        label: '4d sin sync',
        detail: 'Garmin off',
      },
    ],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Jordi Llopis',
    block_type: 'ACC',
    block_week: 6,
    compliance_pct: 84,
    hrv_delta_ms: 3,
    hrv_trend: 'up',
    acr: 0.92,
    tsb: 8,
    ctl: 54,
    atl: 46,
    next_session_label: 'Hoy · AM',
    next_session_offset_days: 0,
    sync_minutes_ago: 35,
    race_readiness: 68,
    polarization: { low: 82, mid: 2, high: 16 },
    z45_pct_7d: 15,
    vo2max: 51.5,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.4,
    rhr: 48,
    days_to_a_event: 84,
    volume_7d_h: 8.6,
    sessions_today: { am: 'pending', pm: null },
    last_checkin_minutes_ago: 30,
    in_gym_today: true,
    alerts: [
      {
        kind: 'transition_ready',
        severity: 'warning',
        label: 'Block A→T',
        detail: '2 perdidas',
      },
      {
        kind: 'missed_sessions',
        severity: 'warning',
        label: '2 sesiones perdidas',
        detail: 'última 6 mayo',
      },
    ],
    flags: { transition_ready: true, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Andreu Roig',
    block_type: 'ACC',
    block_week: 1,
    compliance_pct: 100,
    hrv_delta_ms: 2,
    hrv_trend: 'up',
    acr: 0.9,
    tsb: 12,
    ctl: 48,
    atl: 36,
    next_session_label: 'Hoy · PM',
    next_session_offset_days: 0,
    sync_minutes_ago: 5,
    race_readiness: 82,
    polarization: { low: 84, mid: 0, high: 16 },
    z45_pct_7d: 14,
    vo2max: 56.8,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 7.8,
    rhr: 46,
    days_to_a_event: 96,
    volume_7d_h: 10.2,
    sessions_today: { am: 'done', pm: 'pending' },
    last_checkin_minutes_ago: 75,
    in_gym_today: true,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: true, a_event_within_30d: false },
  },
  {
    full_name: 'Núria Bofill',
    block_type: 'REAL',
    block_week: 1,
    compliance_pct: 95,
    hrv_delta_ms: 5,
    hrv_trend: 'up',
    acr: 1.1,
    tsb: -2,
    ctl: 71,
    atl: 73,
    next_session_label: 'Hoy · AM',
    next_session_offset_days: 0,
    sync_minutes_ago: 14,
    race_readiness: 88,
    polarization: { low: 78, mid: 4, high: 18 },
    z45_pct_7d: 20,
    vo2max: 62.4,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.6,
    rhr: 47,
    days_to_a_event: 28,
    volume_7d_h: 12.8,
    sessions_today: { am: 'done', pm: null },
    last_checkin_minutes_ago: 90,
    in_gym_today: true,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: true },
  },
  {
    full_name: 'Pol Aguirre',
    block_type: 'TRANS',
    block_week: 2,
    compliance_pct: 92,
    hrv_delta_ms: -2,
    hrv_trend: 'flat',
    acr: 1.05,
    tsb: 1,
    ctl: 68,
    atl: 67,
    next_session_label: 'Mañana',
    next_session_offset_days: 1,
    sync_minutes_ago: 22,
    race_readiness: 79,
    polarization: { low: 76, mid: 8, high: 16 },
    z45_pct_7d: 17,
    vo2max: 60.1,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.0,
    rhr: 51,
    days_to_a_event: 42,
    volume_7d_h: 11.0,
    sessions_today: { am: null, pm: null },
    last_checkin_minutes_ago: 60,
    in_gym_today: false,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Laia Ferré',
    block_type: 'ACC',
    block_week: 4,
    compliance_pct: 78,
    hrv_delta_ms: -4,
    hrv_trend: 'down',
    acr: 1.18,
    tsb: -6,
    ctl: 58,
    atl: 64,
    next_session_label: 'Hoy · PM',
    next_session_offset_days: 0,
    sync_minutes_ago: 2,
    race_readiness: 71,
    polarization: { low: 70, mid: 14, high: 16 },
    z45_pct_7d: 18,
    vo2max: 53.6,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 6.8,
    rhr: 53,
    days_to_a_event: 70,
    volume_7d_h: 9.4,
    sessions_today: { am: 'done', pm: 'pending' },
    last_checkin_minutes_ago: 15,
    in_gym_today: true,
    alerts: [
      {
        kind: 'rpe_high',
        severity: 'warning',
        label: 'RPE 9.5 ayer',
        detail: 'monitor próx. sesión',
      },
    ],
    flags: { transition_ready: false, test_today: false, twice_daily_today: true, a_event_within_30d: false },
  },
  {
    full_name: 'Ignasi Brú',
    block_type: 'REAL',
    block_week: 3,
    compliance_pct: 96,
    hrv_delta_ms: 1,
    hrv_trend: 'flat',
    acr: 1.08,
    tsb: -4,
    ctl: 82,
    atl: 86,
    next_session_label: '9 may',
    next_session_offset_days: 2,
    sync_minutes_ago: 45,
    race_readiness: 91,
    polarization: { low: 80, mid: 2, high: 18 },
    z45_pct_7d: 19,
    vo2max: 64.2,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.5,
    rhr: 44,
    days_to_a_event: 14,
    volume_7d_h: 13.2,
    sessions_today: { am: null, pm: null },
    last_checkin_minutes_ago: 120,
    in_gym_today: false,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: true },
  },
  {
    full_name: 'Marta Cisneros',
    block_type: 'TRANS',
    block_week: 4,
    compliance_pct: 100,
    hrv_delta_ms: 4,
    hrv_trend: 'up',
    acr: 1.0,
    tsb: 2,
    ctl: 60,
    atl: 58,
    next_session_label: 'Hoy · AM',
    next_session_offset_days: 0,
    sync_minutes_ago: 8,
    race_readiness: 84,
    polarization: { low: 82, mid: 0, high: 18 },
    z45_pct_7d: 18,
    vo2max: 55.4,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.7,
    rhr: 50,
    days_to_a_event: 49,
    volume_7d_h: 9.8,
    sessions_today: { am: 'done', pm: null },
    last_checkin_minutes_ago: 25,
    in_gym_today: true,
    alerts: [
      {
        kind: 'transition_ready',
        severity: 'warning',
        label: 'Listo TRANS→REAL',
        detail: 'benchmarks +6%',
      },
    ],
    flags: { transition_ready: true, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Bernat Oliva',
    block_type: 'ACC',
    block_week: 2,
    compliance_pct: 67,
    hrv_delta_ms: -3,
    hrv_trend: 'down',
    acr: 0.74,
    tsb: 14,
    ctl: 42,
    atl: 28,
    next_session_label: '8 may',
    next_session_offset_days: 1,
    sync_minutes_ago: 60 * 36,
    race_readiness: 58,
    polarization: { low: 64, mid: 18, high: 18 },
    z45_pct_7d: 14,
    vo2max: 49.8,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 6.4,
    rhr: 56,
    days_to_a_event: 112,
    volume_7d_h: 6.4,
    sessions_today: { am: null, pm: null },
    last_checkin_minutes_ago: 60 * 50,
    in_gym_today: false,
    alerts: [
      {
        kind: 'checkin_skipped',
        severity: 'warning',
        label: 'Check-in 2d',
        detail: 'sync 36h',
      },
    ],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Helena Sastre',
    block_type: 'REAL',
    block_week: 2,
    compliance_pct: 90,
    hrv_delta_ms: 0,
    hrv_trend: 'flat',
    acr: 1.12,
    tsb: -8,
    ctl: 76,
    atl: 84,
    next_session_label: 'Hoy · PM',
    next_session_offset_days: 0,
    sync_minutes_ago: 18,
    race_readiness: 86,
    polarization: { low: 78, mid: 6, high: 16 },
    z45_pct_7d: 18,
    vo2max: 59.6,
    vo2max_trend: 'up',
    sleep_avg_7d_h: 7.2,
    rhr: 48,
    days_to_a_event: 21,
    volume_7d_h: 12.2,
    sessions_today: { am: 'done', pm: 'pending' },
    last_checkin_minutes_ago: 110,
    in_gym_today: true,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: true, a_event_within_30d: true },
  },
  {
    full_name: 'Aleix Tort',
    block_type: 'TRANS',
    block_week: 1,
    compliance_pct: 82,
    hrv_delta_ms: -1,
    hrv_trend: 'flat',
    acr: 1.03,
    tsb: 0,
    ctl: 64,
    atl: 64,
    next_session_label: 'Mañana',
    next_session_offset_days: 1,
    sync_minutes_ago: 90,
    race_readiness: 74,
    polarization: { low: 72, mid: 12, high: 16 },
    z45_pct_7d: 16,
    vo2max: 57.0,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 6.9,
    rhr: 50,
    days_to_a_event: 63,
    volume_7d_h: 10.4,
    sessions_today: { am: null, pm: null },
    last_checkin_minutes_ago: 50,
    in_gym_today: false,
    alerts: [
      {
        kind: 'message_unanswered',
        severity: 'warning',
        label: 'Mensaje 14h sin responder',
        detail: 'video review',
      },
    ],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
  {
    full_name: 'Júlia Camps',
    block_type: 'ACC',
    block_week: 5,
    compliance_pct: 88,
    hrv_delta_ms: 2,
    hrv_trend: 'up',
    acr: 0.95,
    tsb: 6,
    ctl: 52,
    atl: 46,
    next_session_label: 'Hoy · AM',
    next_session_offset_days: 0,
    sync_minutes_ago: 12,
    race_readiness: 76,
    polarization: { low: 80, mid: 4, high: 16 },
    z45_pct_7d: 17,
    vo2max: 52.2,
    vo2max_trend: 'flat',
    sleep_avg_7d_h: 7.3,
    rhr: 49,
    days_to_a_event: 90,
    volume_7d_h: 9.0,
    sessions_today: { am: 'done', pm: null },
    last_checkin_minutes_ago: 40,
    in_gym_today: true,
    alerts: [],
    flags: { transition_ready: false, test_today: false, twice_daily_today: false, a_event_within_30d: false },
  },
];

export interface DemoCohortOptions {
  now?: Date;
  count?: number;
}

export function buildDemoCohort(opts: DemoCohortOptions = {}): CohortRow[] {
  const now = opts.now ?? new Date();
  const count = Math.min(opts.count ?? PERSONAS.length, PERSONAS.length);
  const rows: CohortRow[] = [];
  for (let i = 0; i < count; i++) {
    const seed = PERSONAS[i];
    rows.push(personaToRow(seed, i, now));
  }
  return rows;
}

function personaToRow(seed: PersonaSeed, index: number, now: Date): CohortRow {
  const lastSync = new Date(now.getTime() - seed.sync_minutes_ago * 60_000);
  const lastCheckin =
    seed.last_checkin_minutes_ago == null
      ? null
      : new Date(now.getTime() - seed.last_checkin_minutes_ago * 60_000).toISOString();

  const nextIso =
    seed.next_session_offset_days == null
      ? null
      : addDaysIso(now, seed.next_session_offset_days);

  return {
    athlete_id: `demo-${index + 1}`,
    full_name: seed.full_name,
    is_demo: true,
    block_type: seed.block_type,
    block_week: seed.block_week,
    compliance_pct: seed.compliance_pct,
    hrv_delta_ms: seed.hrv_delta_ms,
    hrv_trend: seed.hrv_trend,
    acr: seed.acr,
    tsb: seed.tsb,
    ctl: seed.ctl,
    atl: seed.atl,
    next_session: { label: seed.next_session_label, iso_date: nextIso },
    last_sync_at: lastSync.toISOString(),
    sync_minutes_ago: seed.sync_minutes_ago,
    race_readiness: seed.race_readiness,
    polarization_pct: seed.polarization,
    z45_pct_7d: seed.z45_pct_7d,
    vo2max: seed.vo2max,
    vo2max_trend: seed.vo2max_trend,
    sleep_avg_7d_h: seed.sleep_avg_7d_h,
    rhr: seed.rhr,
    days_to_a_event: seed.days_to_a_event,
    volume_7d_h: seed.volume_7d_h,
    sessions_today: seed.sessions_today,
    last_checkin_at: lastCheckin,
    in_gym_today: seed.in_gym_today,
    alerts: seed.alerts,
    primary_alert: seed.alerts[0] ?? null,
    flags: seed.flags,
  };
}

function addDaysIso(d: Date, days: number): string {
  const out = new Date(d.getTime() + days * 86_400_000);
  return out.toISOString().slice(0, 10);
}
