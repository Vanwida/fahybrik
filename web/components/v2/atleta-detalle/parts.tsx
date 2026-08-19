'use client';

// Shared presentational parts for the athlete-detalle sub-tabs. Small, themed,
// reused across Perfil/Plan/Histórico/Biometría so each tab file stays focused
// and under the 500-line budget. All read v2 tokens only.

import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/card';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import { modalityColor } from './modality';
import { cn } from '@/lib/utils';

/** Tracked uppercase section label with an optional right-aligned action slot. */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <h3 className="v2-micro">{children}</h3>
      {action ?? null}
    </div>
  );
}

/** A labelled panel: section heading + a card body. The workhorse layout unit. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <SectionHeading action={action}>{title}</SectionHeading>
      <Card variant="panel" className={cn('p-3.5', bodyClassName)}>
        {children}
      </Card>
    </section>
  );
}

/**
 * Sparkline — a dependency-free SVG trend line for a single biometric metric.
 * Inputs are the raw daily values (nulls = no reading that day); the line BREAKS
 * across gaps rather than interpolating, so a missing day never draws a fake
 * segment. The y-axis auto-scales to the series' own min/max (a relative trend,
 * not an absolute zero-based axis), x spans the window evenly. An optional
 * `baseline` series (e.g. the rolling HRV baseline) is overlaid dashed + faint.
 *
 * Responsive: a normalized 0–100 × `height` viewBox stretched to the container
 * with non-scaling strokes, so the line stays crisp at any width. Color comes
 * from a CSS var, so it adapts to light/dark automatically.
 */
export function Sparkline({
  values,
  baseline,
  height = 44,
  strokeVar = '--v2-accent',
  className,
}: {
  values: ReadonlyArray<number | null>;
  baseline?: ReadonlyArray<number | null>;
  height?: number;
  /** CSS custom property name used for the line stroke (token, light/dark aware). */
  strokeVar?: string;
  className?: string;
}) {
  const PAD = 4; // vertical breathing room so peaks/troughs aren't clipped
  const W = 100; // normalized x-domain (stretched to container width)
  const n = values.length;

  // Scale across both the series and its baseline so the overlay shares the axis.
  const finite = (arr: ReadonlyArray<number | null> | undefined) =>
    (arr ?? []).filter((v): v is number => v != null);
  const pool = [...finite(values), ...finite(baseline)];
  if (pool.length === 0 || n < 2) return null;

  let min = Math.min(...pool);
  let max = Math.max(...pool);
  if (min === max) {
    // Flat series — center the line instead of dividing by zero.
    min -= 1;
    max += 1;
  }
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => height - PAD - ((v - min) / (max - min)) * (height - PAD * 2);

  // Build a path that lifts the pen across null gaps (M after each gap, L within).
  const toPath = (arr: ReadonlyArray<number | null>) => {
    let d = '';
    let pen = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)} `;
      pen = true;
    }
    return d.trim();
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden
    >
      {baseline ? (
        <path
          d={toPath(baseline)}
          fill="none"
          stroke="var(--v2-faint)"
          strokeWidth={1}
          strokeDasharray="3 3"
          strokeOpacity={0.7}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        d={toPath(values)}
        fill="none"
        stroke={`var(${strokeVar})`}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Dashed "add / program" button row — the recurring affordance across tabs. */
export function DashedAction({
  icon,
  label,
  onClick,
  className,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'v2-focus flex w-full items-center justify-center gap-2 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors',
        'hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
        className,
      )}
    >
      <MIcon name={icon} size={16} />
      {label}
    </button>
  );
}

/** A small colored dot for the training-modality axis (label-paired by caller). */
export function ModalityDot({ modality, size = 8 }: { modality: V2Modality; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `var(${MODALITY_META[modality].colorVar})`,
      }}
    />
  );
}

/** 7-day week strip: each cell tinted by that day's modality (rest = dashed),
 *  shows the day's session FOCUS/title, and (when `href` is set) is a link into
 *  that day's editor. Used by the Plan "esta semana" row. */
export interface WeekStripDay {
  label: string;
  /** Color del día. null = hay sesión pero ningún color la representa (mixta):
   *  se pinta neutra, NUNCA como descanso — quien manda sobre eso es `state`. */
  modality: V2Modality | null;
  state: 'done' | 'today' | 'scheduled' | 'rest';
  /** Session focus/title shown under the indicator (null on rest days). */
  title?: string | null;
  /** Day editor link — when set the cell is clickable (null = not interactive). */
  href?: string | null;
}

export function WeekStrip({ days }: { days: WeekStripDay[] }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d, i) => {
        const isRest = d.state === 'rest';
        const color = modalityColor(d.modality);
        const interactive = !!d.href;
        const cellClass = cn(
          'flex min-w-0 flex-col items-center gap-1 rounded-[var(--v2-r-s)] border px-1 py-1.5 text-center',
          isRest
            ? 'border-dashed border-[color:var(--v2-border)]'
            : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
          d.state === 'today' && 'ring-1 ring-[color:var(--v2-accent)]',
          interactive &&
            'v2-focus cursor-pointer transition-colors hover:border-[color:var(--v2-border-strong)]',
        );
        const cellStyle = !isRest ? { borderLeft: `2px solid ${color}` } : undefined;
        const inner = (
          <>
            <span className="v2-micro text-nano">{d.label}</span>
            {d.state === 'done' ? (
              <MIcon name="check" size={13} className="text-[color:var(--v2-ok)]" />
            ) : d.state === 'today' ? (
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--v2-accent)' }} />
            ) : isRest ? (
              <span className="text-eyebrow text-[color:var(--v2-faint)]">·</span>
            ) : (
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            )}
            {d.title ? (
              <span className="w-full truncate text-nano leading-tight text-[color:var(--v2-muted)]">
                {d.title}
              </span>
            ) : null}
          </>
        );
        const key = `${d.label}-${i}`;
        return d.href ? (
          <Link key={key} href={d.href} className={cellClass} style={cellStyle} title={d.title ?? d.label}>
            {inner}
          </Link>
        ) : (
          <div key={key} className={cellClass} style={cellStyle} title={d.title ?? d.label}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** Relative date label "hace N d/sem/meses" from an ISO date string. */
export function relativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 14) return `hace ${days} d`;
  if (days < 60) return `hace ${Math.round(days / 7)} sem`;
  return `hace ${Math.round(days / 30)} meses`;
}
