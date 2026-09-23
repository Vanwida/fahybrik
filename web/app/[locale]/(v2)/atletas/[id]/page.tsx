// v2 · FICHA DEL ATLETA — el cockpit (DECISIONS 2026-09-23, informe C §4).
//
// Carga por partes: la cabecera y el estado (todas las pestañas), y SOLO la
// pestaña pedida (`?tab=plan|rendimiento|perfil`, Plan por defecto). El K/J entre
// atletas llega en streaming (Suspense): el roster no retrasa la ficha.
// Las URLs viejas (`?tab=resumen`, `?tab=rendimiento&vista=ritmos`,
// `?tab=atleta&vista=pagos`, `?tab=mensajes`…) redirigen a la canónica.
// `?sesion=<assignment_id>` abre ese entreno en el panel; `?comunicado=nuevo`, el
// compositor. Un atleta ajeno → 404.

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  canonicalFichaQuery,
  loadFichaEstado,
  loadFichaPerfil,
  loadFichaShell,
  resolveAtletaUrl,
} from '@/lib/dashboard/v2/atleta-detalle';
import { loadFichaCalendar } from '@/lib/dashboard/v2/ficha-calendar';
import { loadIntakeReview } from '@/lib/dashboard/v2/intake-review';
import { loadFichaRendimiento } from '@/lib/dashboard/v2/ficha-rendimiento';
import { Ficha } from '@/components/v2/atleta-detalle/Ficha';
import { FichaNav } from '@/components/v2/atleta-detalle/ficha/FichaNav';
import { AthleteNavSkeleton } from '@/components/v2/atleta-detalle/ficha/AthleteNav';
import { PlanTab } from '@/components/v2/atleta-detalle/plan/PlanTab';
import { RendimientoView } from '@/components/v2/atleta-detalle/rendimiento/RendimientoView';
import { PerfilView } from '@/components/v2/atleta-detalle/perfil/PerfilView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Atleta' };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function FichaAtletaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0) notFound();

  const q = await searchParams;
  const desde = one(q.desde);
  const url = resolveAtletaUrl({
    tab: one(q.tab),
    vista: one(q.vista),
    seccion: one(q.seccion),
    sesion: one(q.sesion),
    zoom: one(q.zoom),
    comunicado: one(q.comunicado),
    historial: one(q.historial),
    chat: one(q.chat),
  });
  if (url.legacy) {
    redirect({ href: `/atletas/${athleteId}${canonicalFichaQuery(url, desde)}`, locale });
  }

  const shell = await loadFichaShell({
    coach_id: session.coach_id,
    athlete_id: athleteId,
    club_name: session.club_name,
  });
  if (!shell) notFound();

  let content: React.ReactNode;
  if (url.tab === 'plan') {
    const [calendar, estado, intake] = await Promise.all([
      loadFichaCalendar({ coach_id: session.coach_id, athlete_id: athleteId, zoom: url.zoom }).catch(() => null),
      loadFichaEstado({ coach_id: session.coach_id, athlete_id: athleteId, readiness: shell.readiness }).catch(
        () => null,
      ),
      shell.intake_pending && !shell.has_upcoming_plan
        ? loadIntakeReview({ coach_id: session.coach_id, athlete_id: athleteId }).catch(() => null)
        : Promise.resolve(null),
    ]);
    content = <PlanTab calendar={calendar} estado={estado} intake={intake} />;
  } else if (url.tab === 'rendimiento') {
    const data = await loadFichaRendimiento({ coach_id: session.coach_id, athlete_id: athleteId });
    content = <RendimientoView data={data} seccion={url.seccion} />;
  } else {
    const perfil = await loadFichaPerfil({ coach_id: session.coach_id, athlete_id: athleteId });
    content = <PerfilView perfil={perfil} seccion={url.seccion} historial={url.historial} />;
  }

  return (
    <Ficha
      shell={shell}
      url={url}
      nav={
        <Suspense fallback={<AthleteNavSkeleton />}>
          <FichaNav coach_id={session.coach_id} athlete_id={shell.athlete_id} desde={desde} />
        </Suspense>
      }
    >
      {content}
    </Ficha>
  );
}
