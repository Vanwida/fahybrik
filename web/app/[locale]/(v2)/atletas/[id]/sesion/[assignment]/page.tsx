// v2 · ATLETA · SESIÓN — la sesión en profundidad, a página entera.
//
// POR QUÉ PÁGINA Y NO EL CAJÓN. El cajón de la ficha (`SessionDetailDrawer`)
// sigue siendo el vistazo y no se toca: para una sesión de fuerza, una lista de
// números se lee perfecta en 512 px. Una carrera archivada trae un EJE DE
// TIEMPO, y un eje de tiempo pide ancho: un fartlek de ocho tramos en 41 minutos
// pone cada uno en 11 px dentro del cajón y en 22 aquí. Además trae siete piezas
// (sujeto, curva, troceado, mapa, derivadas, resto de la sesión, lo que dijo el
// atleta), y en una columna estrecha con la ficha tapada por detrás eso es un
// túnel de scroll. Ver `docs/carrera-en-el-panel.html`, apartado 02.
//
// Vive DENTRO de la ficha del atleta, no como pantalla suelta: el lunes el coach
// repasa veinte sesiones seguidas y se vuelve con un clic.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { sql } from '@/lib/db';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';
import { SesionScreen } from '@/components/v2/carrera/SesionScreen';

export const dynamic = 'force-dynamic';

export default async function V2AthleteSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; assignment: string }>;
}) {
  const { locale, id, assignment } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  const assignmentId = Number(assignment);
  if (!Number.isFinite(athleteId) || athleteId <= 0) notFound();
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) notFound();

  const result = await loadCoachSessionDetail({
    sql,
    coach_id: session.coach_id,
    athlete_id: athleteId,
    assignment_id: assignmentId,
  });
  if (!result.ok) notFound();

  return (
    <SesionScreen
      detail={result.session}
      athleteName={result.athlete_name}
      backHref={`/atletas/${id}`}
    />
  );
}
