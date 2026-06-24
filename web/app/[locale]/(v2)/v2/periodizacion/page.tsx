// v2 · PERIODIZACIÓN — "El marco de tu método." Server component: loads the
// coach's framework data (Niveles = athlete_levels with live counts, Fases =
// methodology_phases) and hands it to the client <PeriodizacionView> for the
// area switch + in-place CRUD. The active area is reflected in ?area= so it's
// linkable. A dead loader degrades to empty (the panels render their empty
// states) instead of 500-ing the page.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadPeriodizacionData } from '@/lib/dashboard/v2/periodizacion';
import { loadSecuenciasData } from '@/lib/dashboard/v2/secuencias';
import {
  loadPipelineProgress,
  EMPTY_PIPELINE_PROGRESS,
} from '@/lib/dashboard/v2/orientacion';
import {
  PeriodizacionView,
  type PeriodizacionArea,
} from '@/components/v2/periodizacion/PeriodizacionView';

export const dynamic = 'force-dynamic';

const VALID_AREAS: readonly PeriodizacionArea[] = ['niveles', 'fases', 'secuencias'];

const EMPTY_SECUENCIAS = { levels: [], phases: [], microciclos: [], cells: {} };

function resolveArea(raw: string | string[] | undefined): PeriodizacionArea {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VALID_AREAS.includes(v as PeriodizacionArea) ? (v as PeriodizacionArea) : 'niveles';
}

export default async function V2PeriodizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const { area } = await searchParams;
  const initialArea = resolveArea(area);

  const [data, secuencias, progress] = await Promise.all([
    loadPeriodizacionData(session.coach_id).catch(() => ({ levels: [], phases: [] })),
    loadSecuenciasData(session.coach_id).catch(() => EMPTY_SECUENCIAS),
    loadPipelineProgress(session.coach_id).catch(() => EMPTY_PIPELINE_PROGRESS),
  ]);

  return (
    <PeriodizacionView
      data={data}
      secuencias={secuencias}
      initialArea={initialArea}
      coachKey={String(session.coach_id)}
      progress={progress}
    />
  );
}
