// Ajustes › Método — cómo entrenas (la entrevista y su párrafo), cómo agrupas
// a tus atletas (el eje y sus valores, con qué marca abre cada uno), los pasos
// de «Progresar», tus zonas de FC y de ritmo, las lecturas de carrera, cada
// cuánto repites un test, los marcadores clave de la ficha y los umbrales de
// los avisos. Todo es método del coach con defectos a la vista (HARD RULE Nº0).

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachMethodInterview } from '@/lib/coach/method-interview';
import { getCoachSignalThresholds } from '@/lib/coach/signal-thresholds';
import { getLevelAxisSetting } from '@/lib/coach/level-axis';
import { listCoachLevels } from '@/lib/coach/levels';
import { getCoachHrMethodSetting } from '@/lib/coach/hr-method';
import { getCoachRunningThresholdsSetting } from '@/lib/coach/running-thresholds';
import { getCoachPaceZones } from '@/lib/coach/methodology-zones';
import { getTestCadenceSetting } from '@/lib/coach/test-cadence';
import { loadProgressionSteps } from '@/lib/dashboard/programming/programs';
import { loadCoachKeyMarkers } from '@/lib/coach/key-markers';
import { KEY_MARKERS_MAX, KEY_MARKER_CATALOG } from '@fahybrid/shared/domain/coach/key-markers';
import { ProgressionSettings } from '@/components/v2/ajustes/ProgressionSettings';
import { KeyMarkersSettings } from '@/components/v2/ajustes/KeyMarkersSettings';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { AjustesLoadError } from '@/components/v2/ajustes/AjustesLoadError';
import { LevelsSettings } from '@/components/v2/ajustes/LevelsSettings';
import { HrMethodSettings } from '@/components/v2/ajustes/HrMethodSettings';
import { PaceZonesSettings } from '@/components/v2/ajustes/PaceZonesSettings';
import { RunningThresholdsSettings } from '@/components/v2/ajustes/RunningThresholdsSettings';
import { TestCadenceSetting } from '@/components/v2/ajustes/TestCadenceSetting';
import { ThresholdsSettings } from '@/components/v2/ajustes/ThresholdsSettings';
import { MetodoInterview } from '@/components/v2/como-entrenas/MetodoInterview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Método · Ajustes' };

export default async function MetodoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const cid = session.coach_id;
  const [interview, thresholds, axis, levels, steps, hr, paceKm, pace500, running, cadence, markers] = await Promise.all([
    getCoachMethodInterview(cid).catch(() => null),
    getCoachSignalThresholds(cid).catch(() => null),
    getLevelAxisSetting(cid).catch(() => null),
    listCoachLevels(cid).catch(() => null),
    loadProgressionSteps(cid).catch(() => null),
    getCoachHrMethodSetting(cid).catch(() => null),
    getCoachPaceZones(cid, 'per_km').catch(() => null),
    getCoachPaceZones(cid, 'per_500m').catch(() => null),
    getCoachRunningThresholdsSetting(cid).catch(() => null),
    getTestCadenceSetting(cid).catch(() => null),
    loadCoachKeyMarkers(cid).catch(() => null),
  ]);

  return (
    <AjustesPanel title="Método" subtitle="Cómo trabajas. La IA programa con esto y los avisos lo usan.">
      {interview ? <MetodoInterview initial={interview} /> : <AjustesLoadError what="tu entrevista" />}
      {axis && levels ? (
        <LevelsSettings
          axisStored={axis.level_axis_label}
          initial={{
            levels: levels.filter((l) => l.archived_at == null),
            archived: levels.filter((l) => l.archived_at != null),
          }}
        />
      ) : (
        <AjustesLoadError what="cómo agrupas a tus atletas" />
      )}
      {steps ? <ProgressionSettings initial={steps} /> : null}
      {hr ? <HrMethodSettings initial={hr} /> : <AjustesLoadError what="tus zonas de FC" />}
      {paceKm && pace500 ? (
        <PaceZonesSettings initial={{ per_km: paceKm, per_500m: pace500 }} />
      ) : (
        <AjustesLoadError what="tus zonas de ritmo" />
      )}
      {running ? <RunningThresholdsSettings initial={running} /> : <AjustesLoadError what="tus lecturas de carrera" />}
      {cadence ? <TestCadenceSetting initial={cadence} /> : null}
      {markers ? (
        <KeyMarkersSettings
          initial={{
            selected: markers.map((m) => m.key),
            catalog: KEY_MARKER_CATALOG.map((d) => ({ key: d.key, label: d.label })),
            max: KEY_MARKERS_MAX,
          }}
        />
      ) : null}
      {thresholds ? <ThresholdsSettings initial={thresholds} /> : <AjustesLoadError what="tus umbrales de avisos" />}
    </AjustesPanel>
  );
}
