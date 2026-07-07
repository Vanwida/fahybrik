import 'server-only';

// v2 · ATLETA · DETALLE — server data orchestrator for the athlete detail screen
// (5 sub-tabs: perfil · plan · histórico · biometría · mensajes). One safe load
// fans out all existing per-athlete loaders in parallel; any single failure
// degrades that section (null) without 500-ing the page, mirroring the Hoy
// screen's resilience contract. The client component renders from this payload.
//
// Client-safe types + the tab enum + the pure perfil-tab mapper live in
// ./atleta-detalle-types (no DB / no `server-only`) so the client components can
// import them; we re-export them here for callers that already import this module.
//
// Reference tests are REAL recorded results: pace/endurance from athlete_benchmarks
// and 1RM from athlete_strength_maxes (versioned). They are NEVER derived from
// in-WOD segment durations (a segment time inside a workout is not a test). The
// derived-objectives table reads the stored zone profiles (resolver output) and
// marks itself TODO(endpoint) until the resolver exposes a typed loader — never
// inventing fake athletes/values.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

import {
  fetchAthleteProfileShell,
  type AthleteProfileShell,
} from '@/lib/dashboard/coach/athlete-profile-shell';
import { buildAthleteResumen, type AthleteResumen } from '@/lib/dashboard/coach/resumen';
import { buildAthletePlan, type AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import { getAthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import { buildAthleteBody, type BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import { listSessionReportsForAthlete } from '@/lib/coach/session-reports';
import {
  loadMessages,
  getOrCreateThread,
} from '@/lib/dashboard/chat/service';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { loadStrengthMaxes, loadStrengthMaxHistory } from '@/lib/strength/strength-max';
import { strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import { benchmarkLabel } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { tenureSuffix } from '@/lib/dashboard/relative-time';
import { loadCoachLevels } from '@/lib/dashboard/v2/periodizacion';
import {
  SEQUENCE_DAYS_MIN,
  SEQUENCE_DAYS_MAX,
} from '@fahybrid/shared/schema/program-sequences';
import type { V2Status } from '@/components/v2/StatusDot';
import {
  EM_DASH,
  type DetalleHeader,
  type DetalleStat,
  type DetalleChatMessage,
  type ClasificacionData,
  type V2AthleteDetalle,
  type StrengthMaxView,
  type BenchmarkSeries,
} from './atleta-detalle-types';

// Re-export the client-safe surface so existing import sites keep working.
export {
  ATLETA_TABS,
  DEFAULT_ATLETA_TAB,
  normalizeAtletaTab,
  buildPerfilTab,
  selectPerfilTab,
  buildTestProgression,
} from './atleta-detalle-types';
export type {
  AtletaTab,
  DetalleHeader,
  DetalleStat,
  DetalleChatMessage,
  ClasificacionData,
  ClasificacionLevelOption,
  V2AthleteDetalle,
  StrengthMaxView,
  BenchmarkSeries,
  BenchmarkResult,
  TestProgressionRow,
  ReferenceTest,
  DerivedZone,
  DerivedObjectiveGroup,
  PerfilTabData,
  JointSession,
} from './atleta-detalle-types';

const MODALITY_LABEL: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro · Elite',
};

/**
 * Header microciclo label. The name comes from `buildAthletePlan`
 * (→ `plan.current_block_label`, the coach's microciclo name). We append the
 * relative week from the shell. Falls back to the shell's raw microciclo name
 * only when there's no resolved label and no plan.
 */
function phaseLabel(
  shell: AthleteProfileShell | null,
  plan: AthletePlanPayload | null,
): string | null {
  const name = plan?.current_block_label ?? shell?.block_type ?? null;
  if (!name) return null;
  return shell?.block_week != null ? `${name} · sem ${shell.block_week}` : name;
}

/** Account/training status — readiness alarm wins over the plain active state. */
function deriveStatus(
  shell: AthleteProfileShell | null,
  resumen: AthleteResumen | null,
): { status: V2Status; label: string } {
  if (shell?.intake_pending) return { status: 'alta', label: 'Alta · revisar intake' };
  const r = resumen?.readiness_score ?? shell?.readiness_score ?? null;
  if (r != null && r < 45) return { status: 'atencion', label: 'Atención · fisiología' };
  if (resumen?.programming.status === 'no_month')
    return { status: 'atencion', label: 'Sin plan asignado' };
  return { status: 'activa', label: 'Activa' };
}

/** "alta hace N meses/semanas/días" from the REAL onboarding timestamp
 *  (athletes.onboarded_at, surfaced by the shell). Shares the elapsed-time helper
 *  with the Altas screen, so the SAME athlete shows the SAME number in both. */
function tenureLabel(onboarded_at: string | null): string | null {
  const suffix = tenureSuffix(onboarded_at);
  return suffix ? `alta hace ${suffix}` : null;
}

function fmtPct(n: number | null): string {
  return n == null ? EM_DASH : `${Math.round(n)}%`;
}

/** Builds the 4 header StatTiles from real signals (VO₂ est · FC reposo ·
 *  adherencia · VFC). Missing signals render an em-dash, never a fake value. */
function buildStats(resumen: AthleteResumen | null, body: BodyPayload | null): DetalleStat[] {
  const vo2 = body?.vo2max.current_value ?? null;
  const rhr = body?.rhr.last_bpm ?? null;
  const adher = resumen?.adherence_pct_30d ?? null;
  const hrv = body?.hrv.last_value_ms ?? null;

  const adherTone: DetalleStat['tone'] =
    adher == null ? 'fg' : adher >= 75 ? 'ok' : adher >= 60 ? 'warn' : 'danger';

  return [
    { label: 'VO₂ est', value: vo2 != null ? `${Math.round(vo2)}` : EM_DASH, tone: 'fg' },
    { label: 'FC reposo', value: rhr != null ? `${Math.round(rhr)}` : EM_DASH, tone: 'fg' },
    { label: 'Adherencia', value: fmtPct(adher), tone: adherTone },
    { label: 'VFC', value: hrv != null ? `${Math.round(hrv)}` : EM_DASH, tone: 'info' },
  ];
}

/**
 * Loads the athlete's assignment classification: their current level_id +
 * training_days_per_week, the algorithmic level suggestion (so the coach can
 * confirm it inline), and the coach's full level set for the picker. Ownership is
 * already gated by the shell load upstream; this reads the same athlete row.
 */
export async function loadClassification(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<ClasificacionData> {
  const { coach_id, athlete_id, client } = params;

  const [rows, levels] = await Promise.all([
    client<
      Array<{
        level_id: string | null;
        level_name: string | null;
        suggested_level_id: string | null;
        suggested_level_name: string | null;
        training_days_per_week: number | null;
      }>
    >`
      select
        a.level_id::text             as level_id,
        al.name                      as level_name,
        a.suggested_level_id::text   as suggested_level_id,
        sal.name                     as suggested_level_name,
        a.training_days_per_week
      from athletes a
      left join athlete_levels al  on al.id = a.level_id
      left join athlete_levels sal on sal.id = a.suggested_level_id
      where a.id = ${athlete_id} and a.coach_id = ${coach_id}
      limit 1
    `,
    loadCoachLevels(coach_id, client),
  ]);

  const row = rows[0];
  return {
    level_id: row?.level_id ?? null,
    level_name: row?.level_name ?? null,
    suggested_level_id: row?.suggested_level_id ?? null,
    suggested_level_name: row?.suggested_level_name ?? null,
    // The "por qué" is enriched only by the intake-review loader (it has the race
    // context); the generic classification load leaves it null.
    suggested_level_reason: null,
    training_days_per_week: row?.training_days_per_week ?? null,
    levels: levels.map((l) => ({ id: l.id, name: l.name, label: l.label })),
    days_band: { min: SEQUENCE_DAYS_MIN, max: SEQUENCE_DAYS_MAX },
  };
}

// ── Main orchestrator ───────────────────────────────────────────────────────────
export async function loadAthleteDetalle(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<V2AthleteDetalle | null> {
  const client = params.client ?? defaultSql;
  const { coach_id, athlete_id } = params;

  // The shell is the gate: if it's null the athlete doesn't belong to the coach
  // (or doesn't exist) → 404 upstream.
  const shell = await fetchAthleteProfileShell({ coach_id, athlete_id, client }).catch(() => null);
  if (!shell) return null;

  const [
    resumen,
    plan,
    body,
    subscription,
    chat,
    zone_profiles,
    classification,
    strengthCurrent,
    strengthHistory,
    benchmarks,
    sessions,
  ] = await Promise.all([
    buildAthleteResumen({ coach_id, athlete_id, client }).catch(() => null),
    buildAthletePlan({ coach_id, athlete_id, view_mode: 'month', client }).catch(() => null),
    buildAthleteBody({ coach_id, athlete_id, client }).catch(() => null),
    getAthleteSubscriptionStatus({ coach_id, athlete_id, client }).catch(() => null),
    loadInitialChat({ coach_id, athlete_id, client }).catch(() => null),
    loadAthleteZoneProfiles({ coach_id, athlete_id, client }).catch(() => []),
    loadClassification({ coach_id, athlete_id, client }).catch(() => null),
    loadStrengthMaxes({ coach_id, athlete_id, client }).catch(() => []),
    loadStrengthMaxHistory({ athlete_id, client }).catch(() => []),
    loadBenchmarkHistory({ coach_id, athlete_id, client }).catch(() => []),
    listSessionReportsForAthlete(BigInt(athlete_id)).catch(() => []),
  ]);

  // Group each current 1RM with its full version history (oldest→newest) → the
  // client-safe Perfil view. The label is resolved here (server) so the view stays
  // pure. No max → empty array (the Fuerza section renders its honest empty state).
  const strength_maxes: StrengthMaxView[] = strengthCurrent.map((m) => ({
    exercise_slug: m.exercise_slug,
    exercise_label: strengthLiftLabel(m.exercise_slug),
    one_rm_kg: m.one_rm_kg,
    version: m.version,
    recorded_at: m.recorded_at,
    source: m.source,
    history: strengthHistory
      .filter((h) => h.exercise_slug === m.exercise_slug)
      .map((h) => ({ one_rm_kg: h.one_rm_kg, version: h.version, recorded_at: h.recorded_at })),
  }));

  const { status, label } = deriveStatus(shell, resumen);
  const header: DetalleHeader = {
    athlete_id: shell.athlete_id,
    full_name: shell.full_name,
    level: athleteLevel(shell),
    status,
    status_label: label,
    tenure_label: tenureLabel(shell.onboarded_at),
    phase_label: phaseLabel(shell, plan),
    modality_label: shell.modality ? (MODALITY_LABEL[shell.modality] ?? shell.modality) : null,
  };

  // Degrade safely: a failed classification load renders the picker in its empty
  // state (no level / no days) rather than 500-ing the page.
  const safeClassification: ClasificacionData = classification ?? {
    level_id: null,
    level_name: null,
    suggested_level_id: null,
    suggested_level_name: null,
    suggested_level_reason: null,
    training_days_per_week: null,
    levels: [],
    days_band: { min: SEQUENCE_DAYS_MIN, max: SEQUENCE_DAYS_MAX },
  };

  return {
    header,
    stats: buildStats(resumen, body),
    classification: safeClassification,
    resumen,
    plan,
    body,
    subscription,
    chat,
    zone_profiles,
    strength_maxes,
    benchmarks,
    joint_sessions: shell.joint_sessions,
    sessions,
  };
}

/**
 * Reference-test history per slug from `athlete_benchmarks` (coach-scoped via the
 * athletes join). Rows are real recorded RESULTS — never in-WOD segment durations.
 * Grouped oldest→newest per slug for the progression deltas; the label resolves
 * server-side so the client view stays pure. Empty = no test recorded.
 */
async function loadBenchmarkHistory(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<BenchmarkSeries[]> {
  const { coach_id, athlete_id, client } = params;
  const rows = await client<
    Array<{ exercise_slug: string; value: number; unit: string; recorded_at: Date }>
  >`
    select ab.exercise_slug, ab.value::float8 as value, ab.unit, ab.recorded_at
    from athlete_benchmarks ab
    join athletes a on a.id = ab.athlete_id and a.coach_id = ${coach_id}
    where ab.athlete_id = ${athlete_id}
    order by ab.exercise_slug asc, ab.recorded_at asc
  `;

  const grouped = new Map<string, BenchmarkSeries>();
  for (const r of rows) {
    let series = grouped.get(r.exercise_slug);
    if (!series) {
      series = {
        exercise_slug: r.exercise_slug,
        label: benchmarkLabel(r.exercise_slug),
        unit: r.unit,
        results: [],
      };
      grouped.set(r.exercise_slug, series);
    }
    series.results.push({ value: r.value, recorded_at: r.recorded_at.toISOString() });
  }
  return [...grouped.values()];
}

async function loadInitialChat(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client: Sql;
}): Promise<{ thread_id: string; messages: DetalleChatMessage[] }> {
  const { thread_id } = await getOrCreateThread({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    client: params.client,
  });
  // loadMessages resolves sender_role from the stored column (migration 0082),
  // so attribution is correct even when the coach is their own athlete.
  const raw = await loadMessages({ thread_id, limit: 50, client: params.client });
  return {
    thread_id,
    messages: raw.map((m) => ({
      id: m.id,
      sender_role: m.sender_role,
      body: m.body,
      created_at: m.created_at,
    })),
  };
}
