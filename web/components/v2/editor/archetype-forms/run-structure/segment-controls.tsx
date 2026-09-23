'use client';

// segment-controls — the intensity + measure primitives for one run segment.
// Every value is a typed SegmentTarget/SegmentMeasure field (zero free text): the
// objetivo picker covers Zona de ritmo · Ritmo (exacto o banda) · Zona FC · RPE
// (exacto o banda) · Sin objetivo, matching the closed grammar exactly.

import type { SegmentMeasure, SegmentTarget } from '@fahybrid/shared/domain/prescription';
import {
  HR_ZONE_MAX,
  HR_ZONE_MIN,
  PACE_ZONE_MAX,
  PACE_ZONE_MIN,
} from '@fahybrid/shared/domain/prescription/run-structure';
import { ClockCell, NumberCell } from '../../fields';
import { InlineToggle } from '../form-controls';
import { objetivoKindOf, targetOfKind, type ObjetivoKind } from './tree-ops';
import { SegmentedControl } from '@/components/v2/ui';

const OBJETIVO_OPTIONS: { value: ObjetivoKind; label: string }[] = [
  { value: 'pace_zone', label: 'Z. ritmo' },
  { value: 'pace', label: 'Ritmo' },
  { value: 'hr_zone', label: 'Z. FC' },
  { value: 'rpe', label: 'RPE' },
  { value: 'none', label: 'Libre' },
];

// Las zonas del modelo: seis de ritmo (Z6 = sprint) y cinco de FC.
const PACE_ZONES = Array.from({ length: PACE_ZONE_MAX - PACE_ZONE_MIN + 1 }, (_, i) => PACE_ZONE_MIN + i);
const HR_ZONE_LIST = Array.from({ length: HR_ZONE_MAX - HR_ZONE_MIN + 1 }, (_, i) => HR_ZONE_MIN + i);

// ── Measure (Distancia ↔ Tiempo) ─────────────────────────────────────────────
export function MeasureCell({
  measure,
  onChange,
}: {
  measure: SegmentMeasure;
  onChange: (m: SegmentMeasure) => void;
}) {
  const mode = measure.type;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <InlineToggle
        ariaLabel="Medida del trabajo"
        value={mode}
        options={[
          { value: 'distance', label: 'Dist.' },
          { value: 'duration', label: 'Tiempo' },
        ]}
        onChange={(next) =>
          onChange(next === 'distance' ? { type: 'distance', m: 400 } : { type: 'duration', s: 60 })
        }
      />
      {measure.type === 'distance' ? (
        <div className="relative min-w-0 flex-1">
          <NumberCell
            value={measure.m}
            ariaLabel="Distancia (m)"
            min={1}
            max={100000}
            suffix="m"
            onChange={(v) => onChange({ type: 'distance', m: Math.max(1, Math.round(v ?? 1)) })}
          />
        </div>
      ) : (
        <ClockCell
          seconds={measure.s}
          ariaLabel="Tiempo (m:ss)"
          className="flex-1"
          onChange={(s) => onChange({ type: 'duration', s: Math.max(1, s ?? 1) })}
        />
      )}
    </div>
  );
}

// ── Zone segmented picker (las zonas del modelo) ─────────────────────────────
function ZonePicker({
  zone,
  zones,
  onChange,
  ariaLabel,
}: {
  zone: number;
  zones: number[];
  onChange: (z: number) => void;
  ariaLabel: string;
}) {
  return (
    <SegmentedControl
      size="sm"
      aria-label={ariaLabel}
      items={zones.map((z) => ({ value: String(z), label: `Z${z}` }))}
      value={String(zone)}
      onValueChange={(v) => onChange(Number(v))}
    />
  );
}

// ── Objetivo (intensity) ─────────────────────────────────────────────────────
export function ObjetivoCell({
  target,
  onChange,
}: {
  target: SegmentTarget | null;
  onChange: (t: SegmentTarget | null) => void;
}) {
  const kind = objetivoKindOf(target);
  return (
    <div className="space-y-1.5">
      <InlineToggle
        ariaLabel="Tipo de objetivo"
        value={kind}
        options={OBJETIVO_OPTIONS}
        onChange={(next) => onChange(targetOfKind(next, target))}
      />
      {target?.type === 'pace' ? <PaceValue target={target} onChange={onChange} /> : null}
      {target?.type === 'rpe' ? <RpeValue target={target} onChange={onChange} /> : null}
      {target?.type === 'pace_zone' ? (
        <ZonePicker zone={target.zone} zones={PACE_ZONES} ariaLabel="Zona de ritmo" onChange={(z) => onChange({ type: 'pace_zone', zone: z })} />
      ) : null}
      {target?.type === 'hr_zone' ? (
        <ZonePicker zone={Math.min(target.zone, HR_ZONE_MAX)} zones={HR_ZONE_LIST} ariaLabel="Zona de frecuencia cardíaca" onChange={(z) => onChange({ type: 'hr_zone', zone: z })} />
      ) : null}
    </div>
  );
}

// Pace: exacto (un ritmo) o banda (min–max), en m:ss /km.
function PaceValue({
  target,
  onChange,
}: {
  target: Extract<SegmentTarget, { type: 'pace' }>;
  onChange: (t: SegmentTarget) => void;
}) {
  const isRange = target.value_s === undefined && (target.min_s !== undefined || target.max_s !== undefined);
  const single = target.value_s ?? target.min_s ?? 270;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <InlineToggle
        ariaLabel="Ritmo exacto o banda"
        value={isRange ? 'range' : 'exact'}
        options={[
          { value: 'exact', label: 'Exacto' },
          { value: 'range', label: 'Banda' },
        ]}
        onChange={(mode) =>
          onChange(
            mode === 'range'
              ? { type: 'pace', min_s: single, max_s: single + 15 }
              : { type: 'pace', value_s: single },
          )
        }
      />
      {isRange ? (
        <div className="flex items-center gap-1">
          <ClockCell seconds={target.min_s ?? null} ariaLabel="Ritmo más rápido (m:ss)" className="w-16" onChange={(s) => onChange({ type: 'pace', min_s: s ?? 0, max_s: target.max_s ?? (s ?? 0) })} />
          <span className="text-xs text-[color:var(--v2-muted)]">–</span>
          <ClockCell seconds={target.max_s ?? null} ariaLabel="Ritmo más lento (m:ss)" className="w-16" onChange={(s) => onChange({ type: 'pace', min_s: target.min_s ?? (s ?? 0), max_s: s ?? 0 })} />
          <span className="t-meta font-semibold text-[color:var(--v2-muted)]">/km</span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <ClockCell seconds={target.value_s ?? null} ariaLabel="Ritmo (m:ss)" className="w-16" onChange={(s) => onChange({ type: 'pace', value_s: s ?? 0 })} />
          <span className="t-meta font-semibold text-[color:var(--v2-muted)]">/km</span>
        </div>
      )}
    </div>
  );
}

// RPE: exacto (un valor) o banda (min–max), 1..10.
function RpeValue({
  target,
  onChange,
}: {
  target: Extract<SegmentTarget, { type: 'rpe' }>;
  onChange: (t: SegmentTarget) => void;
}) {
  const isRange = target.value === undefined && (target.min !== undefined || target.max !== undefined);
  const single = target.value ?? target.min ?? 8;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <InlineToggle
        ariaLabel="RPE exacto o banda"
        value={isRange ? 'range' : 'exact'}
        options={[
          { value: 'exact', label: 'Exacto' },
          { value: 'range', label: 'Banda' },
        ]}
        onChange={(mode) =>
          onChange(mode === 'range' ? { type: 'rpe', min: single, max: Math.min(10, single + 1) } : { type: 'rpe', value: single })
        }
      />
      {isRange ? (
        <div className="flex items-center gap-1">
          <NumberCell value={target.min ?? null} ariaLabel="RPE mínimo" min={1} max={10} className="w-14" onChange={(v) => onChange({ type: 'rpe', min: v ?? 1, max: target.max ?? (v ?? 1) })} />
          <span className="text-xs text-[color:var(--v2-muted)]">–</span>
          <NumberCell value={target.max ?? null} ariaLabel="RPE máximo" min={1} max={10} className="w-14" onChange={(v) => onChange({ type: 'rpe', min: target.min ?? (v ?? 1), max: v ?? 1 })} />
        </div>
      ) : (
        <NumberCell value={target.value ?? null} ariaLabel="RPE" min={1} max={10} className="w-16" suffix="RPE" onChange={(v) => onChange({ type: 'rpe', value: v ?? 1 })} />
      )}
    </div>
  );
}
