'use client';

// form-controls — small shared field primitives for the archetype forms. These
// wrap the v2-native cells (../fields) with a label + an inline unit-toggle so
// each tailored form reads as a clean row, NOT a board of toggles. Zero domain
// rules live here — every value is a typed Prescription field edited via the
// shared accessors. The unit toggles (distance↔time, pace↔RPE, zone↔RPE) are the
// archetype's ONE allowed in-place switch, per the UX pase ("pulsa la unidad").

import type { Modality, Target } from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import {
  ClockCell,
  DistanceCell,
  FieldLabel,
  NumberCell,
  TextCell,
  v2FieldCell,
} from '../fields';

/** A labeled field cell (label above, control below) — the form's row unit. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {hint ? (
          <span className="text-[10px] font-medium text-[color:var(--v2-faint)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** A compact inline toggle between two units/modes (e.g. Distancia ↔ Tiempo). */
export function InlineToggle<T extends string>({
  options,
  value,
  ariaLabel,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  ariaLabel: string;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'v2-focus rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide transition-colors',
              active
                ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A native select styled to match the v2 field cell — for ergo sub-modality etc. */
export function SelectCell<T extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  ariaLabel: string;
  onChange: (v: T) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(v2FieldCell, 'appearance-none font-semibold')}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Pace target cell — m:ss /unit, kind FIXED to pace by the archetype ───────
export function PaceCell({
  target,
  modality,
  ariaPrefix,
  onChange,
}: {
  target: Target | undefined;
  modality: Modality | undefined;
  ariaPrefix: string;
  onChange: (t: Target) => void;
}) {
  const t = target?.kind === 'pace' ? target : undefined;
  const unit = t?.unit ?? (modality === 'run' ? 'per_km' : 'per_500m');
  const unitLabel = unit === 'per_km' ? '/km' : unit === 'per_500m' ? '/500m' : '/mi';
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ClockCell
        seconds={t?.value_s ?? null}
        ariaLabel={`${ariaPrefix} · ritmo (m:ss)`}
        className="flex-1"
        onChange={(s) => onChange({ kind: 'pace', unit, value_s: s ?? 0 })}
      />
      <span className="shrink-0 text-[11px] font-semibold text-[color:var(--v2-muted)]">
        {unitLabel}
      </span>
    </div>
  );
}

// ── Scalar target cell (zona / RPE / kg / %RM…), kind fixed by the form ──────
const SCALAR_SUFFIX: Partial<Record<Target['kind'], string>> = {
  percent_rm: '%',
  kg: 'kg',
  hr_zone: 'Z',
  hr_bpm: 'ppm',
  calories: 'cal',
  rpe: 'RPE',
  rir: 'RIR',
};

const SCALAR_BOUNDS: Partial<Record<Target['kind'], { min: number; max: number }>> = {
  percent_rm: { min: 0, max: 200 },
  rpe: { min: 0, max: 10 },
  rir: { min: 0, max: 50 },
  hr_zone: { min: 1, max: 5 },
  hr_bpm: { min: 20, max: 250 },
  kg: { min: 0, max: 100000 },
  calories: { min: 0, max: 100000 },
};

export function ScalarTargetCell({
  kind,
  target,
  ariaLabel,
  onChange,
}: {
  kind: Exclude<Target['kind'], 'bodyweight' | 'pace'>;
  target: Target | undefined;
  ariaLabel: string;
  onChange: (t: Target) => void;
}) {
  const bounds = SCALAR_BOUNDS[kind] ?? { min: 0, max: 100000 };
  const value =
    target && target.kind === kind && 'value' in target ? target.value ?? null : null;
  return (
    <NumberCell
      value={value}
      ariaLabel={ariaLabel}
      min={bounds.min}
      max={bounds.max}
      suffix={SCALAR_SUFFIX[kind]}
      onChange={(v) => onChange({ kind, value: v ?? 0 } as Target)}
    />
  );
}

export { ClockCell, DistanceCell, NumberCell, TextCell };
