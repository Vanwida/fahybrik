// v2 · ATLETA · DETALLE — server component. Validates the athlete id, gates on the
// coach session, loads the unified detail payload (all per-athlete loaders fanned
// out with per-section degradation), and renders the client orchestrator with the
// URL-driven active sub-tab (?tab=perfil|plan|historico|biometria|mensajes). A
// non-existent / not-owned athlete → notFound().

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadAthleteDetalle, normalizeAtletaTab } from '@/lib/dashboard/v2/atleta-detalle';
import { AthleteDetalle } from '@/components/v2/atleta-detalle/AthleteDetalle';

export const dynamic = 'force-dynamic';

export default async function V2AthleteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
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

  const { tab } = await searchParams;
  return <AthleteDetalle detalle={detalle} tab={normalizeAtletaTab(tab)} />;
}
