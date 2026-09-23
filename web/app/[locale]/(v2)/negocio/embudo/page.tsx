// Negocio › Embudo — dónde se cae la gente, por cohorte y periodo (?rango=).
// Cada fuente se degrada sola; nada se inventa (lib/dashboard/coach/metrics).

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  EMPTY_CALL_OUTCOMES,
  EMPTY_WEEKLY_SERIES,
  emptyFunnelSnapshot,
  loadByObjetivo,
  loadCallOutcomes,
  loadFunnelSnapshot,
  loadWeeklySeries,
  parseMetricsRange,
} from '@/lib/dashboard/coach/metrics';
import { EmbudoScreen } from '@/components/v2/metricas/EmbudoScreen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Embudo · Negocio' };

export default async function EmbudoPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const range = parseMetricsRange((await searchParams).rango);

  const [snapshot, outcomes, weekly, by_objetivo] = await Promise.all([
    loadFunnelSnapshot(session.coach_id, range).catch(() => emptyFunnelSnapshot(range)),
    loadCallOutcomes(session.coach_id, range).catch(() => EMPTY_CALL_OUTCOMES),
    loadWeeklySeries(session.coach_id).catch(() => EMPTY_WEEKLY_SERIES),
    loadByObjetivo(session.coach_id, range).catch(() => []),
  ]);

  return <EmbudoScreen snapshot={snapshot} outcomes={outcomes} weekly={weekly} by_objetivo={by_objetivo} />;
}
