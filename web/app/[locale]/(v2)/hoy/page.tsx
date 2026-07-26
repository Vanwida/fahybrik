// v2 · TRIAGE · HOY — the flagship screen. Server component: loads the SAME real
// sources v1 uses (roster, threads, inbox alerts) via the existing loaders, then
// maps them into the 4-lane board (lib/dashboard/v2/hoy-lanes). Each source is
// wrapped so one failure degrades its contribution, never 500s the page. The
// computed board flows to the client <HoyBoard> for search + interactivity.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { listPendingIntake } from '@/lib/coach/intake';
import { listThreadsForCoach } from '@/lib/chat/service';
import { loadCoachInbox, type CoachInbox } from '@/lib/dashboard/coach/inbox';
import {
  loadActivityToday,
  ACTIVITY_GLANCE_LIMIT,
  type ActivityToday,
} from '@/lib/dashboard/coach/activity-today';
import {
  buildHoyLanes,
  fetchNivelSugeridoCards,
  fetchAsignacionSugeridaCards,
  fetchSiguienteMicrocicloCards,
  fetchTransitionReadyAthleteIds,
} from '@/lib/dashboard/v2/hoy-lanes';
import { HoyBoard } from '@/components/v2/hoy/HoyBoard';

export const dynamic = 'force-dynamic';

/** Today's date as a Spanish display string, e.g. "jueves 19 jun". */
function todayLabel(): string {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Madrid',
  });
  return fmt.format(new Date()).replace(/\.$/, '');
}

export default async function V2HoyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Independent safe loads — a dead loader contributes nothing, never throws.
  const [
    athletes,
    threads,
    inbox,
    nivel_sugerido_cards,
    asignacion_sugerida_cards,
    siguiente_microciclo_cards,
    pending_intakes,
    transition_ready_ids,
    activity,
  ] = await Promise.all([
    fetchAthletesForCoach({ coach_id: session.coach_id }).catch(() => []),
    listThreadsForCoach({ coach_id: session.coach_id }).catch(() => []),
    loadCoachInbox({ coach_id: session.coach_id }).catch((): CoachInbox | null => null),
    fetchNivelSugeridoCards(session.coach_id).catch(() => []),
    fetchAsignacionSugeridaCards(session.coach_id).catch(() => []),
    fetchSiguienteMicrocicloCards(session.coach_id).catch(() => []),
    listPendingIntake({ coach_id: session.coach_id }).catch(() => []),
    fetchTransitionReadyAthleteIds(session.coach_id).catch(() => new Set<string>()),
    // "Actividad de hoy" — what the roster actually logged today (SABER glance).
    // Newest-first, capped to the rail limit; degrades to empty, never 500s.
    loadActivityToday({ coach_id: session.coach_id, limit: ACTIVITY_GLANCE_LIMIT }).catch(
      (): ActivityToday => ({ sessions: [], total: 0, off_target_count: 0 }),
    ),
  ]);

  const data = buildHoyLanes({
    athletes,
    threads,
    inbox,
    nivel_sugerido_cards,
    asignacion_sugerida_cards,
    siguiente_microciclo_cards,
    transition_ready_ids,
  });

  return (
    <HoyBoard
      data={data}
      today={todayLabel()}
      coach_name={session.full_name}
      coachKey={String(session.coach_id)}
      pending_intakes={pending_intakes}
      activity={activity}
    />
  );
}
