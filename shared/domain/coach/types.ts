import { z } from 'zod';

export const ALERT_KINDS = [
  'hrv_crash',
  'no_sync',
  'missed_sessions',
  'video_review_pending',
  'message_unanswered',
  'rpe_high',
  'transition_ready',
  'checkin_skipped',
  'block_phase',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export interface AlertReason {
  kind: AlertKind;
  severity: 'critical' | 'warning';
  label: string;
  detail: string;
}

export interface CohortRow {
  athlete_id: string;
  full_name: string;
  is_demo: boolean;
  /** Current microciclo NAME (coach data), null when none active. */
  block_type: string | null;
  block_week: number | null;
  compliance_pct: number | null;
  hrv_delta_ms: number | null;
  hrv_trend: 'up' | 'down' | 'flat' | null;
  acr: number | null;
  tsb: number | null;
  ctl: number | null;
  atl: number | null;
  next_session: {
    label: string;
    iso_date: string | null;
  } | null;
  last_sync_at: string | null;
  sync_minutes_ago: number | null;
  race_readiness: number | null;
  polarization_pct: { low: number; mid: number; high: number } | null;
  z45_pct_7d: number | null;
  vo2max: number | null;
  vo2max_trend: 'up' | 'down' | 'flat' | null;
  sleep_avg_7d_h: number | null;
  rhr: number | null;
  days_to_a_event: number | null;
  volume_7d_h: number | null;
  sessions_today: { am: 'done' | 'pending' | null; pm: 'done' | 'pending' | null };
  last_checkin_at: string | null;
  in_gym_today: boolean;
  alerts: AlertReason[];
  primary_alert: AlertReason | null;
  flags: {
    transition_ready: boolean;
    test_today: boolean;
    twice_daily_today: boolean;
    a_event_within_30d: boolean;
  };
  programming_status: 'ok' | 'no_month' | 'pending_proposal' | 'empty_week' | 'month_2_pending';
  programming_label: string | null;
  readiness_score: number | null;
}

export interface BriefingPayload {
  greeting: string;
  date_label: string;
  iso_date: string;
  active_athlete_count: number;
  time_of_day: TimeOfDay;
  is_quiet_day: boolean;
  is_first_time: boolean;
  lines: BriefingLine[];
}

export interface BriefingLine {
  id:
    | 'sessions'
    | 'alerts'
    | 'video_reviews'
    | 'messages'
    | 'transitions'
    | 'tests'
    | 'polarization'
    | 'event'
    | 'intake_pending';
  icon: string;
  primary: string;
  secondary: string | null;
  emphasis: 'normal' | 'warning' | 'critical';
  filter_param: string | null;
  href?: string | null;
}

export const COLUMN_KEYS = [
  'alert',
  'name',
  'block',
  'compliance',
  'hrv',
  'acr',
  'tsb',
  'next',
  'sync',
  'race_readiness',
  'polarization',
  'z45_7d',
  'ctl',
  'atl',
  'vo2max',
  'sleep_7d',
  'rhr',
  'days_to_event',
  'volume_7d',
  'sessions_today',
  'last_checkin',
  'readiness',
  'programming',
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const DEFAULT_COLUMNS: ReadonlyArray<ColumnKey> = [
  'alert',
  'name',
  'block',
  'compliance',
  'readiness',
  'programming',
  'hrv',
  'acr',
  'tsb',
  'next',
  'sync',
];

export const ColumnPrefsSchema = z.object({
  visible: z.array(z.enum(COLUMN_KEYS)).min(1),
});
export type ColumnPrefs = z.infer<typeof ColumnPrefsSchema>;

export const FilterStateSchema = z.object({
  in_gym: z.boolean().optional(),
  /** Filter by current microciclo NAME (coach data, agnostic). */
  block: z.string().optional(),
  alert: z.boolean().optional(),
  twice_daily: z.boolean().optional(),
  a_event_30d: z.boolean().optional(),
  programming_issue: z.boolean().optional(),
});
export type FilterState = z.infer<typeof FilterStateSchema>;
