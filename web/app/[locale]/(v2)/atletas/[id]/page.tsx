// v2 · ATLETA · DETALLE — server component. Validates the athlete id, gates on the
// coach session, loads the unified detail payload, and renders the client
// orchestrator with the URL-driven tab (?tab=resumen|plan|rendimiento|del-coach|atleta).
// Las ?tab= viejas redirigen (resolveAtletaUrl). Un atleta ajeno → notFound().
//
// ?sesion=<assignment_id> (solo con tab=plan) hace ENLAZABLE una sesión concreta
// del plan: PlanTab la abre en el cajón al cargar.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadAthleteDetalle, resolveAtletaUrl } from '@/lib/dashboard/v2/atleta-detalle';
import { AthleteDetalle } from '@/components/v2/atleta-detalle/AthleteDetalle';

export const dynamic = 'force-dynamic';

export default async function V2AthleteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string; sesion?: string; vista?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) notFound();

  const detalle = await loadAthleteDetalle({
    coach_id: session.coach_id,
    athlete_id: athleteId,
  });
  if (!detalle) notFound();

  const { tab, sesion, vista } = await searchParams;
  const resolved = resolveAtletaUrl(tab, vista);
  return (
    <AthleteDetalle
      detalle={detalle}
      tab={resolved.tab}
      rendimientoVista={resolved.rendimientoVista}
      atletaSeccion={resolved.atletaSeccion}
      initialSessionId={sesion && sesion.trim().length > 0 ? sesion.trim() : null}
      coachName={session.club_name}
    />
  );
}
