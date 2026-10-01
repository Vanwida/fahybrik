'use client';

import { Espina, TOKENS_V2, TONOS_V2, colorDelTono, tramosDesdePlan } from '@/components/plan-espina';
import { ZonasChart } from '../rendimiento/ZonasChart';
import { ZonasComparativa } from '../rendimiento/ZonasComparativa';
import { buildWindowCells, rangeBands, ZONE_METRICS_EMBED } from '@/lib/zones/chart';
import type { CommunicationItemDTO } from '@fahybrid/shared/domain/coach-communications';

/** Conserva las secciones y los datos del destinatario al releer una nota. */
export function SeccionesDeNota({ items }: { items: CommunicationItemDTO[] }) {
  return <ul className="flex flex-col gap-3">{items.map((item) => (
    <li key={item.id} className="flex flex-col gap-2 rounded-panel border border-v2-border p-3">
      {item.label ? <p className="t-meta text-v2-muted">{item.label}</p> : null}
      <Seccion item={item} />
    </li>
  ))}</ul>;
}

function Seccion({ item }: { item: CommunicationItemDTO }) {
  if (item.display === 'cifra') return <p className="t-title t-tnum text-v2-fg">{item.content}</p>;
  if (item.display === 'camino') {
    return item.camino?.segments.length ? (
      <Espina tokens={TOKENS_V2} tramos={tramosDesdePlan(item.camino, TONOS_V2)} />
    ) : <p className="t-body-sm text-v2-muted">Este atleta todavía no tiene un plan que mostrar.</p>;
  }
  if (item.display === 'grafica') {
    const chart = item.grafica;
    if (!chart?.weeks_data.length) return <p className="t-body-sm text-v2-muted">No hay entrenos con pulso medido en este periodo.</p>;
    const cells = buildWindowCells({ weeks_data: chart.weeks_data, week_start: chart.week_start, weeks: chart.weeks });
    return <ZonasChart cells={cells} bands={[]} ranges={rangeBands(cells, chart.ranges)} ariaLabel={`Tiempo en zonas, ${chart.weeks} semanas`} metrics={ZONE_METRICS_EMBED} />;
  }
  if (item.display === 'comparativa') {
    return item.comparativa ? <ZonasComparativa comparativa={item.comparativa} /> : <p className="t-body-sm text-v2-muted">No se ha podido resolver la comparación de este atleta.</p>;
  }
  if (item.display === 'test_result') {
    const report = item.test_result?.report;
    return report ? <div className="flex flex-col gap-2">
      <p className="t-title t-tnum text-v2-fg">{Math.round(report.unloaded_cm)} cm</p>
      <p className="t-meta text-v2-muted">{report.height_label}{report.lri_label ? ` · LRI ${report.lri_label.toLowerCase()}` : ''}</p>
      <p className="t-body text-v2-fg">{report.lectura}</p>
    </div> : <p className="t-body-sm text-v2-muted">No se ha podido resolver el informe del test.</p>;
  }
  if (item.display === 'reparto') return <div className="flex flex-col gap-2">
    <div aria-hidden className="flex h-2 gap-1 overflow-hidden rounded-full">{item.segments.map((s, i) => (
      <span key={s.position} className="min-w-1 rounded-full" style={{ flex: s.value_num, background: colorDelTono(TONOS_V2, i) }} />
    ))}</div>
    <div className="flex flex-wrap gap-3">{item.segments.map((s) => <span key={s.position} className="t-body-sm text-v2-fg"><b className="t-tnum">{s.value_num}</b> {s.label}</span>)}</div>
  </div>;
  return <p className="whitespace-pre-line t-body text-v2-fg">{item.content}</p>;
}
