// The 8-week trend column (#20): one dependency-free sparkline per top-funnel
// metric (onboardings completados / citas reservadas / altas). Reuses the shared
// Sparkline (components/v2/atleta-detalle/parts) — NO chart library. The trend
// chip compares the last week to the previous one.

import { Panel, Sparkline } from '@/components/v2/atleta-detalle/parts';
import { Pill, EmptyState } from '@/components/v2';
import type { WeeklySeries } from '@/lib/dashboard/coach/metrics';
import { formatCount, formatDelta, DELTA_COLOR_VAR, DELTA_ARROW } from './format';

function MetricRow({
  label,
  values,
  strokeVar,
}: {
  label: string;
  values: number[];
  strokeVar: string;
}) {
  const now = values.length ? values[values.length - 1] : 0;
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const delta = formatDelta(prev > 0 ? (now - prev) / prev : null);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold text-[color:var(--v2-fg)]">{label}</span>
          <span className="text-[10.5px] text-[color:var(--v2-faint)]">semana a semana</span>
        </div>
        <div className="text-right leading-tight">
          <span className="v2-num block text-[20px] font-extrabold text-[color:var(--v2-fg)]">
            {formatCount(now)}
          </span>
          {delta ? (
            <span
              className="v2-num text-[10.5px] font-bold"
              style={{ color: DELTA_COLOR_VAR[delta.dir] }}
            >
              {DELTA_ARROW[delta.dir]} {delta.pct}
            </span>
          ) : null}
        </div>
      </div>
      <Sparkline values={values} strokeVar={strokeVar} height={38} />
    </div>
  );
}

export function TrendPanel({ weekly }: { weekly: WeeklySeries }) {
  const hasData = weekly.some((p) => p.onboardings + p.citas + p.altas > 0);

  return (
    <Panel title="Tendencia · 8 semanas" action={<Pill tone="info">semanal</Pill>}>
      {hasData ? (
        <div className="flex flex-col gap-4">
          <MetricRow
            label="Onboardings completados"
            values={weekly.map((p) => p.onboardings)}
            strokeVar="--v2-accent"
          />
          <MetricRow
            label="Citas reservadas"
            values={weekly.map((p) => p.citas)}
            strokeVar="--v2-info"
          />
          <MetricRow label="Altas" values={weekly.map((p) => p.altas)} strokeVar="--v2-ok" />
        </div>
      ) : (
        <EmptyState
          icon="show_chart"
          title="Sin datos todavía"
          description="La tendencia se dibuja cuando haya onboardings, citas o altas en las últimas 8 semanas."
        />
      )}
    </Panel>
  );
}
