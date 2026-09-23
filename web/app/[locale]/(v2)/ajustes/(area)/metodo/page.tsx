// Ajustes › Método — cómo entrenas (la entrevista y su párrafo), cómo agrupas
// a tus atletas y los umbrales de los avisos. Todo es método del coach con
// defectos a la vista (HARD RULE Nº0).

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachMethodInterview } from '@/lib/coach/method-interview';
import { getCoachSignalThresholds } from '@/lib/coach/signal-thresholds';
import { getLevelAxisSetting } from '@/lib/coach/level-axis';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { AjustesLoadError } from '@/components/v2/ajustes/AjustesLoadError';
import { LevelAxisSetting } from '@/components/v2/ajustes/LevelAxisSetting';
import { ThresholdsSettings } from '@/components/v2/ajustes/ThresholdsSettings';
import { MetodoInterview } from '@/components/v2/como-entrenas/MetodoInterview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Método · Ajustes' };

export default async function MetodoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const [interview, thresholds, axis] = await Promise.all([
    getCoachMethodInterview(session.coach_id).catch(() => null),
    getCoachSignalThresholds(session.coach_id).catch(() => null),
    getLevelAxisSetting(session.coach_id).catch(() => null),
  ]);

  return (
    <AjustesPanel title="Método" subtitle="Cómo trabajas. La IA programa con esto y los avisos lo usan.">
      {interview ? <MetodoInterview initial={interview} /> : <AjustesLoadError what="tu entrevista" />}
      {axis ? <LevelAxisSetting stored={axis.level_axis_label} /> : null}
      {thresholds ? <ThresholdsSettings initial={thresholds} /> : <AjustesLoadError what="tus umbrales de avisos" />}
    </AjustesPanel>
  );
}
