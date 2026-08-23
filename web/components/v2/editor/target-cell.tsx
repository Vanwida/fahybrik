'use client';

// target-cell — la celda del OBJETIVO de una serie. Su TIPO lo fija el eje
// «contra qué objetivo» (PrescriptionFields), así que aquí solo se edita el
// valor: una cifra suelta, un rango «desde – hasta», o el reloj de un ritmo.
//
// Sale de `prescription-field-groups` porque aquel pasaba de 500 líneas. La
// usan sus dos cuerpos, el de fuerza y el de acondicionamiento.

import type { Prescription, Target } from '@fahybrid/shared/domain/prescription';
import { isScalarTarget, relativePhrase } from '@fahybrid/shared/domain/prescription';
import { ClockCell, NumberCell } from './fields';

// ── TargetCell — kind is fixed by the OBJETIVO axis; this edits the value ─────
export function TargetCell({
  target,
  modality,
  ariaPrefix,
  kind: kindProp,
  onChange,
}: {
  target: Target | undefined;
  modality: Prescription['modality'];
  ariaPrefix: string;
  /**
   * El TIPO del objetivo cuando el valor aún está vacío (sin `target` no hay de
   * dónde leerlo y caería a RPE aunque el eje diga %RM). Lo pasa el compositor
   * de fuerza, cuyo tipo lo fijan sus chips; el resto de llamadas no cambia.
   */
  kind?: Target['kind'];
  onChange: (t: Target | undefined) => void;
}) {
  const kind = target?.kind ?? kindProp ?? 'rpe';

  if (kind === 'bodyweight') {
    return (
      <span className="flex items-center px-1 text-xs text-[color:var(--v2-muted)]">
        Sin carga externa
      </span>
    );
  }

  if (kind === 'relative') {
    // Un objetivo relativo (card 130) no se edita con cifra suelta: es una
    // referencia a una marca del atleta («a peso de competición», «al 50 % del
    // peso corporal») que se resuelve al leer el día, no aquí. Esta celda solo
    // LEE la frase — igual que bodyweight, sin controles numéricos.
    const phrase = target?.kind === 'relative' ? relativePhrase(target) : '';
    return (
      <span className="flex items-center px-1 text-xs text-[color:var(--v2-muted)]">
        {phrase || 'Objetivo relativo'}
      </span>
    );
  }

  if (kind === 'pace') {
    const t = target?.kind === 'pace' ? target : undefined;
    const unit = t?.unit ?? (modality === 'run' ? 'per_km' : 'per_500m');
    const unitLabel = unit === 'per_km' ? '/km' : unit === 'per_500m' ? '/500m' : '/mi';
    return (
      <div className="flex min-w-0 items-center gap-1">
        <ClockCell
          seconds={t?.value_s ?? null}
          ariaLabel={`${ariaPrefix} · ritmo (m:ss)`}
          className="flex-1"
          onChange={(s) => onChange({ kind: 'pace', unit, value_s: s ?? undefined })}
        />
        <span className="shrink-0 text-label font-semibold text-[color:var(--v2-muted)]">
          {unitLabel}
        </span>
      </div>
    );
  }

  // Scalar kinds (%RM / kg / RPE / RIR / zona / bpm / cal). RANGE-capable: the
  // Target model carries either a point (`value`) or a range (`min`/`max`), and
  // the athlete preview already renders ranges ("@ 65-80% RM") — so the editable
  // cell must too. A "desde – hasta" pair: a single point fills `desde` and
  // leaves `hasta` empty; a range fills both. Reading prefers min/max, falling
  // back to the point on the lower bound.
  const suffix = SCALAR_SUFFIX[kind];
  const bounds = scalarBounds(kind);
  const scalar = target && isScalarTarget(target) ? target : undefined;
  const lo = scalar ? scalar.min ?? scalar.value ?? null : null;
  const hi = scalar ? scalar.max ?? null : null;
  const build = (nextLo: number | null, nextHi: number | null): Target | undefined => {
    if (nextLo == null && nextHi == null) return undefined;
    if (nextLo != null && nextHi != null && nextLo !== nextHi) {
      return { kind, min: Math.min(nextLo, nextHi), max: Math.max(nextLo, nextHi) } as Target;
    }
    return { kind, value: (nextLo ?? nextHi)! } as Target;
  };
  return (
    <div className="flex min-w-0 items-center gap-1">
      <NumberCell
        value={lo}
        ariaLabel={`${ariaPrefix} · objetivo (desde)`}
        min={bounds.min}
        max={bounds.max}
        className="flex-1"
        onChange={(val) => onChange(build(val, hi))}
      />
      <span
        className="shrink-0 text-label font-semibold text-[color:var(--v2-faint)]"
        aria-hidden
      >
        –
      </span>
      <NumberCell
        value={hi}
        ariaLabel={`${ariaPrefix} · objetivo (hasta)`}
        min={bounds.min}
        max={bounds.max}
        className="flex-1"
        onChange={(val) => onChange(build(lo, val))}
      />
      {suffix ? (
        <span className="shrink-0 text-label font-semibold text-[color:var(--v2-muted)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

const SCALAR_SUFFIX: Partial<Record<Target['kind'], string>> = {
  percent_rm: '%',
  kg: 'kg',
  hr_zone: 'Z',
  hr_bpm: 'ppm',
  calories: 'cal',
  rpe: 'RPE',
  rir: 'RIR',
};

/** Topes por tipo de objetivo — compartidos con la rejilla por serie (pirámide). */
export function scalarBounds(kind: Target['kind']): { min: number; max: number } {
  switch (kind) {
    case 'percent_rm':
      return { min: 0, max: 200 };
    case 'rpe':
      return { min: 0, max: 10 };
    case 'rir':
      return { min: 0, max: 50 };
    case 'hr_zone':
      return { min: 1, max: 5 };
    case 'hr_bpm':
      return { min: 20, max: 250 };
    default:
      return { min: 0, max: 100000 };
  }
}
