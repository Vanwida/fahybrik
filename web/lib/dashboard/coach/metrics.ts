// Coach-dashboard funnel metrics (#20). Reads ONLY existing tables — leads,
// appointments, session_reports, athlete_invitations — and DERIVES the ingest
// funnel from them; nothing is invented. Single-coach launch → no coach scoping
// (every lead belongs to the one coach), mirroring lib/dashboard/coach/leads.ts.
//
// The funnel is a COHORT model: the cohort is the set of leads whose created_at
// falls in the selected range; each stage is a boolean predicate on that lead
// (does it have an appointment? a report? an alta?). All six stage counts + the
// side-exits are computed in ONE aggregate query with `count(*) filter (…)`, so
// a lead is followed through its stages without N+1.
//
// TODO(#20 · visitas): TOP-OF-FUNNEL web visits are NOT tracked. There is no
// page_views table and no analytics install (deferred — intersects the RGPD work
// in #19). Until visits are instrumented the funnel starts at "Onboarding
// iniciado"; the UI shows an honest "pendiente de instrumentar" row for visitas
// rather than a fabricated number. Do NOT add visit tracking from here.

import { sql } from '@/lib/db';
import type { SessionOutcome } from '@fahybrid/shared/domain/sessions/outcome';

// ── Range ────────────────────────────────────────────────────────────────────────
export type MetricsRange = '7d' | '30d' | 'todo';

export const DEFAULT_METRICS_RANGE: MetricsRange = '30d';

/** Window length in days per bounded range (drives the `since` and the prior window). */
const RANGE_DAYS: Record<Exclude<MetricsRange, 'todo'>, number> = { '7d': 7, '30d': 30 };

const MS_PER_DAY = 86_400_000;

/** Parse the `?rango=` search param into a valid range, defaulting to 30 días. */
export function parseMetricsRange(value: string | string[] | undefined): MetricsRange {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '7d' || v === 'todo' || v === '30d' ? v : DEFAULT_METRICS_RANGE;
}

/** `since` timestamp for a range (null for 'todo' = whole history). */
export function metricsSince(range: MetricsRange, now: Date = new Date()): Date | null {
  if (range === 'todo') return null;
  return new Date(now.getTime() - RANGE_DAYS[range] * MS_PER_DAY);
}

// ── Funnel snapshot ────────────────────────────────────────────────────────────────
export const FUNNEL_STAGE_KEYS = [
  'iniciado',
  'completado',
  'cita',
  'llamada',
  'alta_enviada',
  'convertido',
] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number];

export type FunnelStageCounts = Record<FunnelStageKey, number>;

export interface FunnelSideExits {
  /** Leads in the cohort marked status='descartado'. */
  descartados: number;
  /** Leads with a no_show appointment OR a report outcome 'no_asistio'. */
  no_show: number;
  /** Leads with a report outcome 'pensandoselo'. */
  pensandoselo: number;
}

export interface FunnelConversions {
  /** completado / iniciado */
  completado: number | null;
  /** cita / completado */
  cita: number | null;
  /** llamada / cita */
  llamada: number | null;
  /** alta_enviada / llamada */
  alta_enviada: number | null;
  /** convertido / alta_enviada */
  convertido: number | null;
  /** convertido / completado — the headline "onboarding → alta" rate. */
  onboarding_to_alta: number | null;
}

export interface FunnelSnapshot {
  range: MetricsRange;
  /** ISO of the cohort lower bound (null for 'todo'). */
  cohort_since: string | null;
  /** ISO of the snapshot upper bound (always "now"). */
  cohort_until: string;
  stages: FunnelStageCounts;
  side_exits: FunnelSideExits;
  conversions: FunnelConversions;
  /**
   * % change of the headline counts vs the immediately-preceding equal window
   * (e.g. the previous 30 days). null for 'todo' (no prior period). Each value is
   * a ratio (0.12 = +12%) or null when the prior count was 0 (no base).
   */
  deltas: Record<'completado' | 'cita' | 'llamada' | 'convertido', number | null> | null;
}

interface CohortRow {
  iniciado: number;
  completado: number;
  cita: number;
  llamada: number;
  alta_enviada: number;
  convertido: number;
  descartados: number;
  no_show: number;
  pensandoselo: number;
}

/** Cohort window predicate on leads.created_at (`l` alias), null bound = open. */
function cohortWindow(since: Date | null, until: Date | null) {
  return sql`(${since}::timestamptz is null or l.created_at >= ${since}::timestamptz)
    and (${until}::timestamptz is null or l.created_at < ${until}::timestamptz)`;
}

/** All stage counts + side-exits for one cohort window. Shared by the current and
 *  prior windows so the delta compares like with like. */
async function cohortCounts(since: Date | null, until: Date | null): Promise<CohortRow> {
  const rows = await sql<CohortRow[]>`
    select
      count(*)::int as iniciado,
      count(*) filter (where l.submitted_at is not null)::int as completado,
      count(*) filter (
        where exists (select 1 from appointments a where a.lead_id = l.id)
      )::int as cita,
      count(*) filter (
        where exists (
                select 1 from session_reports sr
                where sr.lead_id = l.id and sr.deleted_at is null
                  and (sr.outcome is null or sr.outcome <> 'no_asistio')
              )
           or exists (
                select 1 from appointments a
                where a.lead_id = l.id and a.status = 'completada'
              )
      )::int as llamada,
      count(*) filter (where l.alta_sent_at is not null)::int as alta_enviada,
      count(*) filter (
        where l.status = 'convertido' and l.converted_athlete_id is not null
      )::int as convertido,
      count(*) filter (where l.status = 'descartado')::int as descartados,
      count(*) filter (
        where exists (
                select 1 from appointments a
                where a.lead_id = l.id and a.status = 'no_show'
              )
           or exists (
                select 1 from session_reports sr
                where sr.lead_id = l.id and sr.deleted_at is null and sr.outcome = 'no_asistio'
              )
      )::int as no_show,
      count(*) filter (
        where exists (
          select 1 from session_reports sr
          where sr.lead_id = l.id and sr.deleted_at is null and sr.outcome = 'pensandoselo'
        )
      )::int as pensandoselo
    from leads l
    where ${cohortWindow(since, until)}
  `;
  return (
    rows[0] ?? {
      iniciado: 0,
      completado: 0,
      cita: 0,
      llamada: 0,
      alta_enviada: 0,
      convertido: 0,
      descartados: 0,
      no_show: 0,
      pensandoselo: 0,
    }
  );
}

/** ratio n/d, or null when there is no base (d = 0) — never divides by zero. */
function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export async function loadFunnelSnapshot(
  range: MetricsRange,
  now: Date = new Date(),
): Promise<FunnelSnapshot> {
  const since = metricsSince(range, now);

  // Prior window = the equal-length window immediately before `since` (bounded
  // ranges only). It is a fair cohort-to-cohort comparison, snapshotted "as of now".
  const priorReq =
    range === 'todo' || since === null
      ? Promise.resolve(null)
      : cohortCounts(new Date(since.getTime() - RANGE_DAYS[range] * MS_PER_DAY), since);

  const [cur, prior] = await Promise.all([cohortCounts(since, null), priorReq]);

  const stages: FunnelStageCounts = {
    iniciado: cur.iniciado,
    completado: cur.completado,
    cita: cur.cita,
    llamada: cur.llamada,
    alta_enviada: cur.alta_enviada,
    convertido: cur.convertido,
  };

  const conversions: FunnelConversions = {
    completado: ratio(cur.completado, cur.iniciado),
    cita: ratio(cur.cita, cur.completado),
    llamada: ratio(cur.llamada, cur.cita),
    alta_enviada: ratio(cur.alta_enviada, cur.llamada),
    convertido: ratio(cur.convertido, cur.alta_enviada),
    onboarding_to_alta: ratio(cur.convertido, cur.completado),
  };

  const deltas = prior
    ? {
        completado: ratio(cur.completado - prior.completado, prior.completado),
        cita: ratio(cur.cita - prior.cita, prior.cita),
        llamada: ratio(cur.llamada - prior.llamada, prior.llamada),
        convertido: ratio(cur.convertido - prior.convertido, prior.convertido),
      }
    : null;

  return {
    range,
    cohort_since: since ? since.toISOString() : null,
    cohort_until: now.toISOString(),
    stages,
    side_exits: {
      descartados: cur.descartados,
      no_show: cur.no_show,
      pensandoselo: cur.pensandoselo,
    },
    conversions,
    deltas,
  };
}

export function emptyFunnelSnapshot(range: MetricsRange, now: Date = new Date()): FunnelSnapshot {
  const since = metricsSince(range, now);
  const zero = 0;
  return {
    range,
    cohort_since: since ? since.toISOString() : null,
    cohort_until: now.toISOString(),
    stages: {
      iniciado: zero,
      completado: zero,
      cita: zero,
      llamada: zero,
      alta_enviada: zero,
      convertido: zero,
    },
    side_exits: { descartados: zero, no_show: zero, pensandoselo: zero },
    conversions: {
      completado: null,
      cita: null,
      llamada: null,
      alta_enviada: null,
      convertido: null,
      onboarding_to_alta: null,
    },
    deltas: null,
  };
}

// ── Call outcomes + average quoted price ───────────────────────────────────────────
export interface CallOutcomesData {
  /** Count per outcome (all five present; 0 when none), lead sales calls in range. */
  counts: Record<SessionOutcome, number>;
  /** Total priced-call count and the average quoted price in € (null = no data). */
  avg_price_eur: number | null;
  priced_call_count: number;
}

export const EMPTY_CALL_OUTCOMES: CallOutcomesData = {
  counts: {
    quiere_empezar: 0,
    pensandoselo: 0,
    no_interesado: 0,
    seguimiento: 0,
    no_asistio: 0,
  },
  avg_price_eur: null,
  priced_call_count: 0,
};

export async function loadCallOutcomes(
  range: MetricsRange,
  now: Date = new Date(),
): Promise<CallOutcomesData> {
  const since = metricsSince(range, now);

  const [outcomeRows, priceRows] = await Promise.all([
    sql<{ outcome: SessionOutcome; n: number }[]>`
      select sr.outcome, count(*)::int as n
      from session_reports sr
      where sr.lead_id is not null
        and sr.deleted_at is null
        and sr.outcome is not null
        and (${since}::timestamptz is null or sr.occurred_at >= ${since}::timestamptz)
      group by sr.outcome
    `,
    sql<{ avg_price: number | null; n: number }[]>`
      select avg(sr.quoted_price_eur)::float8 as avg_price, count(sr.quoted_price_eur)::int as n
      from session_reports sr
      where sr.lead_id is not null
        and sr.deleted_at is null
        and sr.quoted_price_eur is not null
        and (${since}::timestamptz is null or sr.occurred_at >= ${since}::timestamptz)
    `,
  ]);

  const counts = { ...EMPTY_CALL_OUTCOMES.counts };
  for (const r of outcomeRows) {
    if (r.outcome in counts) counts[r.outcome] = r.n;
  }

  return {
    counts,
    avg_price_eur: priceRows[0]?.avg_price ?? null,
    priced_call_count: priceRows[0]?.n ?? 0,
  };
}

// ── Weekly series (last 8 ISO weeks, Europe/Madrid) ────────────────────────────────
export const WEEKLY_SERIES_WEEKS = 8;

export interface WeeklyPoint {
  /** ISO calendar date (YYYY-MM-DD) of the week's Monday, Madrid wall-clock. */
  week_start: string;
  /** Onboardings completados (leads.submitted_at) that week. */
  onboardings: number;
  /** Distinct leads that booked a cita (appointments.created_at) that week. */
  citas: number;
  /** Altas: invitations redeemed (athlete_invitations.redeemed_at) that week. */
  altas: number;
}

export type WeeklySeries = WeeklyPoint[];

export const EMPTY_WEEKLY_SERIES: WeeklySeries = [];

export async function loadWeeklySeries(): Promise<WeeklySeries> {
  // date_trunc('week', …) is ISO Monday-start. All timestamps are converted to the
  // box timezone first so week boundaries land on Madrid midnights, not UTC.
  const rows = await sql<WeeklyPoint[]>`
    with weeks as (
      select generate_series(
        date_trunc('week', (now() at time zone 'Europe/Madrid')) - (${WEEKLY_SERIES_WEEKS - 1} * interval '1 week'),
        date_trunc('week', (now() at time zone 'Europe/Madrid')),
        interval '1 week'
      ) as wk_start
    )
    select
      to_char(w.wk_start, 'YYYY-MM-DD') as week_start,
      (
        select count(*) from leads l
        where l.submitted_at is not null
          and (l.submitted_at at time zone 'Europe/Madrid') >= w.wk_start
          and (l.submitted_at at time zone 'Europe/Madrid') <  w.wk_start + interval '1 week'
      )::int as onboardings,
      (
        select count(distinct a.lead_id) from appointments a
        where (a.created_at at time zone 'Europe/Madrid') >= w.wk_start
          and (a.created_at at time zone 'Europe/Madrid') <  w.wk_start + interval '1 week'
      )::int as citas,
      (
        select count(*) from athlete_invitations ai
        where ai.lead_id is not null and ai.redeemed_at is not null
          and (ai.redeemed_at at time zone 'Europe/Madrid') >= w.wk_start
          and (ai.redeemed_at at time zone 'Europe/Madrid') <  w.wk_start + interval '1 week'
      )::int as altas
    from weeks w
    order by w.wk_start
  `;
  return rows;
}

// ── By-objetivo segmentation ───────────────────────────────────────────────────────
export interface ObjetivoRow {
  /** Stable objetivo code (leads.objetivo) — label resolved in the UI via shared/domain. */
  objetivo: string;
  onboardings: number;
  citas: number;
  altas: number;
  /** altas / onboardings — the objetivo's conversion (null when no onboardings). */
  conversion: number | null;
}

export async function loadByObjetivo(
  range: MetricsRange,
  now: Date = new Date(),
): Promise<ObjetivoRow[]> {
  const since = metricsSince(range, now);
  const rows = await sql<{ objetivo: string; onboardings: number; citas: number; altas: number }[]>`
    select
      l.objetivo as objetivo,
      count(*) filter (where l.submitted_at is not null)::int as onboardings,
      count(*) filter (
        where exists (select 1 from appointments a where a.lead_id = l.id)
      )::int as citas,
      count(*) filter (
        where l.status = 'convertido' and l.converted_athlete_id is not null
      )::int as altas
    from leads l
    where l.objetivo is not null
      and ${cohortWindow(since, null)}
    group by l.objetivo
  `;
  return rows.map((r) => ({
    objetivo: r.objetivo,
    onboardings: r.onboardings,
    citas: r.citas,
    altas: r.altas,
    conversion: ratio(r.altas, r.onboardings),
  }));
}

// ── Combined loader (convenience; the page may also fan out the four directly) ───────
export interface FunnelMetrics {
  snapshot: FunnelSnapshot;
  outcomes: CallOutcomesData;
  weekly: WeeklySeries;
  by_objetivo: ObjetivoRow[];
}

export async function loadFunnelMetrics(
  range: MetricsRange,
  now: Date = new Date(),
): Promise<FunnelMetrics> {
  const [snapshot, outcomes, weekly, by_objetivo] = await Promise.all([
    loadFunnelSnapshot(range, now),
    loadCallOutcomes(range, now),
    loadWeeklySeries(),
    loadByObjetivo(range, now),
  ]);
  return { snapshot, outcomes, weekly, by_objetivo };
}
