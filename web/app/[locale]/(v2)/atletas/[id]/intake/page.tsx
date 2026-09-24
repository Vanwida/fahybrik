// v2 · ATLETA · INTAKE — server component for the per-athlete intake review
// (`?fila=<ids>`: «Revisar en fila» de Hoy — ofrece «Siguiente alta»). Gates
// on the coach session, loads the composed review payload (profile + level-matched
// month proposal + agnostic classification), and renders the client review screen.
// A non-existent / not-owned athlete → notFound().

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadIntakeReview } from '@/lib/dashboard/v2/intake-review';
import { IntakeReview } from '@/components/v2/intake/IntakeReview';

export const dynamic = 'force-dynamic';

export default async function IntakeReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ fila?: string }>;
}) {
  const { locale, id } = await params;
  const { fila } = await searchParams;
  // «Revisar en fila» desde Hoy: las siguientes altas, en orden.
  const queue = (fila ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^\d{1,18}$/.test(x) && x !== id);
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) notFound();

  const review = await loadIntakeReview({
    coach_id: session.coach_id,
    athlete_id: athleteId,
  });
  if (!review) notFound();

  return <IntakeReview review={review} athleteId={String(athleteId)} queue={queue} />;
}
