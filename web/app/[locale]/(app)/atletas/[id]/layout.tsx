import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';

// Guard común de /atletas/[id]/*. El header de atleta vive DENTRO de la shell
// calendar-first (AthleteShell, UX redesign §2b) — no aquí: /intake es una
// página propia con su propio header y los antiguos sub-tabs redirigen a la
// shell con ?section=.

export default async function AthleteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId)) notFound();

  return children;
}
