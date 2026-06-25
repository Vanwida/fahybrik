'use client';

// fields — v2-native dense inputs for the prescription editor. The legacy
// PrescriptionControls read the v1 `.dark` token names (--accent, --border-
// subtle…); v2 is theme-isolated under `.v2-root[data-theme]`, so we re-skin the
// SAME control logic onto v2 tokens here. The values/formatters still come from
// the shared prescription-model (parseClock/formatClock/metersToKm…) — zero
// duplicated domain rules. One source for the number/clock/select cells used by
// PrescriptionFields and the type-specific item tables.

import { cn } from '@/lib/utils';
import {
  formatClock,
  kmToMeters,
  metersToKm,
  parseClock,
} from '@/lib/programming/prescription-model';

export const v2FieldCell = cn(
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-sm text-[color:var(--v2-fg)]',
  'v2-num placeholder:font-sans placeholder:text-[color:var(--v2-faint)]',
  'outline-none focus:border-[color:var(--v2-border-strong)]',
);

export const v2SelectCell = cn(
  'v2-focus shrink-0 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
  'bg-[color:var(--v2-surface-2)] px-2 py-1.5 text-xs font-semibold text-[color:var(--v2-fg)]',
  'outline-none focus:border-[color:var(--v2-border-strong)]',
);

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="v2-micro">{children}</span>;
}

export function NumberCell({
  value,
  ariaLabel,
  min,
  max,
  step,
  suffix,
  className,
  onChange,
}: {
  value: number | null;
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          let clamped = n;
          if (min !== undefined && clamped < min) clamped = min;
          if (max !== undefined && clamped > max) clamped = max;
          onChange(clamped);
        }}
        className={cn(v2FieldCell, suffix && 'pr-7')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-[color:var(--v2-muted)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

/** m:ss clock input (pace per unit / a duration). Stores seconds, shows m:ss. */
export function ClockCell({
  seconds,
  ariaLabel,
  placeholder = 'm:ss',
  className,
  onChange,
}: {
  seconds: number | null;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  onChange: (seconds: number | null) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      defaultValue={formatClock(seconds)}
      key={formatClock(seconds)}
      placeholder={placeholder}
      onBlur={(e) => onChange(parseClock(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(v2FieldCell, 'text-center', className)}
    />
  );
}

export function TextCell({
  value,
  ariaLabel,
  placeholder,
  maxLength,
  className,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={cn(v2FieldCell, 'min-w-0 flex-1', className)}
    />
  );
}

/** Distance input with a m/km editing toggle (storage always meters). */
export function DistanceCell({
  meters,
  ariaPrefix,
  className,
  onChange,
}: {
  meters: number | null;
  ariaPrefix: string;
  className?: string;
  onChange: (meters: number | null) => void;
}) {
  // Default unit: km for ≥1km (runs), m otherwise (erg) — read once per render
  // from the current value so the unit stays stable while typing.
  const unit: 'm' | 'km' = meters != null && meters >= 1000 ? 'km' : 'm';
  const inKm = unit === 'km';
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <NumberCell
        value={meters == null ? null : inKm ? metersToKm(meters) : meters}
        ariaLabel={`${ariaPrefix} · distancia`}
        min={0}
        max={inKm ? 100 : 100000}
        step={inKm ? 0.1 : 1}
        suffix={unit}
        className="flex-1"
        onChange={(v) =>
          onChange(v == null ? null : inKm ? kmToMeters(v) : Math.round(v))
        }
      />
    </div>
  );
}

export { formatClock, parseClock };
