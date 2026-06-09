'use client';

// PrescriptionControls — the reusable measure/target/modality controls the
// PrescriptionEditor composes. Split out so the editor file stays readable and
// every modality (run / row / ski / bike / strength / functional / core /
// mobility) is authored through ONE set of typed inputs. No new visual language:
// these reuse the studio's dark tokens, focus rings, MIcon and the same dense
// number/select cells the strength table already used.

import { useState } from 'react';
import type {
  Measure,
  MeasureKind,
  Modality,
  PaceUnit,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import {
  MEASURE_OPTIONS,
  MODALITY_OPTIONS,
  PACE_UNIT_OPTIONS,
  TARGET_LABEL,
  defaultPaceUnit,
  emptyTargetOfKind,
  formatClock,
  kmToMeters,
  metersToKm,
  parseClock,
  targetKindsForModality,
  targetScalar,
} from './prescription-model';

// ── Shared small inputs (single source of truth across the editor) ───────────
// Numeric prescription cells read like an instrument: mono + tabular so the
// values line up in columns and never jitter (font-mono + tabular-nums).
export const cellClass =
  'focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-2 py-1.5 font-mono text-xs tabular-nums text-[color:var(--fg)] outline-none placeholder:font-sans placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]';

const selectClass =
  'focus-ring shrink-0 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-1.5 py-1.5 text-[11px] font-semibold text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]';

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
        className={cn(cellClass, suffix && 'pr-6')}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] text-[color:var(--text-muted)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

// A m:ss clock input (pace per unit / a duration). Stores seconds; shows m:ss.
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
      className={cn(cellClass, 'text-center', className)}
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
      className={cn(cellClass, 'min-w-0 flex-1', className)}
    />
  );
}

// ── Modality selector — segmented pill row, keyboard + aria ──────────────────
export function ModalitySelect({
  value,
  onChange,
  ariaLabel = 'Modalidad',
}: {
  value: Modality | undefined;
  onChange: (m: Modality) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1"
    >
      {MODALITY_OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              'focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2.5 py-1 text-[11px] font-semibold transition-colors',
              active
                ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
                : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] text-[color:var(--text-muted)] hover:border-[color:var(--accent)] hover:text-[color:var(--fg)]',
            )}
          >
            <MIcon name={o.icon} size={14} filled={active} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Measure control: kind select + value (reps / m·km / m:ss / cal) ──────────
export function MeasureControl({
  measure,
  ariaPrefix,
  allowedKinds,
  onChange,
}: {
  measure: Measure | undefined;
  ariaPrefix: string;
  allowedKinds?: MeasureKind[];
  onChange: (m: Measure | undefined) => void;
}) {
  const kind: MeasureKind = measure?.kind ?? 'reps';
  const kinds = allowedKinds ?? MEASURE_OPTIONS.map((o) => o.value);

  // Distance has a m/km EDITING unit toggle; storage is always meters. The
  // initial unit defaults to km for ≥1km values (runs), m otherwise (erg).
  const [distanceUnit, setDistanceUnit] = useState<'m' | 'km'>(
    measure?.kind === 'distance' && measure.meters >= 1000 ? 'km' : 'm',
  );
  const distanceInKm = distanceUnit === 'km';

  const setKind = (k: MeasureKind) => {
    switch (k) {
      case 'reps':
        onChange({ kind: 'reps', value: 8 });
        break;
      case 'distance':
        onChange({ kind: 'distance', meters: 500 });
        break;
      case 'duration':
        onChange({ kind: 'duration', seconds: 60 });
        break;
      case 'calories':
        onChange({ kind: 'calories', value: 15 });
        break;
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={kind}
        aria-label={`${ariaPrefix} · tipo de medida`}
        onChange={(e) => setKind(e.target.value as MeasureKind)}
        className={selectClass}
      >
        {MEASURE_OPTIONS.filter((o) => kinds.includes(o.value)).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {kind === 'reps' ? (
        <NumberCell
          value={measure?.kind === 'reps' ? measure.value : null}
          ariaLabel={`${ariaPrefix} · reps`}
          min={0}
          max={1000}
          className="flex-1"
          onChange={(v) => onChange(v == null ? undefined : { kind: 'reps', value: v })}
        />
      ) : null}

      {kind === 'distance' ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <NumberCell
            value={
              measure?.kind === 'distance'
                ? distanceInKm
                  ? metersToKm(measure.meters)
                  : measure.meters
                : null
            }
            ariaLabel={`${ariaPrefix} · distancia`}
            min={0}
            max={distanceInKm ? 100 : 100000}
            step={distanceInKm ? 0.1 : 1}
            className="flex-1"
            onChange={(v) =>
              onChange(
                v == null
                  ? undefined
                  : { kind: 'distance', meters: distanceInKm ? kmToMeters(v) : Math.round(v) },
              )
            }
          />
          <UnitToggle
            ariaLabel={`${ariaPrefix} · unidad de distancia`}
            options={[
              { value: 'm', label: 'm' },
              { value: 'km', label: 'km' },
            ]}
            value={distanceUnit}
            onChange={(u) => setDistanceUnit(u as 'm' | 'km')}
          />
        </div>
      ) : null}

      {kind === 'duration' ? (
        <ClockCell
          seconds={measure?.kind === 'duration' ? measure.seconds : null}
          ariaLabel={`${ariaPrefix} · tiempo (m:ss)`}
          className="flex-1"
          onChange={(s) => onChange(s == null ? undefined : { kind: 'duration', seconds: s })}
        />
      ) : null}

      {kind === 'calories' ? (
        <NumberCell
          value={measure?.kind === 'calories' ? measure.value : null}
          ariaLabel={`${ariaPrefix} · calorías`}
          min={0}
          max={100000}
          suffix="cal"
          className="flex-1"
          onChange={(v) => onChange(v == null ? undefined : { kind: 'calories', value: v })}
        />
      ) : null}
    </div>
  );
}

// A tiny two-state unit toggle (m/km). Reuses the pill aesthetic.
function UnitToggle({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]"
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
              'focus-ring px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
              active
                ? 'bg-[color:var(--accent)]/15 text-[color:var(--accent)]'
                : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Target control: kind select + value/range, full union ────────────────────
// Covers %RM | kg | RPE | RIR | bodyweight | pace(/km,/500m,/mi) | HR zone | HR
// bpm | calories, each range-capable. The "range" toggle flips a single point to
// a min–max pair (and back), carrying the value across.
export function TargetControl({
  target,
  modality,
  ariaPrefix,
  onChange,
}: {
  target: Target | undefined;
  modality: Modality | undefined;
  ariaPrefix: string;
  onChange: (t: Target | undefined) => void;
}) {
  const kinds = targetKindsForModality(modality);
  const kind: TargetKind = target?.kind ?? kinds[0] ?? 'rpe';
  const isPace = kind === 'pace';
  const isBodyweight = kind === 'bodyweight';

  const isRange = isPace
    ? target?.kind === 'pace' && (target.min_s !== undefined || target.max_s !== undefined)
    : !!target &&
      target.kind !== 'bodyweight' &&
      target.kind !== 'pace' &&
      (target.min !== undefined || target.max !== undefined);

  const setKind = (k: TargetKind) => {
    onChange(emptyTargetOfKind(k, modality, targetScalar(target)));
  };

  // Bounds per kind keep the inputs honest (mirror the schema bounds).
  const bounds = scalarBounds(kind);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={kind}
        aria-label={`${ariaPrefix} · tipo de objetivo`}
        onChange={(e) => setKind(e.target.value as TargetKind)}
        className={selectClass}
      >
        {kinds.map((k) => (
          <option key={k} value={k}>
            {TARGET_LABEL[k]}
          </option>
        ))}
      </select>

      {isBodyweight ? (
        <span className="flex-1 truncate text-[11px] text-[color:var(--text-muted)]">
          Sin carga externa
        </span>
      ) : isPace ? (
        <PaceValue
          target={target?.kind === 'pace' ? target : undefined}
          modality={modality}
          ariaPrefix={ariaPrefix}
          isRange={isRange}
        onChange={onChange}
        />
      ) : isRange ? (
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <NumberCell
            value={scalarMin(target)}
            ariaLabel={`${ariaPrefix} · mínimo`}
            min={bounds.min}
            max={bounds.max}
            onChange={(v) => onChange(patchScalarRange(kind, target, 'min', v))}
          />
          <span className="text-[10px] text-[color:var(--text-muted)]">–</span>
          <NumberCell
            value={scalarMax(target)}
            ariaLabel={`${ariaPrefix} · máximo`}
            min={bounds.min}
            max={bounds.max}
            onChange={(v) => onChange(patchScalarRange(kind, target, 'max', v))}
          />
        </div>
      ) : (
        <NumberCell
          value={scalarValue(target)}
          ariaLabel={`${ariaPrefix} · valor`}
          min={bounds.min}
          max={bounds.max}
          className="flex-1"
          onChange={(v) =>
            onChange(v == null ? undefined : ({ kind, value: v } as Target))
          }
        />
      )}

      {!isBodyweight ? (
        <RangeToggle
          isRange={isRange}
          ariaPrefix={ariaPrefix}
          onToggle={() => onChange(toggleRange(target, kind, modality, isRange))}
        />
      ) : null}
    </div>
  );
}

function PaceValue({
  target,
  modality,
  ariaPrefix,
  isRange,
  onChange,
}: {
  target: Extract<Target, { kind: 'pace' }> | undefined;
  modality: Modality | undefined;
  ariaPrefix: string;
  isRange: boolean;
  onChange: (t: Target | undefined) => void;
}) {
  const unit: PaceUnit = target?.unit ?? defaultPaceUnit(modality);
  const setUnit = (u: PaceUnit) =>
    onChange({ kind: 'pace', unit: u, ...paceTimes(target) });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {isRange ? (
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <ClockCell
            seconds={target?.min_s ?? null}
            ariaLabel={`${ariaPrefix} · ritmo mínimo (m:ss)`}
            onChange={(s) =>
              onChange({ kind: 'pace', unit, min_s: s ?? undefined, max_s: target?.max_s })
            }
          />
          <span className="text-[10px] text-[color:var(--text-muted)]">–</span>
          <ClockCell
            seconds={target?.max_s ?? null}
            ariaLabel={`${ariaPrefix} · ritmo máximo (m:ss)`}
            onChange={(s) =>
              onChange({ kind: 'pace', unit, min_s: target?.min_s, max_s: s ?? undefined })
            }
          />
        </div>
      ) : (
        <ClockCell
          seconds={target?.value_s ?? null}
          ariaLabel={`${ariaPrefix} · ritmo (m:ss)`}
          className="flex-1"
          onChange={(s) => onChange({ kind: 'pace', unit, value_s: s ?? undefined })}
        />
      )}
      <select
        value={unit}
        aria-label={`${ariaPrefix} · unidad de ritmo`}
        onChange={(e) => setUnit(e.target.value as PaceUnit)}
        className={selectClass}
      >
        {PACE_UNIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RangeToggle({
  isRange,
  ariaPrefix,
  onToggle,
}: {
  isRange: boolean;
  ariaPrefix: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isRange}
      aria-label={isRange ? `${ariaPrefix} · valor único` : `${ariaPrefix} · rango mín–máx`}
      title={isRange ? 'Valor único' : 'Rango mín–máx'}
      className="focus-ring shrink-0 rounded-[var(--r-sm)] p-1 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
    >
      <MIcon name={isRange ? 'remove' : 'unfold_more'} size={13} />
    </button>
  );
}

// ── Target value plumbing (scalar kinds only; pace handled inline above) ─────
function scalarValue(t: Target | undefined): number | null {
  if (!t || t.kind === 'bodyweight' || t.kind === 'pace') return null;
  return t.value ?? null;
}
function scalarMin(t: Target | undefined): number | null {
  if (!t || t.kind === 'bodyweight' || t.kind === 'pace') return null;
  return t.min ?? null;
}
function scalarMax(t: Target | undefined): number | null {
  if (!t || t.kind === 'bodyweight' || t.kind === 'pace') return null;
  return t.max ?? null;
}

function patchScalarRange(
  kind: TargetKind,
  t: Target | undefined,
  key: 'min' | 'max',
  v: number | null,
): Target | undefined {
  const prevMin = scalarMin(t);
  const prevMax = scalarMax(t);
  const next = {
    kind,
    min: key === 'min' ? v ?? undefined : prevMin ?? undefined,
    max: key === 'max' ? v ?? undefined : prevMax ?? undefined,
  } as Target;
  return next;
}

function paceTimes(t: Extract<Target, { kind: 'pace' }> | undefined): {
  value_s?: number;
  min_s?: number;
  max_s?: number;
} {
  if (!t) return { value_s: 270 };
  const out: { value_s?: number; min_s?: number; max_s?: number } = {};
  if (t.value_s !== undefined) out.value_s = t.value_s;
  if (t.min_s !== undefined) out.min_s = t.min_s;
  if (t.max_s !== undefined) out.max_s = t.max_s;
  if (out.value_s === undefined && out.min_s === undefined && out.max_s === undefined)
    out.value_s = 270;
  return out;
}

// Flip a target between single value and min–max range, carrying the number.
function toggleRange(
  t: Target | undefined,
  kind: TargetKind,
  modality: Modality | undefined,
  isRange: boolean,
): Target {
  if (kind === 'pace') {
    const p = t?.kind === 'pace' ? t : undefined;
    if (isRange) {
      const v = p?.min_s ?? p?.max_s ?? 270;
      return { kind: 'pace', unit: p?.unit ?? defaultPaceUnit(modality), value_s: v };
    }
    const v = p?.value_s ?? 270;
    return { kind: 'pace', unit: p?.unit ?? defaultPaceUnit(modality), min_s: v, max_s: v };
  }
  const scalar = targetScalar(t) ?? 0;
  if (isRange) return { kind, value: scalar } as Target;
  return { kind, min: scalar, max: scalar } as Target;
}

// Mirror the schema's per-kind numeric bounds so inputs clamp consistently.
function scalarBounds(kind: TargetKind): { min: number; max: number } {
  switch (kind) {
    case 'percent_rm':
      return { min: 0, max: 200 };
    case 'kg':
      return { min: 0, max: 100000 };
    case 'rpe':
      return { min: 0, max: 10 };
    case 'rir':
      return { min: 0, max: 50 };
    case 'hr_zone':
      return { min: 1, max: 5 };
    case 'hr_bpm':
      return { min: 20, max: 250 };
    case 'calories':
      return { min: 0, max: 100000 };
    default:
      return { min: 0, max: 100000 };
  }
}
