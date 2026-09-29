'use client';

// Check-ins (agujetas, ánimo, motivación, fatiga, calidad de sueño) y VO₂ del
// reloj. La variabilidad, el pulso en reposo y el sueño frente a SU base los
// sirve «Recuperación» del panel con UNA basal (P3 del modelo), y la disposición
// de hoy está en su cabecera: aquí no se repiten. Sin datos: una línea que dice
// de dónde llegan (reloj conectado o check-ins), sin marcas de terceros.

import { EmptyState, List, ListRow, Sparkline } from '@/components/v2/ui';
import type { BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';

const TREND_ES = { up: 'subiendo', down: 'bajando', flat: 'estable' } as const;

export function FisiologiaBlock({ body }: { body: BodyPayload }) {
  if (!body.has_any_data) {
    return (
      <EmptyState
        title="Sin datos de salud todavía"
        description="llegan al conectar su reloj o con sus check-ins diarios"
      />
    );
  }
  const rows: React.ReactNode[] = [];

  if (body.vo2max.current_value != null) {
    rows.push(
      <ListRow
        key="vo2"
        density="compact"
        title="VO₂ máx estimado"
        detail="lo estima su reloj"
        trailing={<span className="t-body font-semibold text-v2-fg t-tnum">{Math.round(body.vo2max.current_value)}</span>}
      />,
    );
  }
  for (const m of body.wellness.metrics) {
    if (m.avg == null) continue;
    rows.push(
      <ListRow
        key={m.key}
        density="compact"
        title={m.label}
        detail={`check-ins · ${m.trend ? TREND_ES[m.trend] : 'sin tendencia'}`}
        trailing={
          <span className="flex items-center gap-3">
            {m.series.filter((p) => p.value != null).length >= 2 ? (
              <Sparkline values={m.series.map((p) => p.value)} width={80} height={20} aria-label={`${m.label} por día`} />
            ) : null}
            <span className="w-16 text-right t-body font-semibold text-v2-fg t-tnum">{m.avg.toFixed(1).replace('.', ',')} / 5</span>
          </span>
        }
      />,
    );
  }

  if (rows.length === 0) {
    return <EmptyState title="Sin check-ins ni VO₂ todavía" description="llegan con sus check-ins diarios y su reloj" />;
  }

  return <List aria-label="Check-ins y VO₂">{rows}</List>;
}
