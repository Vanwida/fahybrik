'use client';

// Carga con los términos estándar (CTL / ATL / TSB / ACWR, lo que ya habla un
// coach formado en TrainingPeaks) y una glosa en castellano llano, más la curva
// (PMC). Antes eran «Fondo / Reciente / Frescura» sin gráfica (RD3).

import { Card, CardHeader, EmptyState, KPI, KPIRow } from '@/components/v2/ui';
import type { LoadView } from '@/lib/dashboard/v2/ficha-rendimiento';
import { loadHistoryLine } from '@/lib/dashboard/v2/ficha-load-history';
import { PmcChart } from './PmcChart';

function signed(n: number): string {
  const v = Math.round(n);
  return v < 0 ? `−${Math.abs(v)}` : `+${v}`;
}

export function LoadBlock({ load }: { load: LoadView }) {
  if (load.days_with_load === 0) {
    return (
      <EmptyState
        title="Carga: sin entrenos con esfuerzo registrado en 90 días"
        description="sale del RPE o del pulso/ritmo de cada entreno hecho"
      />
    );
  }
  // Sin 42 días de historia el fitness (CTL) sale bajo por construcción y lo
  // que cuelga de él (TSB, ACWR, la curva) exagera: no se pinta. La fatiga de
  // 7 días sí dice algo en cuanto hay una semana.
  if (!load.history.enough) {
    return (
      <Card>
        <CardHeader title="Carga" subtitle={loadHistoryLine(load.history)} />
        {load.history.atl_ready ? (
          <KPIRow>
            <KPI label="Fatiga · ATL" value={Math.round(load.atl)} caption="lo que ha metido estos días (7 d)" />
          </KPIRow>
        ) : null}
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Carga" subtitle="Toda la actividad registrada, carrera y resto" />
      <KPIRow className="mb-4">
        <KPI label="Fitness · CTL" value={Math.round(load.ctl)} caption="lo que aguanta de normal (42 d)" />
        <KPI label="Fatiga · ATL" value={Math.round(load.atl)} caption="lo que ha metido estos días (7 d)" />
        <KPI label="Forma · TSB" value={signed(load.tsb)} caption="fitness − fatiga; negativo = cargado" />
        <KPI
          label="ACWR"
          value={load.acr != null ? load.acr.toFixed(2).replace('.', ',') : null}
          caption={load.acr != null ? 'fatiga ÷ fitness; > 1 = sube más de lo habitual' : 'sin fitness de base todavía'}
        />
      </KPIRow>
      <PmcChart load={load} />
      {load.coverage_note ? <p className="mt-3 t-meta text-v2-faint">{load.coverage_note}</p> : null}
    </Card>
  );
}
