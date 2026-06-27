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
// Test→objetivos resolver: the periodization/benchmark engine that turns an
// athlete's reference tests into derived training targets (zones, paces, %RM)
// does NOT yet expose a typed loader. The Perfil tab is built against the REAL
// performance/exercise data (deep-dive) + the Fabrik protocol catalogue and marks
// the derived-targets table TODO(endpoint) so it wires to the resolver the moment
// it lands — never inventing fake athletes/values.

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
import { buildAthletePerformance } from '@/lib/dashboard/coach/deep-dive-performance';
import {
  loadMessages,
  inferSenderRoles,
  getOrCreateThread,
  type CoachChatMessage,
} from '@/lib/dashboard/chat/service';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { loadCoachLevels } from '@/lib/dashboard/v2/periodizacion';
import {
  SEQUENCE_DAYS_MIN,
  SEQUENCE_DAYS_MAX,
} from '@fahybrid/shared/schema/program-sequences';
import type { V2Status } from '@/components/v2/StatusDot';
import {
  type DetalleHeader,
  type DetalleStat,
  type DetalleChatMessage,
  type ClasificacionData,
  type V2AthleteDetalle,
} from './atleta-detalle-types';

// Re-export the client-safe surface so existing import sites keep working.
export {
  ATLETA_TABS,
  DEFAULT_ATLETA_TAB,
  normalizeAtletaTab,
  buildPerfilTab,
  selectPerfilTab,
} from './atleta-detalle-types';
export type {
  AtletaTab,
  DetalleHeader,
  DetalleStat,
  DetalleChatMessage,
  ClasificacionData,
  ClasificacionLevelOption,
  V2AthleteDetalle,
  ReferenceTest,
  DerivedObjective,
  PerfilTabData,
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

/** "alta hace N meses/semanas/días" approximated from the macro plan start.
 *  TODO(model): no persisted onboarded_at on the resumen payload; we approximate
 *  tenure from the first assignment start when present, else null. */
function tenureLabel(plan: AthletePlanPayload | null): string | null {
  const start = plan?.macro.phase_assignments[0]?.start_date ?? null;
  if (!start) return null;
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return null;
  const days = Math.floor((Date.now() - startMs) / 86_400_000);
  if (days < 0) return null;
  if (days < 14) return `alta hace ${days} d`;
  if (days < 60) return `alta hace ${Math.round(days / 7)} sem`;
  return `alta hace ${Math.round(days / 30)} meses`;
}

function fmtPct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n)}%`;
}

/** Builds the 4 header StatTiles from real signals (VO₂ est · FC reposo ·
 *  adherencia · VFC). Missing signals render an em-dash, never a fake value. */
function buildStats(resumen: AthleteResumen | null, body: BodyPayload | null): DetalleStat[] {
  const vo2 = body?.vo2max.current_value ?? null;
  const rhr = body?.rhr.last_bpm ?? null;
  const adher = resumen?.compliance_pct_7d ?? null;
  const hrv = body?.hrv.last_value_ms ?? null;

  const adherTone: DetalleStat['tone'] =
    adher == null ? 'fg' : adher >= 75 ? 'ok' : adher >= 60 ? 'warn' : 'danger';

  return [
    { label: 'VO₂ est', value: vo2 != null ? `${Math.round(vo2)}` : '—', tone: 'fg' },
    { label: 'FC reposo', value: rhr != null ? `${Math.round(rhr)}` : '—', tone: 'fg' },
    { label: 'Adherencia', value: fmtPct(adher), tone: adherTone },
    { label: 'VFC', value: hrv != null ? `${Math.round(hrv)}` : '—', tone: 'info' },
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

  const [resumen, plan, body, performance, subscription, chat, zone_profiles, classification] =
    await Promise.all([
      buildAthleteResumen({ coach_id, athlete_id, client }).catch(() => null),
      buildAthletePlan({ coach_id, athlete_id, view_mode: 'month', client }).catch(() => null),
      buildAthleteBody({ coach_id, athlete_id, client }).catch(() => null),
      buildAthletePerformance({ coach_id, athlete_id, client }).catch(() => null),
      getAthleteSubscriptionStatus({ coach_id, athlete_id, client }).catch(() => null),
      loadInitialChat({ coach_id, athlete_id, client }).catch(() => null),
      loadAthleteZoneProfiles({ coach_id, athlete_id, client }).catch(() => []),
      loadClassification({ coach_id, athlete_id, client }).catch(() => null),
    ]);

  const { status, label } = deriveStatus(shell, resumen);
  const header: DetalleHeader = {
    athlete_id: shell.athlete_id,
    full_name: shell.full_name,
    level: athleteLevel(shell),
    status,
    status_label: label,
    tenure_label: tenureLabel(plan),
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
    performance,
    subscription,
    chat,
    zone_profiles,
  };
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
  const raw = await loadMessages({ thread_id, limit: 50, client: params.client });
  const withRoles: CoachChatMessage[] = await inferSenderRoles({
    thread_id,
    messages: raw,
    client: params.client,
  });
  return {
    thread_id,
    messages: withRoles.map((m) => ({
      id: m.id,
      sender_role: m.sender_role,
      body: m.body,
      created_at: m.created_at,
    })),
  };
}
