import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
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

  const athletes = await fetchAthletesForCoach({ coach_id: session.coach_id });

  return <AthletesList athletes={athletes} />;
}
