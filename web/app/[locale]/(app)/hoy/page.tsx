// HOY — triage command center (SPEC §4). Server component, force-dynamic (a
// per-coach authenticated page; now cheap because the queue is ONE indexed read
// off the precomputed attention store). It loads each source independently and
// wraps each in its own error path (SPEC §4 "error de carga parcial → sección
// con retry, nunca 500"): a dead loader degrades its section to an ErrorState,
// never the whole page. Data flows into the client TriageQueue + the HoyRail.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { loadTeamPulse, type TeamPulse } from '@/lib/dashboard/coach/team-pulse';
import { loadTriageData, loadRailData, type LoaderResult } from '@/lib/dashboard/coach/hoy-data';
import { MorningRitualHeader } from '@/components/dashboard/hoy/MorningRitualHeader';
import { TriageQueue } from '@/components/dashboard/hoy/TriageQueue';
import { HoyRail } from '@/components/dashboard/hoy/HoyRail';
import { ActivityTodayClient } from '@/components/dashboard/hoy/ActivityTodayClient';
import {
  loadActivityToday,
  ACTIVITY_GLANCE_LIMIT,
  type ActivityToday as ActivityTodayData,
} from '@/lib/dashboard/coach/activity-today';
import { listThreadsForCoach, type CoachThreadSummary } from '@/lib/dashboard/chat/service';
import { EmptyState, ErrorState, ReadinessRing } from '@/components/dashboard/ui';
import type { TriageData, TriageItem } from '@/components/dashboard/hoy/triage-types';

export const dynamic = 'force-dynamic';

/** Team readiness % = mean of known readiness buckets weighted (ok=83/caution=55/low=22 midpoints). */
function teamReadinessPct(pulse: TeamPulse): number | null {
  const { ok, caution, low } = pulse.readiness;
  const known = ok + caution + low;
  if (known === 0) return null;
  // Midpoint of each band → a stable, honest single number for the ring.
  return Math.round((ok * 83 + caution * 55 + low * 22) / known);
}

/** Bounded "N te necesitan hoy" = distinct athletes across the surfaced cards. */
function needCount(triage: TriageData): number {
  const ids = new Set<string>();
  for (const i of [...triage.critico, ...triage.vigilar]) ids.add(i.athlete_id);
  return ids.size;
}

const EMPTY_TRIAGE: TriageData = { critico: [], vigilar: [], auto_resolved_count: 0, overflow: 0 };

export default async function HoyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Each source loads independently; a failure degrades only its section. Threads
  // load alongside the rest, then feed the triage assembler so unanswered
  // messages flow through `loadTriageData` as first-class queue lines (NOT a
  // separate module). A dead threads loader just omits the message lines — the
  // rest of the queue still renders.
  const [athletesResult, railResult, threadsResult, activityResult] = await Promise.all([
    safeAthletes(session.coach_id),
    loadRailData({ coach_id: session.coach_id }),
    safeThreads(session.coach_id),
    safeActivity(session.coach_id),
  ]);
  const triageResult = await loadTriageData({
    coach_id: session.coach_id,
    threads: threadsResult.ok ? threadsResult.data : [],
  });

  const athletes = athletesResult.ok ? athletesResult.data : [];
  const isFirstRun = athletesResult.ok && athletes.length === 0;

  // Team pulse derives from the roster rows already loaded (no extra N+1).
  const pulseResult = athletesResult.ok
    ? await safePulse(session.coach_id, athletes)
    : ({ ok: false } as LoaderResult<TeamPulse>);

  const triage = triageResult.ok ? triageResult.data : EMPTY_TRIAGE;
  const teamReadiness = pulseResult.ok ? teamReadinessPct(pulseResult.data) : null;

  // Fill each card's readiness ring from the roster rows ALREADY loaded above (no
  // extra query / no N+1): neither the attention store nor the inbox carry
  // readiness_score, so the glyph ring would otherwise render empty (gap #3).
  const readinessByAthlete = new Map<string, number | null>(
    athletes.map((a) => [a.athlete_id, a.readiness_score]),
  );
  const enrichReadiness = (items: TriageItem[]): TriageItem[] =>
    items.map((i) => {
      const score = readinessByAthlete.get(i.athlete_id);
      return score === undefined ? i : ({ ...i, readiness_score: score } as TriageItem);
    });
  const triageView: TriageData = {
    ...triage,
    critico: enrichReadiness(triage.critico),
    vigilar: enrichReadiness(triage.vigilar),
  };

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col">
      <MorningRitualHeader needCount={needCount(triageView)} teamReadiness={teamReadiness} />

      <div className="mt-2 grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Queue column */}
        <div className="flex min-w-0 flex-col gap-6">
          {isFirstRun ? (
            <FirstRun teamReadiness={teamReadiness} />
          ) : triageResult.ok ? (
            // Unanswered messages are merged into this ONE queue as first-class
            // lines (the message_unanswered signal is dropped from the queue, and
            // each waiting thread shows once as a Message line with inline reply).
            <TriageQueue data={triageView} />
          ) : (
            <ErrorState
              title="No se pudo cargar la cola"
              description="Falló la lectura de la cola de triage. Recarga para reintentar."
            />
          )}
        </div>

        {/* Right rail */}
        <div className="flex min-w-0 flex-col gap-4">
          {railResult.ok && pulseResult.ok ? (
            <HoyRail
              sessions={railResult.data.sessions}
              upcoming={railResult.data.upcoming}
              pulse={pulseResult.data}
            />
          ) : (
            <ErrorState inline title="No se pudo cargar el panel del equipo." />
          )}

          {/* Actividad de hoy — ambient glance (review-at-scale, not a queue).
              A dead loader simply omits the module (never blocks the rail). */}
          {activityResult.ok ? (
            <ActivityTodayClient data={activityResult.data} glanceLimit={ACTIVITY_GLANCE_LIMIT} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// First-run: 0 athletes → invite (SPEC §4 "first-run Nuevo atleta").
function FirstRun({ teamReadiness }: { teamReadiness: number | null }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <ReadinessRing score={teamReadiness} size="lg" />
      <EmptyState
        variant="first-run"
        description="Aún no tienes atletas activos. Cuando añadas el primero y termine su onboarding, sus decisiones aparecerán aquí."
      />
    </div>
  );
}

// ── Safe loader wrappers (never throw to the page) ────────────────────────────

async function safeAthletes(
  coach_id: bigint,
): Promise<LoaderResult<Awaited<ReturnType<typeof fetchAthletesForCoach>>>> {
  try {
    return { ok: true, data: await fetchAthletesForCoach({ coach_id }) };
  } catch {
    return { ok: false };
  }
}

async function safePulse(
  coach_id: bigint,
  athletes: Awaited<ReturnType<typeof fetchAthletesForCoach>>,
): Promise<LoaderResult<TeamPulse>> {
  try {
    return { ok: true, data: await loadTeamPulse({ coach_id, athletes }) };
  } catch {
    return { ok: false };
  }
}

async function safeThreads(coach_id: bigint): Promise<LoaderResult<CoachThreadSummary[]>> {
  try {
    return { ok: true, data: await listThreadsForCoach({ coach_id }) };
  } catch {
    return { ok: false };
  }
}

async function safeActivity(coach_id: bigint): Promise<LoaderResult<ActivityTodayData>> {
  try {
    return { ok: true, data: await loadActivityToday({ coach_id, limit: ACTIVITY_GLANCE_LIMIT }) };
  } catch {
    return { ok: false };
  }
}
