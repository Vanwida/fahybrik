// v2 · PERIODIZACIÓN — "El marco de tu método." Server component: loads the
// coach's framework data (Niveles = athlete_levels with live counts) + the
// periodization sequences, and hands them to the client <PeriodizacionView>.
//
// The IA is levels-first and NESTED: the levels home is the primary view; clicking
// a level enters its periodization (its días-variants + the microciclo sequence).
// The open level is reflected in ?level=<id> so it's linkable. The legacy ?area=
// param is ignored — those links land on the levels home. A dead loader degrades
// to empty (the panels render their empty states) instead of 500-ing the page.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadPeriodizacionData } from '@/lib/dashboard/v2/periodizacion';
import { loadSecuenciasData } from '@/lib/dashboard/v2/secuencias';
import {
  loadPipelineProgress,
  EMPTY_PIPELINE_PROGRESS,
} from '@/lib/dashboard/v2/orientacion';
import { PeriodizacionView } from '@/components/v2/periodizacion/PeriodizacionView';

export const dynamic = 'force-dynamic';

const EMPTY_SECUENCIAS = { levels: [], microciclos: [], cells: {} };

function resolveLevelId(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^\d+$/.test(v) ? v : null;
}

export default async function V2PeriodizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const { level } = await searchParams;
  const initialLevelId = resolveLevelId(level);

  const [data, secuencias, progress] = await Promise.all([
    loadPeriodizacionData(session.coach_id).catch(() => ({ levels: [] })),
    loadSecuenciasData(session.coach_id).catch(() => EMPTY_SECUENCIAS),
    loadPipelineProgress(session.coach_id).catch(() => EMPTY_PIPELINE_PROGRESS),
  ]);

  return (
    <PeriodizacionView
      data={data}
      secuencias={secuencias}
      initialLevelId={initialLevelId}
      coachKey={String(session.coach_id)}
      progress={progress}
    />
  );
}
