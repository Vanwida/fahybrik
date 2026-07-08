'use client';

// Rendimiento · physiology panels — the four monthly/daily physiological series of
// the deep dive: running economy (Z2 pace), lactate threshold (HR + pace),
// anaerobic capacity (3-min power, with the still-null critical power / W′), and
// the HYROX time prediction (null for real athletes today → honest null-guard).

import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, Sparkline } from '../parts';
import { MiniTrend, PerfTile, SinDatos } from './ui';
import { EM_DASH, fmtClock, fmtInt, fmtPace, lastNonNull, finiteCount } from './format';
import type {
  AnaerobicPoint,
  HyroxPrediction,
  LtPoint,
  RunningEconomyPoint,
} from '@/lib/dashboard/coach/deep-dive-performance';

// ── 4 · ECONOMÍA DE CARRERA ─────────────────────────────────────────────────────

export function RunningEconomyPanel({ series }: { series: RunningEconomyPoint[] }) {
  const paces = series.map((p) => p.pace_at_145bpm_sec_per_km);
  const latest = lastNonNull(paces);
  return (
    <Panel title="Economía de carrera · ritmo en Z2">
      {latest == null ? (
        <SinDatos text="Sin rodajes en Z2 (≈145 ppm) para estimar la economía." />
      ) : (
        <div className="flex items-end gap-4">
          <div className="flex flex-col">
            <span className="v2-display text-2xl tabular-nums text-[color:var(--v2-fg)]">
              {fmtPace(latest)}
            </span>
            <span className="v2-micro mt-1 block">Ritmo actual a 145 ppm</span>
          </div>
          <div className="min-w-0 flex-1">
            {/* Menos s/km a la misma FC = mejor economía → mejora a la BAJA. */}
            <MiniTrend values={paces} lowerIsBetter height={44} />
          </div>
        </div>
      )}
    </Panel>
  );
}

// ── 5 · UMBRAL DE LACTATO ────────────────────────────────────────────────────────

export function LtPanel({ series }: { series: LtPoint[] }) {
  const hr = series.map((p) => p.lt_hr_bpm);
  const pace = series.map((p) => p.lt_pace_sec_per_km);
  const latestHr = lastNonNull(hr);
  const latestPace = lastNonNull(pace);
  const empty = latestHr == null && latestPace == null;

  return (
    <Panel title="Umbral de lactato · 12 meses">
      {empty ? (
        <SinDatos text="Sin sesiones de umbral registradas todavía." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <PerfTile label="FC de umbral" value={fmtInt(latestHr)} unit="ppm" tone="info" />
            <PerfTile label="Ritmo de umbral" value={fmtPace(latestPace)} tone="fg" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TrendCell label="FC de umbral">
              {finiteCount(hr) >= 2 ? (
                <Sparkline values={hr} strokeVar="--v2-info" height={40} />
              ) : (
                <SinDatos text="Sin serie suficiente." />
              )}
            </TrendCell>
            <TrendCell label="Ritmo de umbral">
              {/* Ritmo más rápido = umbral más alto → mejora a la BAJA. */}
              <MiniTrend values={pace} lowerIsBetter height={40} />
            </TrendCell>
          </div>
        </div>
      )}
    </Panel>
  );
}

function TrendCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5">
      <span className="v2-micro">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── 6 · CAPACIDAD ANAERÓBICA ─────────────────────────────────────────────────────

export function AnaerobicPanel({ series }: { series: AnaerobicPoint[] }) {
  const power = series.map((p) => p.best_3min_avg_w);
  const latest = lastNonNull(power);
  // Critical power / W′ aún no se calculan (null en todas las filas): honestos.
  const hasCp = series.some((p) => p.critical_power_w != null);
  const hasWprime = series.some((p) => p.w_prime_kj != null);

  return (
    <Panel title="Capacidad anaeróbica · potencia 3 min">
      {latest == null ? (
        <SinDatos text="Sin test de 3 min a máximo esfuerzo registrado." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span className="v2-display text-2xl tabular-nums text-[color:var(--v2-fg)]">
                  {fmtInt(latest)}
                </span>
                <span className="v2-num text-xs text-[color:var(--v2-faint)]">W</span>
              </div>
              <span className="v2-micro mt-1 block">Mejor potencia 3 min</span>
            </div>
            <div className="min-w-0 flex-1">
              {/* Más vatios = más capacidad → mejora al ALZA. */}
              <MiniTrend values={power} lowerIsBetter={false} height={44} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--v2-border)] pt-3">
            <DerivedStat
              label="Potencia crítica"
              value={hasCp ? fmtInt(lastNonNull(series.map((p) => p.critical_power_w))) : EM_DASH}
              unit={hasCp ? 'W' : undefined}
              note={hasCp ? null : 'sin datos'}
            />
            <DerivedStat
              label="W′ (reserva)"
              value={hasWprime ? fmtInt(lastNonNull(series.map((p) => p.w_prime_kj))) : EM_DASH}
              unit={hasWprime ? 'kJ' : undefined}
              note={hasWprime ? null : 'sin datos'}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

function DerivedStat({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="v2-micro">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="v2-num text-sm font-semibold text-[color:var(--v2-muted)]">{value}</span>
        {unit ? <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">{unit}</span> : null}
      </div>
      {note ? <span className="text-[11px] text-[color:var(--v2-faint)]">{note}</span> : null}
    </div>
  );
}

// ── 7 · PREDICCIÓN HYROX ─────────────────────────────────────────────────────────

export function HyroxPredictionPanel({ prediction }: { prediction: HyroxPrediction | null }) {
  if (prediction == null) {
    return (
      <Panel title="Predicción HYROX">
        <EmptyState
          icon="query_stats"
          title="Sin datos suficientes"
          description="Cuando el atleta acumule tiempos por estación, verás aquí el tiempo total previsto y el desglose por estación."
        />
      </Panel>
    );
  }

  const goal = prediction.goal_total_seconds;
  const delta = prediction.delta_to_goal_seconds;
  return (
    <Panel title="Predicción HYROX">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <PerfTile label="Total previsto" value={fmtClock(prediction.predicted_total_seconds)} tone="accent" />
          <PerfTile label="Objetivo" value={goal != null ? fmtClock(goal) : EM_DASH} tone="fg" />
          <PerfTile
            label="Diferencia"
            value={delta != null ? fmtClock(Math.abs(delta)) : EM_DASH}
            tone={delta == null ? 'fg' : delta <= 0 ? 'ok' : 'warn'}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Por estación</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {prediction.stations.map((s) => (
              <div
                key={s.station_label}
                className="flex items-center justify-between gap-2 rounded-[var(--v2-r-xs)] bg-[color:var(--v2-surface-2)] px-2.5 py-1.5"
              >
                <span className="truncate text-[11px] text-[color:var(--v2-muted)]">{s.station_label}</span>
                <span className="v2-num shrink-0 text-[11px] font-semibold text-[color:var(--v2-fg)]">
                  {fmtClock(s.predicted_seconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
