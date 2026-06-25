import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { loadCoachPhases } from '@/lib/dashboard/coach/phases';
import { AthletesList } from '@/components/dashboard/AthletesList';

export const dynamic = 'force-dynamic';

// Roster canónico (/atletas) — UX redesign §2a. El grid + filtros + búsqueda
// se conservan; la cola de intakes y el banner de review viven ahora en HOY
// (/). Los filtros persisten en la URL (?filter=&modality=&readiness=&q=),
// gestionados client-side por AthletesList.
export default async function AtletasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Fases de periodización del coach (migración 0052). Carga ÚNICA aquí; se hilan
  // al roster para resolver el nombre de fase de cada bloque igual que la ficha
  // del atleta. loadCoachPhases está guardada: devuelve [] si la tabla no existe
  // (pre-migración) → el resolver cae al enum ATR legacy y se ve idéntico a hoy.
  const [athletes, coachPhases] = await Promise.all([
    fetchAthletesForCoach({ coach_id: session.coach_id }),
    loadCoachPhases(session.coach_id),
  ]);

  return <AthletesList athletes={athletes} coachPhases={coachPhases} />;
}
