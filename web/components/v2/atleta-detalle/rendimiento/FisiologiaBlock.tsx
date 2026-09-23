'use client';

// Fisiología: VFC y pulso en reposo frente a SU base, sueño, VO₂ y los check-ins
// (agujetas, ánimo, motivación, fatiga, calidad de sueño). Sin datos: una línea
// que dice de dónde llegan (reloj conectado o check-ins), sin marcas de terceros.
// El readiness es EL MISMO que la columna Estado del Plan (el del estado del
// atleta, `shell.readiness`): una sola fuente, así que nunca «sin datos» aquí
// mientras el Plan enseña un número.

import { EmptyState, List, ListRow, Sparkline } from '@/components/v2/ui';
import type { BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import { formatHours } from '@/lib/dashboard/v2/ficha-format';
import { ReadinessMini, type ReadinessMiniValue } from '@/components/v2/shared/ReadinessMini';

const TREND_ES = { up: 'subiendo', down: 'bajando', flat: 'estable' } as const;

function vs(value: number | null, base: number | null, unit: string): string | null {
  if (value == null || base == null) return null;
  const d = Math.round(value - base);
  if (d === 0) return 'igual que su base';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} ${unit} vs su base ${Math.round(base)}`;
}

export function FisiologiaBlock({
  body,
  readiness,
  today,
}: {
  body: BodyPayload;
  readiness: ReadinessMiniValue | null;
  today: string;
}) {
  if (!body.has_any_data && !readiness) {
    return (
      <EmptyState
        title="Sin datos de salud todavía"
        description="llegan al conectar su reloj o con sus check-ins diarios"
      />
    );
  }
  const hrv = body.hrv;
  const rhr = body.rhr;
  const rows: React.ReactNode[] = [];

  if (readiness) {
    rows.push(
      <ListRow
        key="readiness"
        density="compact"
        title="Readiness"
        detail="frente a su base de 28 días"
        trailing={<ReadinessMini readiness={readiness} today={today} />}
      />,
    );
  }

  if (hrv.last_value_ms != null) {
    rows.push(
      <ListRow
        key="hrv"
        density="compact"
        title="VFC (HRV)"
        detail={vs(hrv.last_value_ms, hrv.current_baseline_ms, 'ms') ?? 'sin base todavía'}
        trailing={
          <span className="flex items-center gap-3">
            <Sparkline values={hrv.daily.map((p) => p.value)} width={80} height={20} aria-label="VFC por día" />
            <span className="w-16 text-right t-body font-semibold text-v2-fg t-tnum">{Math.round(hrv.last_value_ms)} ms</span>
          </span>
        }
      />,
    );
  }
  if (rhr.last_bpm != null) {
    rows.push(
      <ListRow
        key="rhr"
        density="compact"
        title="Pulso en reposo"
        detail={vs(rhr.last_bpm, rhr.baseline_30d, 'ppm') ?? 'sin base todavía'}
        trailing={
          <span className="flex items-center gap-3">
            <Sparkline values={rhr.daily.map((p) => p.value)} width={80} height={20} aria-label="Pulso en reposo por día" />
            <span className="w-16 text-right t-body font-semibold text-v2-fg t-tnum">{Math.round(rhr.last_bpm)} ppm</span>
          </span>
        }
      />,
    );
  }
  if (body.sleep.avg_total_hours != null) {
    rows.push(
      <ListRow
        key="sleep"
        density="compact"
        title="Sueño"
        detail={body.sleep.avg_efficiency_pct != null ? `eficiencia ${Math.round(body.sleep.avg_efficiency_pct)} %` : 'media de sus noches registradas'}
        trailing={<span className="t-body font-semibold text-v2-fg t-tnum">{formatHours(body.sleep.avg_total_hours)}</span>}
      />,
    );
  }
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

  const missing = [
    hrv.last_value_ms == null ? 'VFC' : null,
    rhr.last_bpm == null ? 'pulso en reposo' : null,
    body.sleep.avg_total_hours == null ? 'sueño' : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 ? <List aria-label="Fisiología">{rows}</List> : null}
      {missing.length > 0 ? (
        <EmptyState title={`Falta: ${missing.join(', ')}`} description="llega al conectar su reloj" />
      ) : null}
    </div>
  );
}
