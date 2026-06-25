// ReadinessRing — banded SVG arc that encodes a 0–100 readiness score by the
// single-source-of-truth buckets (ok ≥67 green · caution 45–66 amber · low <45
// red — readiness.ts). NEVER orange (SPEC §6/§9: orange = brand only). Centered
// integer + tracked "READINESS" micro-label. null score → dashed track + "–" +
// "sin datos". `role="img"` + aria-label carry the value AND the bucket so the
// glyph is never color-only (WCAG 1.4.1).

import {
  type ReadinessBucket,
  readinessBucket,
} from '@/lib/dashboard/constants/readiness';
import { cn } from '@/lib/utils';

export type ReadinessRingSize = 'sm' | 'md' | 'lg';

export interface ReadinessRingProps {
  /** 0–100 readiness score; null/undefined renders the "sin datos" state. */
  score: number | null | undefined;
  size?: ReadinessRingSize;
  /** Hide the "READINESS" micro-label (sm in dense rows). Default: shown on lg only. */
  showLabel?: boolean;
  className?: string;
}

interface RingGeometry {
  /** Outer box in px. */
  box: number;
  /** Stroke width in px. */
  stroke: number;
  /** Centered value font-size in px. */
  value: number;
}

const GEOMETRY: Record<ReadinessRingSize, RingGeometry> = {
  sm: { box: 24, stroke: 3, value: 9 },
  md: { box: 40, stroke: 4, value: 14 },
  lg: { box: 96, stroke: 7, value: 34 },
};

const BUCKET_TOKEN: Record<ReadinessBucket, string> = {
  ok: 'var(--ok)',
  caution: 'var(--warning)',
  low: 'var(--danger)',
};

const BUCKET_LABEL: Record<ReadinessBucket, string> = {
  ok: 'listo',
  caution: 'con cautela',
  low: 'en rojo',
};

export function ReadinessRing({
  score,
  size = 'md',
  showLabel,
  className,
}: ReadinessRingProps) {
  const { box, stroke, value } = GEOMETRY[size];
  const labelVisible = showLabel ?? size === 'lg';

  const radius = (box - stroke) / 2;
  const cx = box / 2;
  const cy = box / 2;
  const circumference = 2 * Math.PI * radius;

  const hasScore = score != null && Number.isFinite(score);
  const clamped = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  const bucket = hasScore ? readinessBucket(clamped) : null;
  const arcColor = bucket ? BUCKET_TOKEN[bucket] : 'var(--border-subtle)';

  // Progress arc starts at 12 o'clock and sweeps clockwise.
  const dashOffset = circumference * (1 - clamped / 100);

  const ariaLabel = hasScore
    ? `Readiness ${clamped} de 100, ${BUCKET_LABEL[bucket!]}`
    : 'Readiness sin datos';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-col items-center justify-center gap-1', className)}
    >
      <span className="relative inline-flex shrink-0" style={{ width: box, height: box }}>
        <svg
          width={box}
          height={box}
          viewBox={`0 0 ${box} ${box}`}
          className="-rotate-90"
          aria-hidden
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={stroke}
            strokeDasharray={hasScore ? undefined : `${Math.max(2, stroke)} ${stroke * 1.6}`}
          />
          {/* Banded progress arc — colored by bucket, never orange. */}
          {hasScore ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={arcColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
            />
          ) : null}
        </svg>
        <span
          aria-hidden
          className="metric-num absolute inset-0 flex items-center justify-center font-semibold leading-none"
          style={{ fontSize: value, color: hasScore ? arcColor : 'var(--text-muted)' }}
        >
          {hasScore ? clamped : '–'}
        </span>
      </span>
      {labelVisible ? (
        <span className="micro-label leading-none">{hasScore ? 'Readiness' : 'Sin datos'}</span>
      ) : null}
    </div>
  );
}
