'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiDelta {
  /** Texto ya formateado: «+4», «−12 %», «3 d». */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /** ¿Es bueno? true = verde, false = rojo, undefined = neutro (no se juzga). */
  good?: boolean;
}

/**
 * Cifra con etiqueta — el número es el héroe. Etiqueta 11 px en mayúsculas
 * arriba, valor 28 px tabular (40 px con `size="xl"`, una por pantalla como
 * mucho), delta al lado y una línea de contexto debajo. Valor desconocido =
 * «—» y el `caption` explica por qué (nunca un 0 inventado).
 */
export function KPI({
  label,
  value,
  unit,
  delta,
  caption,
  size = 'l',
  className,
}: {
  label: ReactNode;
  value: ReactNode | null;
  unit?: ReactNode;
  delta?: KpiDelta;
  caption?: ReactNode;
  size?: 'l' | 'xl';
  className?: string;
}) {
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="t-label text-v2-faint">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={cn(size === 'xl' ? 't-num-xl' : 't-num-l', value == null ? 'text-v2-faint' : 'text-v2-fg')}>
          {value ?? '—'}
        </span>
        {unit && value != null ? <span className="t-body-sm text-v2-muted">{unit}</span> : null}
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 t-meta t-tnum',
              delta.good === true ? 'text-v2-ok' : delta.good === false ? 'text-v2-danger' : 'text-v2-muted',
            )}
          >
            <DeltaIcon aria-hidden className="size-3.5" strokeWidth={2} />
            {delta.value}
          </span>
        ) : null}
      </div>
      {caption ? <div className="t-meta text-v2-faint">{caption}</div> : null}
    </div>
  );
}

/** Fila de KPIs separada por filetes (una sola superficie, no N tarjetas). */
export function KPIRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-v2-border bg-v2-border sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]',
        '[&>*]:bg-v2-surface [&>*]:px-4 [&>*]:py-3.5',
        // Móvil (2 columnas) con un número impar: el último ocupa la fila entera en
        // vez de dejar un hueco del color del filete.
        '[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sparkline: tendencia en 24 px, trazo 1,5, último punto marcado. `band` =
 * su rango normal (p. ej. la base de 28 días) como franja gris. Los huecos
 * (null) cortan la línea: no se inventa un dato. Pasando el ratón se ve cada
 * valor con su etiqueta.
 */
export function Sparkline({
  values,
  labels,
  width = 72,
  height = 24,
  band,
  endTone = 'neutral',
  format = (v) => String(Math.round(v)),
  'aria-label': ariaLabel,
  className,
}: {
  values: (number | null)[];
  /** Una etiqueta por punto (fechas) para el tooltip. */
  labels?: string[];
  width?: number;
  height?: number;
  band?: { low: number; high: number } | null;
  endTone?: 'neutral' | 'danger' | 'warn' | 'ok';
  format?: (v: number) => string;
  'aria-label': string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) {
    return <span className={cn('t-meta text-v2-faint', className)}>sin datos</span>;
  }
  const lo = Math.min(...nums, band?.low ?? Infinity);
  const hi = Math.max(...nums, band?.high ?? -Infinity);
  const pad = 3;
  const span = hi - lo || 1;
  const x = (i: number) => (values.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (values.length - 1));
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  // Tramos continuos: un null parte la línea.
  const segments: string[] = [];
  let current = '';
  values.forEach((v, i) => {
    if (v == null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) segments.push(current);
  let last = values.length - 1;
  while (last >= 0 && values[last] == null) last -= 1;
  const endColor = {
    neutral: 'var(--v2-fg)',
    danger: 'var(--v2-danger)',
    warn: 'var(--v2-warn)',
    ok: 'var(--v2-ok)',
  }[endTone];
  const shown = hover ?? null;
  return (
    <span className={cn('relative inline-flex', className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full overflow-visible"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * width;
          let best = 0;
          values.forEach((_, i) => {
            if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i;
          });
          setHover(values[best] == null ? null : best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {band ? (
          <rect
            x={0}
            width={width}
            y={y(band.high)}
            height={Math.max(1, y(band.low) - y(band.high))}
            rx={2}
            fill="var(--v2-surface-2)"
          />
        ) : null}
        {segments.map((d) => (
          <path key={d} d={d} fill="none" stroke="var(--v2-muted)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {last >= 0 ? <circle cx={x(last)} cy={y(values[last] as number)} r={2.5} fill={endColor} stroke="var(--v2-surface)" strokeWidth={1.5} /> : null}
        {shown != null ? (
          <circle cx={x(shown)} cy={y(values[shown] as number)} r={3} fill="var(--v2-fg)" stroke="var(--v2-surface)" strokeWidth={1.5} />
        ) : null}
      </svg>
      {shown != null ? (
        <span
          role="presentation"
          className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-v2-fg px-1.5 py-0.5 t-meta text-v2-bg t-tnum shadow-pop"
          style={{ left: x(shown) }}
        >
          {format(values[shown] as number)}
          {labels?.[shown] ? <span className="ml-1 opacity-70">{labels[shown]}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Medidor fino (adherencia, progreso de programa): pista gris, relleno TINTA
 * (neutro) salvo que el tono diga otra cosa, marca opcional de objetivo.
 * `value = null` → pista vacía con «—»: no se sabe, no es 0.
 */
export function Meter({
  value,
  max = 100,
  target,
  tone = 'neutral',
  label,
  valueLabel,
  width = 48,
  showValue = true,
  className,
}: {
  value: number | null;
  max?: number;
  target?: number;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
  /** Nombre accesible («Adherencia 14 días»). */
  label: string;
  /** Texto del valor («67 %», «3 de 4»). Por defecto el %. */
  valueLabel?: string;
  width?: number;
  showValue?: boolean;
  className?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const fill = { neutral: 'bg-v2-fg', ok: 'bg-v2-ok', warn: 'bg-v2-warn', danger: 'bg-v2-danger' }[tone];
  const text = value == null ? '—' : (valueLabel ?? `${Math.round(pct * 100)} %`);
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? 'sin datos' : text}
        className="relative h-1.5 shrink-0 overflow-hidden rounded-full bg-v2-surface-2"
        style={{ width }}
      >
        <span className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${pct * 100}%` }} />
        {target != null ? (
          <span className="absolute inset-y-[-2px] w-px bg-v2-muted" style={{ left: `${(target / max) * 100}%` }} />
        ) : null}
      </span>
      {showValue ? <span className={cn('t-body-sm t-tnum', value == null ? 'text-v2-faint' : 'text-v2-fg')}>{text}</span> : null}
    </span>
  );
}
