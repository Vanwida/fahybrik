'use client';

// Small presentational primitives shared across the Rendimiento sub-panels:
// a headline stat tile, a guarded trend sparkline, a toned chip, and an inline
// "sin datos" row. All read v2 tokens only (light/dark aware).

import { MIcon } from '@/components/ui/MIcon';
import { Sparkline } from '../parts';
import { finiteCount, trendStrokeVar } from './format';

export type Tone = 'fg' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export const TONE_VAR: Record<Tone, string> = {
  fg: '--v2-fg',
  ok: '--v2-ok',
  warn: '--v2-warn',
  danger: '--v2-danger',
  info: '--v2-info',
  accent: '--v2-accent',
};

export const TONE_SOFT_VAR: Record<Tone, string> = {
  fg: '--v2-surface-2',
  ok: '--v2-ok-soft',
  warn: '--v2-warn-soft',
  danger: '--v2-danger-soft',
  info: '--v2-info-soft',
  accent: '--v2-accent-soft',
};

/**
 * Colour of a 0…100 disposition index. Lives here because the headline tile and
 * the panel underneath it show the SAME number: two copies of the thresholds
 * meant the tile could go amber while the panel stayed green.
 */
export function readinessTone(score: number): Tone {
  if (score >= 65) return 'ok';
  if (score >= 45) return 'warn';
  return 'danger';
}

/** Headline stat tile — big display number + unit + micro label (BioTile twin). */
export function PerfTile({
  label,
  value,
  unit,
  tone = 'fg',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 shadow-[var(--v2-shadow-card)]">
      <div className="flex items-baseline gap-1">
        <span className="v2-display text-2xl tabular-nums" style={{ color: `var(${TONE_VAR[tone]})` }}>
          {value}
        </span>
        {unit ? <span className="v2-num text-xs text-[color:var(--v2-faint)]">{unit}</span> : null}
      </div>
      <span className="v2-micro mt-1 block">{label}</span>
    </div>
  );
}

/** A guarded metric sparkline: draws only with ≥2 finite points, colouring the
 *  line by end-to-end improvement (green/warn/faint via trendStrokeVar). Below the
 *  Sparkline's ≥2 threshold it shows an honest "sin datos" strip instead. */
export function MiniTrend({
  values,
  lowerIsBetter,
  height = 40,
}: {
  values: ReadonlyArray<number | null>;
  lowerIsBetter: boolean;
  height?: number;
}) {
  if (finiteCount(values) < 2) {
    return (
      <div
        className="flex items-center text-label text-[color:var(--v2-faint)]"
        style={{ height }}
      >
        Sin serie suficiente
      </div>
    );
  }
  return <Sparkline values={values} strokeVar={trendStrokeVar(values, lowerIsBetter)} height={height} />;
}

/** A small toned chip: label + value (e.g. "Readiness 38 ▼"). */
export function Chip({ label, value, tone }: { label: string; value?: string; tone: Tone }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] px-2.5 py-1 text-label font-semibold"
      style={{ background: `var(${TONE_SOFT_VAR[tone]})`, color: `var(${TONE_VAR[tone]})` }}
    >
      <span>{label}</span>
      {value ? <span className="v2-num opacity-90">{value}</span> : null}
    </span>
  );
}

/** Inline honest empty row inside a panel body. */
export function SinDatos({ text = 'Sin datos todavía' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-[color:var(--v2-faint)]">
      <MIcon name="show_chart" size={16} />
      {text}
    </div>
  );
}
