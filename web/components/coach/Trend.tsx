'use client';

// Compact trend primitives for the deep-dive Resumen tab. Sparkline + bars +
// dotted compliance row. SVG only — no external charting lib so the bundle
// stays minimal and the dark/orange brand is faithful.

import type { CompliancePoint, SparkPoint, CtlAtlPoint } from '@/lib/coach/deep-dive-types';

const SPARK_W = 240;
const SPARK_H = 32;

interface SparklineProps {
  points: ReadonlyArray<SparkPoint>;
  baseline?: number | null;
  color?: string;
  fill?: string;
  ariaLabel: string;
}

export function Sparkline({ points, baseline, color = 'var(--muted)', fill, ariaLabel }: SparklineProps) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length < 2) {
    return <SparklineEmpty ariaLabel={ariaLabel} />;
  }
  const min = Math.min(...values, baseline ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...values, baseline ?? Number.NEGATIVE_INFINITY);
  const range = max - min || 1;
  const stepX = SPARK_W / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = p.value == null ? null : SPARK_H - ((p.value - min) / range) * (SPARK_H - 4) - 2;
      return y == null ? null : `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .filter((s): s is string => s != null)
    .join(' ');

  const fillPath = fill
    ? `${path} L ${SPARK_W} ${SPARK_H} L 0 ${SPARK_H} Z`
    : null;

  const baselineY = baseline == null
    ? null
    : SPARK_H - ((baseline - min) / range) * (SPARK_H - 4) - 2;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block h-8 w-full"
    >
      {fillPath ? <path d={fillPath} fill={fill} opacity={0.18} /> : null}
      {baselineY != null ? (
        <line
          x1={0} y1={baselineY} x2={SPARK_W} y2={baselineY}
          stroke="var(--hairline)" strokeWidth={1} strokeDasharray="2 2"
        />
      ) : null}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SparklineEmpty({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div
      role="img"
      aria-label={`${ariaLabel} (sin datos)`}
      className="flex h-8 w-full items-center justify-center text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]/60"
    >
      sin datos
    </div>
  );
}

interface CtlAtlChartProps {
  points: ReadonlyArray<CtlAtlPoint>;
}

export function CtlAtlChart({ points }: CtlAtlChartProps) {
  if (points.length < 2) return <SparklineEmpty ariaLabel="CTL/ATL/TSB" />;
  const all = points.flatMap((p) => [p.ctl, p.atl, p.tsb]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const stepX = SPARK_W / (points.length - 1);
  const path = (key: 'ctl' | 'atl' | 'tsb') => points
    .map((p, i) => {
      const x = i * stepX;
      const y = SPARK_H - ((p[key] - min) / range) * (SPARK_H - 4) - 2;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  const zeroY = SPARK_H - ((0 - min) / range) * (SPARK_H - 4) - 2;
  return (
    <svg
      role="img"
      aria-label="CTL ATL TSB últimos 30 días"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block h-8 w-full"
    >
      {min < 0 && max > 0 ? (
        <line x1={0} y1={zeroY} x2={SPARK_W} y2={zeroY}
              stroke="var(--hairline)" strokeWidth={1} strokeDasharray="2 2" />
      ) : null}
      <path d={path('ctl')} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <path d={path('atl')} fill="none" stroke="var(--warning)" strokeWidth={1.25} opacity={0.85} />
      <path d={path('tsb')} fill="none" stroke="var(--muted)" strokeWidth={1.25} strokeDasharray="3 2" />
    </svg>
  );
}

interface ComplianceStripProps {
  points: ReadonlyArray<CompliancePoint>;
}

export function ComplianceStrip({ points }: ComplianceStripProps) {
  if (points.length === 0) return <SparklineEmpty ariaLabel="Compliance 30d" />;
  return (
    <div
      role="img"
      aria-label={`Compliance ${points.length} días`}
      className="flex h-8 items-center gap-[2px]"
    >
      {points.map((p) => {
        const color =
          p.state === 'completed' ? 'bg-[color:var(--ok)]' :
          p.state === 'missed'    ? 'bg-[color:var(--danger)]' :
          p.state === 'future'    ? 'bg-[color:var(--hairline)]' :
                                    'bg-[color:var(--surface-elevated)]';
        const title =
          p.state === 'completed' ? `${p.iso_date} · completado` :
          p.state === 'missed'    ? `${p.iso_date} · perdida` :
          p.state === 'future'    ? `${p.iso_date} · programada` :
                                    `${p.iso_date} · descanso`;
        return (
          <span
            key={p.iso_date}
            title={title}
            className={`inline-block h-3 w-1.5 rounded-[1px] ${color}`}
          />
        );
      })}
    </div>
  );
}

interface SleepBarsProps {
  points: ReadonlyArray<SparkPoint>;
}

export function SleepBars({ points }: SleepBarsProps) {
  if (points.length === 0) return <SparklineEmpty ariaLabel="Sleep 30d" />;
  const values = points.map((p) => p.value ?? 0);
  const max = Math.max(...values, 9);
  return (
    <div role="img" aria-label="Sleep últimos 30 días" className="flex h-8 items-end gap-[2px]">
      {points.map((p) => {
        const v = p.value ?? 0;
        const h = max > 0 ? Math.max(2, Math.round((v / max) * 32)) : 2;
        const color = v >= 7 ? 'bg-[color:var(--z3)]' : v >= 6 ? 'bg-[color:var(--z4)]' : 'bg-[color:var(--z5)]';
        return (
          <span
            key={p.iso_date}
            title={`${p.iso_date} · ${v.toFixed(1)}h`}
            className={`inline-block w-1.5 rounded-[1px] ${color}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

interface ZoneTimeBarProps {
  z2: number; z3: number; z4: number; z5: number;
}

export function ZoneTimeBar({ z2, z3, z4, z5 }: ZoneTimeBarProps) {
  const total = z2 + z3 + z4 + z5;
  if (total === 0) return <SparklineEmpty ariaLabel="Zone time" />;
  return (
    <div
      role="img"
      aria-label={`Zone time Z2 ${z2}% Z3 ${z3}% Z4 ${z4}% Z5 ${z5}%`}
      className="flex h-3 overflow-hidden rounded-[2px]"
    >
      <span className="bg-[color:var(--z2)]" style={{ width: `${z2}%` }} title={`Z2 ${z2}%`} />
      <span className="bg-[color:var(--z3)]" style={{ width: `${z3}%` }} title={`Z3 ${z3}%`} />
      <span className="bg-[color:var(--z4)]" style={{ width: `${z4}%` }} title={`Z4 ${z4}%`} />
      <span className="bg-[color:var(--z5)]" style={{ width: `${z5}%` }} title={`Z5 ${z5}%`} />
    </div>
  );
}
