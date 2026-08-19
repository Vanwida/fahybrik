// v2 · ATLETAS — la CASA del panel (rediseño FLEXR): el roster completo con la
// franja de triage del día encima. Server component: loads the SAME real roster
// the v1 list uses (fetchAthletesForCoach) and hands it to the client
// <RosterDirectory> for live search + client-side filters/sort + the
// tarjetas/tabla view toggle. La franja resume las MISMAS fuentes que /hoy
// (buildHoyLanes + strips), así el número de decisiones coincide con su titular
// y «Resolver» aterriza allí. A dead loader degrades its contribution (empty
// roster / franja sin ese dato) rather than 500-ing the page.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { listDoublesPairsForCoach } from '@/lib/dashboard/coach/doubles-pairs';
import { listPendingIntake } from '@/lib/coach/intake';
import { listThreadsForCoach } from '@/lib/chat/service';
import { loadCoachInbox, type CoachInbox } from '@/lib/dashboard/coach/inbox';
import {
  buildHoyLanes,
  fetchNivelSugeridoCards,
  fetchAsignacionSugeridaCards,
  fetchSiguienteMicrocicloCards,
  fetchTransitionReadyAthleteIds,
} from '@/lib/dashboard/v2/hoy-lanes';
import { RosterDirectory } from '@/components/v2/atletas/RosterDirectory';
import type { TriageStripData } from '@/components/v2/atletas/TriageStrip';

export const dynamic = 'force-dynamic';

/** «Jordi, Iván y 2 más» — personas, no números, recortado a dos nombres. */
function namesLabel(names: string[]): string {
  const first = names.slice(0, 2).map((n) => n.split(' ')[0]);
  const rest = names.length - first.length;
  if (first.length === 0) return '';
  return rest > 0 ? `${first.join(', ')} y ${rest} más` : first.join(', ');
}

export default async function V2AtletasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const [
    athletes,
    doubles_pairs,
    threads,
    inbox,
    nivel_sugerido_cards,
    asignacion_sugerida_cards,
    siguiente_microciclo_cards,
    pending_intakes,
    transition_ready_ids,
  ] = await Promise.all([
    fetchAthletesForCoach({ coach_id: session.coach_id }).catch(() => []),
    listDoublesPairsForCoach(session.coach_id).catch(() => []),
    listThreadsForCoach({ coach_id: session.coach_id }).catch(() => []),
    loadCoachInbox({ coach_id: session.coach_id }).catch((): CoachInbox | null => null),
    fetchNivelSugeridoCards(session.coach_id).catch(() => []),
    fetchAsignacionSugeridaCards(session.coach_id).catch(() => []),
    fetchSiguienteMicrocicloCards(session.coach_id).catch(() => []),
    listPendingIntake({ coach_id: session.coach_id }).catch(() => []),
    fetchTransitionReadyAthleteIds(session.coach_id).catch(() => new Set<string>()),
  ]);

  const lanesData = buildHoyLanes({
    athletes,
    threads,
    inbox,
    nivel_sugerido_cards,
    asignacion_sugerida_cards,
    siguiente_microciclo_cards,
    transition_ready_ids,
  });

  // El MISMO recuento que el titular de /hoy (HoyBoard.pendientes) — si aquello
  // cambia, esto cambia con ello o los dos números se contradicen en pantalla.
  const propuestas =
    lanesData.nivel_sugerido_cards.length +
    lanesData.asignacion_sugerida_cards.length +
    lanesData.siguiente_microciclo_cards.length +
    lanesData.week_adjustment_cards.length;
  const triage: TriageStripData = {
    pendientes: lanesData.need_attention_count + pending_intakes.length + propuestas,
    lanes: lanesData.lanes
      .filter((lane) => lane.count > 0)
      .map((lane) => ({
        title: lane.title,
        dot_var: lane.dot_var,
        count: lane.count,
        names_label: namesLabel(lane.cards.map((c) => c.athlete_name)),
      })),
    altas: pending_intakes.length,
    propuestas,
  };

  return (
    <RosterDirectory athletes={athletes} doubles_pairs={doubles_pairs} triage={triage} />
  );
}
