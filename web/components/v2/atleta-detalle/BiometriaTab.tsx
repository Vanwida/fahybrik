'use client';

// BIOMETRÍA — physiological signals from the app + watch. Header (sync recency) +
// 5 StatTiles (VFC 7d · FC reposo · Sueño · Peso · Carga A:C) + a wide trend chart
// placeholder + a recent-days table (Día/VFC/FC rep/Sueño/RPE) and an alarm-state
// card. All from the real BodyPayload (HRV/RHR/sleep/composition/wellness). When
// the athlete has no synced signals, a single EmptyState replaces the grid.

import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, Sparkline } from './parts';
import type { BodyPayload, BodyPoint } from '@/lib/dashboard/coach/deep-dive-body';

// The trend chart window — last 30 days of daily readings.
const TREND_DAYS = 30;

interface TrendMetric {
  key: string;
  label: string;
  unit: string;
  /** CSS var token for the line color (light/dark aware). */
  colorVar: string;
  values: Array<number | null>;
  baseline?: Array<number | null>;
  /** Last real reading, formatted, for the row's right-aligned current value. */
  current: string | null;
}

/** Builds the 3 trend metrics from the real BodyPayload series, sliced to 30d.
 *  VFC + FC reposo come from the 90d daily series; sueño from the 30d nights. No
 *  "carga" line — there's no real training-load series, so we don't draw one. */
function buildTrendMetrics(body: BodyPayload): TrendMetric[] {
  const lastReal = (vals: Array<number | null>, fmt: (n: number) => string): string | null => {
    for (let i = vals.length - 1; i >= 0; i--) {
      const v = vals[i];
      if (v != null) return fmt(v);
    }
    return null;
  };

  const hrv = body.hrv.daily.slice(-TREND_DAYS).map((p) => p.value);
  const hrvBase = body.hrv.baseline_28d.slice(-TREND_DAYS).map((p) => p.value);
  const rhr = body.rhr.daily.slice(-TREND_DAYS).map((p) => p.value);
  const sleep = body.sleep.nights.slice(-TREND_DAYS).map((n) => n.total_hours);

  return [
    {
      key: 'hrv',
      label: 'VFC',
      unit: 'ms',
      colorVar: '--v2-info',
      values: hrv,
      baseline: hrvBase,
      current: lastReal(hrv, (n) => `${Math.round(n)}`),
    },
    {
      key: 'rhr',
      label: 'FC reposo',
      unit: 'bpm',
      colorVar: '--v2-fg',
      values: rhr,
      current: lastReal(rhr, (n) => `${Math.round(n)}`),
    },
    {
      key: 'sleep',
      label: 'Sueño',
      unit: 'h',
      colorVar: '--v2-accent',
      values: sleep,
      current: lastReal(sleep, (n) => n.toFixed(1)),
    },
  ];
}

function hasSeries(values: Array<number | null>): boolean {
  return values.some((v) => v != null);
}

/** Per-metric trend row: label + current value + the 30d sparkline (or an honest
 *  "sin datos" when that signal has no reading in the window). */
function TrendRow({ metric }: { metric: TrendMetric }) {
  const present = hasSeries(metric.values);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex w-20 shrink-0 flex-col">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{metric.label}</span>
        <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
          {present && metric.current != null ? (
            <>
              <span className="text-[color:var(--v2-muted)]">{metric.current}</span> {metric.unit}
            </>
          ) : (
            'sin datos'
          )}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {present ? (
          <Sparkline
            values={metric.values}
            baseline={metric.baseline}
            strokeVar={metric.colorVar}
            height={40}
          />
        ) : (
          <div className="flex h-10 items-center text-[11px] text-[color:var(--v2-faint)]">
            Sin lecturas en {TREND_DAYS} días
          </div>
        )}
      </div>
    </div>
  );
}

/** The 30d trend panel — real sparklines from biometric_streams, honest empty
 *  state when none of the three signals has data in the window. */
function TrendPanel({ body }: { body: BodyPayload }) {
  const metrics = buildTrendMetrics(body);
  const anyData = metrics.some((m) => hasSeries(m.values));

  return (
    <Panel title="Tendencia · últimos 30 días" bodyClassName="px-3.5 py-1">
      {anyData ? (
        <div className="divide-y divide-[color:var(--v2-border)]">
          {metrics.map((m) => (
            <TrendRow key={m.key} metric={m} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-6 text-xs text-[color:var(--v2-faint)]">
          <MIcon name="show_chart" size={16} />
          Aún no hay tendencia de 30 días — sin lecturas de VFC, FC reposo ni sueño.
        </div>
      )}
    </Panel>
  );
}

const SYNC_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

function lastNonNull(points: BodyPoint[]): BodyPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i]!.value != null) return points[i]!;
  }
  return null;
}

/** Builds the recent-days rows by zipping the daily series on iso_date. */
function recentRows(body: BodyPayload, count: number) {
  const hrv = new Map(body.hrv.daily.map((p) => [p.iso_date, p.value]));
  const rhr = new Map(body.rhr.daily.map((p) => [p.iso_date, p.value]));
  const sleep = new Map(body.sleep.nights.map((n) => [n.iso_date, n.total_hours]));

  const dates = Array.from(new Set([...hrv.keys(), ...rhr.keys(), ...sleep.keys()]))
    .sort()
    .reverse()
    .slice(0, count);

  return dates.map((iso) => ({
    iso,
    hrv: hrv.get(iso) ?? null,
    rhr: rhr.get(iso) ?? null,
    sleep: sleep.get(iso) ?? null,
  }));
}

const DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'Europe/Madrid',
});

export function BiometriaTab({ body }: { body: BodyPayload | null }) {
  if (!body || !body.has_any_data) {
    return (
      <EmptyState
        icon="monitor_heart"
        title="Sin señales biométricas todavía"
        description="Cuando el atleta sincronice su reloj o registre check-ins, sus señales de VFC, sueño y frecuencia cardíaca aparecerán aquí."
      />
    );
  }

  const vfc = body.hrv.last_value_ms;
  const rhr = body.rhr.last_bpm;
  const sleep = body.sleep.avg_total_hours;
  const weight = body.composition.current_weight_kg;
  const wakeups = body.sleep.avg_wakeups;

  const rows = recentRows(body, 7);
  const syncPoint = lastNonNull(body.hrv.daily) ?? lastNonNull(body.rhr.daily);
  const syncLabel = syncPoint ? SYNC_FMT.format(new Date(syncPoint.iso_date)) : '—';

  // Alarm heuristic from the real HRV drop count + RHR trend.
  const alarm = body.hrv.drops_count >= 2 || body.rhr.trend_30d === 'up';

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-[color:var(--v2-muted)]">
        <MIcon name="sync" size={16} className="text-[color:var(--v2-faint)]" />
        <span>
          Señales desde la app + reloj · sincronizado{' '}
          <span className="v2-num font-semibold text-[color:var(--v2-fg)]">{syncLabel}</span>
        </span>
      </div>

      {/* 5 stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BioTile label="VFC 7d" value={vfc != null ? `${Math.round(vfc)}` : '—'} unit="ms" tone="info" />
        <BioTile label="FC reposo" value={rhr != null ? `${Math.round(rhr)}` : '—'} unit="bpm" tone="fg" />
        <BioTile
          label="Sueño"
          value={sleep != null ? sleep.toFixed(1) : '—'}
          unit="h"
          tone={sleep != null && sleep < 6.5 ? 'warn' : 'fg'}
        />
        <BioTile label="Peso" value={weight != null ? weight.toFixed(1) : '—'} unit="kg" tone="fg" />
        <BioTile
          label="Despertares"
          value={wakeups != null ? `${Math.round(wakeups)}` : '—'}
          unit="/noche"
          tone="fg"
        />
      </div>

      {/* Real 30d trend — sparklines from the biometric series */}
      <TrendPanel body={body} />

      {/* Table + alarm card */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Últimos 7 días" bodyClassName="p-0 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--v2-border)]">
                <th className="v2-micro py-2 pl-3.5 text-left">Día</th>
                <th className="v2-micro py-2 px-2 text-right">VFC</th>
                <th className="v2-micro py-2 px-2 text-right">FC rep</th>
                <th className="v2-micro py-2 pr-3.5 text-right">Sueño</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.iso} className="border-b border-[color:var(--v2-border)] last:border-0">
                  <td className="py-2 pl-3.5 pr-2 text-xs font-medium capitalize text-[color:var(--v2-fg)]">
                    {DAY_FMT.format(new Date(r.iso)).replace('.', '')}
                  </td>
                  <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                    {r.hrv != null ? Math.round(r.hrv) : '—'}
                  </td>
                  <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
                    {r.rhr != null ? Math.round(r.rhr) : '—'}
                  </td>
                  <td className="v2-num py-2 pr-3.5 text-right text-xs text-[color:var(--v2-muted)]">
                    {r.sleep != null ? `${r.sleep.toFixed(1)} h` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div
          className="flex items-start gap-2.5 rounded-[var(--v2-r-l)] border p-3.5 shadow-[var(--v2-shadow-card)]"
          style={{
            borderColor: alarm ? 'var(--v2-warn)' : 'var(--v2-ok)',
            background: alarm ? 'var(--v2-warn-soft)' : 'var(--v2-ok-soft)',
          }}
        >
          <MIcon
            name={alarm ? 'warning' : 'check_circle'}
            size={20}
            filled
            className={alarm ? 'mt-0.5 text-[color:var(--v2-warn)]' : 'mt-0.5 text-[color:var(--v2-ok)]'}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
              {alarm ? 'Señales a vigilar' : 'Sin señales de alarma'}
            </span>
            <span className="text-xs leading-relaxed text-[color:var(--v2-muted)]">
              {alarm
                ? `${body.hrv.drops_count} caída(s) de VFC bajo línea base${
                    body.rhr.trend_30d === 'up' ? ' · FC reposo al alza' : ''
                  }. Considera ajustar la carga.`
                : 'VFC, FC reposo y sueño dentro de rango. El atleta tolera bien la carga actual.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const TONE_VAR: Record<'fg' | 'ok' | 'warn' | 'danger' | 'info', string> = {
  fg: '--v2-fg',
  ok: '--v2-ok',
  warn: '--v2-warn',
  danger: '--v2-danger',
  info: '--v2-info',
};

function BioTile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: 'fg' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 shadow-[var(--v2-shadow-card)]">
      <div className="flex items-baseline gap-1">
        <span
          className="v2-display text-2xl tabular-nums"
          style={{ color: `var(${TONE_VAR[tone]})` }}
        >
          {value}
        </span>
        <span className="v2-num text-xs text-[color:var(--v2-faint)]">{unit}</span>
      </div>
      <span className="v2-micro mt-1 block">{label}</span>
    </div>
  );
}
