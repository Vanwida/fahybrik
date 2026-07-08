// v2 · MÉTRICAS DEL FUNNEL (#20) — server component. Gates on the coach session,
// reads the range from `?rango=` (server-rendered; the selector is link-buttons,
// not a client component), then DERIVES the ingest funnel from the real tables
// (leads / appointments / session_reports / athlete_invitations). Each loader is
// wrapped in .catch so one dead source degrades its own panel instead of 500ing
// the page (same resilience pattern as hoy/page.tsx). Nothing is invented — see
// lib/dashboard/coach/metrics.ts.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import {
  parseMetricsRange,
  loadFunnelSnapshot,
  loadCallOutcomes,
  loadWeeklySeries,
  loadByObjetivo,
  emptyFunnelSnapshot,
  EMPTY_CALL_OUTCOMES,
  EMPTY_WEEKLY_SERIES,
  type FunnelMetrics,
} from '@/lib/dashboard/coach/metrics';
import { MetricasPanel } from '@/components/v2/metricas/MetricasPanel';

export const dynamic = 'force-dynamic';

export default async function V2MetricasPage({
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
    loadFunnelSnapshot(range).catch(() => emptyFunnelSnapshot(range)),
    loadCallOutcomes(range).catch(() => EMPTY_CALL_OUTCOMES),
    loadWeeklySeries().catch(() => EMPTY_WEEKLY_SERIES),
    loadByObjetivo(range).catch(() => []),
  ]);

  const data: FunnelMetrics = { snapshot, outcomes, weekly, by_objetivo };

  return <MetricasPanel {...data} />;
}
