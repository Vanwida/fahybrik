'use client';

// strength-pyramid — la rejilla POR SERIE del compositor de fuerza («Variar por
// serie», mock aprobado): una fila por serie con −/＋ de mantener-pulsado en
// cada celda (useHoldRepeat), «aplicar hacia abajo» (⇊, al pasar por la fila) y
// «＋ serie» que copia la última. Así entra la pirámide real (10/10/8/8/6 al
// 65→80%) sin teclado — pero cada celda sigue siendo un campo editable, porque
// el teclado nunca deja de ser un camino (accesibilidad). Edita `sets[]` con
// `measure`/`target` propios por serie: el modelo YA lo soporta, cero cambios
// de schema.

import type {
  Measure,
  PrescriptionSet,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { formatDuration, setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { useHoldRepeat } from '@/components/v2/controls/useHoldRepeat';
import { parseClock } from './fields';
import { PROPOSED_CELL, proposedAria } from './dose-controls';
import { scalarBounds } from './target-cell';

// Paso de cada celda según lo que mide/apunta — percepción, no metodología: el
// hold-repeat recorre el rango cómodo sin pasarse (el teclado cubre el resto).
const STEP_BY_MEASURE: Record<Measure['kind'], number> = {
  reps: 1,
  duration: 5,
  distance: 50,
  calories: 5,
  // "máx" carries no number to step — stepMeasure below no-ops for this kind,
  // so the value here is never actually applied; 0 documents that plainly.
  reps_to_failure: 0,
};
const STEP_BY_TARGET: Partial<Record<TargetKind, number>> = {
  percent_rm: 1,
  kg: 2.5,
  rir: 1,
  rpe: 1,
};
const REST_STEP_S = 15;

const TARGET_COL_LABEL: Partial<Record<TargetKind, string>> = {
  percent_rm: '%RM',
  kg: 'kg',
  rir: 'RIR',
  rpe: 'RPE',
};

// ── Lecturas/escrituras con rango honesto ────────────────────────────────────
// Un «8-10» o un «65-80%» son BANDAS: el −/＋ desplaza las dos puntas a la vez
// (subir una pirámide no puede aplastar el rango a un punto en silencio) y el
// teclado acepta «8-10» igual que «8».

function fmtNum(n: number): string {
  return String(n).replace('.', ',');
}

function rangeText(lo: number | null, hi: number | null): string {
  if (lo == null) return '';
  return hi != null && hi !== lo ? `${fmtNum(lo)}-${fmtNum(hi)}` : fmtNum(lo);
}

/** «8», «8-10», «82,5» → punto o banda. null = no es un número. */
function parseRange(raw: string): { lo: number; hi?: number } | null {
  const m = raw
    .trim()
    .replace(/,/g, '.')
    .match(/^(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] !== undefined ? Number(m[2]) : undefined;
  if (!Number.isFinite(lo)) return null;
  if (hi === undefined || hi === lo) return { lo };
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

function measureDisplay(m: Measure | undefined): string {
  if (!m) return '';
  switch (m.kind) {
    case 'reps':
      return rangeText(m.value, m.max ?? null);
    case 'duration':
      return formatDuration(m.seconds);
    case 'distance':
      return rangeText(m.meters, m.max ?? null);
    case 'calories':
      return rangeText(m.value, m.max ?? null);
    case 'reps_to_failure':
      return 'máx';
  }
}

function stepMeasure(m: Measure | undefined, delta: number): Measure {
  const base: Measure = m ?? { kind: 'reps', value: 0 };
  const shift = (v: number) => Math.max(0, v + delta);
  switch (base.kind) {
    case 'duration':
      return { ...base, seconds: shift(base.seconds), ...(base.max !== undefined ? { max: shift(base.max) } : {}) };
    case 'distance':
      return { ...base, meters: shift(base.meters), ...(base.max !== undefined ? { max: shift(base.max) } : {}) };
    case 'reps_to_failure':
      // Nothing to shift — "máx" carries no number. A no-op keeps the ±
      // control harmless instead of crashing on a set imported as to-failure.
      return base;
    default:
      return { ...base, value: shift(base.kind === 'reps' ? Math.round(base.value) : base.value), ...(base.max !== undefined ? { max: shift(base.max) } : {}) };
  }
}

function commitMeasure(m: Measure | undefined, raw: string): Measure | undefined {
  const kind = m?.kind ?? 'reps';
  if (kind === 'duration') {
    const s = raw.includes(':') ? parseClock(raw) : parseRange(raw)?.lo ?? null;
    return s == null ? undefined : { kind, seconds: s };
  }
  const r = parseRange(raw);
  if (!r) return undefined;
  if (kind === 'distance') return { kind, meters: r.lo, ...(r.hi !== undefined ? { max: r.hi } : {}) };
  // Typing a concrete number over a "máx" cell commits a real rep count —
  // the coach is replacing "to failure" with a known target, not editing one.
  if (kind === 'reps_to_failure') return { kind: 'reps', value: r.lo, ...(r.hi !== undefined ? { max: r.hi } : {}) };
  return { kind, value: r.lo, ...(r.hi !== undefined ? { max: r.hi } : {}) };
}

type ScalarTarget = Extract<Target, { value?: number }>;

function targetScalar(t: Target | undefined): { lo: number | null; hi: number | null } {
  if (!t || t.kind === 'bodyweight' || t.kind === 'pace' || t.kind === 'time_cap') {
    return { lo: null, hi: null };
  }
  const s = t as ScalarTarget;
  return { lo: s.min ?? s.value ?? null, hi: s.max ?? null };
}

function buildTarget(kind: TargetKind, lo: number | null, hi: number | null): Target | undefined {
  if (kind === 'bodyweight') return { kind };
  if (lo == null) return undefined;
  if (hi != null && hi !== lo) {
    return { kind, min: Math.min(lo, hi), max: Math.max(lo, hi) } as Target;
  }
  return { kind, value: lo } as Target;
}

// ── La rejilla ───────────────────────────────────────────────────────────────
export function StrengthPyramid({
  sets,
  targetKind,
  showRest,
  proposedPaths,
  onUpdateSet,
  onRemoveSet,
  onApplyDown,
  onAddSet,
}: {
  sets: PrescriptionSet[];
  /** El tipo de objetivo del ejercicio (los chips de arriba); la columna de carga edita su valor. */
  targetKind: TargetKind;
  showRest: boolean;
  proposedPaths?: ReadonlyMap<string, string>;
  onUpdateSet: (index: number, patch: Partial<PrescriptionSet>) => void;
  onRemoveSet: (index: number) => void;
  onApplyDown: (index: number) => void;
  onAddSet: () => void;
}) {
  const cols = showRest
    ? 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem]'
    : 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem]';
  const cargaLabel = TARGET_COL_LABEL[targetKind] ?? '—';
  const bounds = scalarBounds(targetKind);
  const targetStep = STEP_BY_TARGET[targetKind] ?? 1;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)]">
        <div className={cn('grid items-center gap-1 bg-[color:var(--v2-surface-2)] px-1 py-2', cols)}>
          <span className="v2-micro text-center">#</span>
          <span className="v2-micro text-center">Reps</span>
          <span className="v2-micro text-center">{cargaLabel}</span>
          {showRest ? <span className="v2-micro text-center">Desc</span> : null}
          <span aria-hidden />
        </div>
        {sets.map((set, i) => (
          <PyramidRow
            key={i}
            index={i}
            set={set}
            cols={cols}
            showRest={showRest}
            targetKind={targetKind}
            targetStep={targetStep}
            targetMax={bounds.max}
            proposed={{
              measure: proposedPaths?.has(`sets[${i}].measure`) ?? false,
              target: proposedPaths?.has(`sets[${i}].target`) ?? false,
              rest: proposedPaths?.has(`sets[${i}].rest_s`) ?? false,
            }}
            onUpdate={(patch) => onUpdateSet(i, patch)}
            onRemove={sets.length > 1 ? () => onRemoveSet(i) : undefined}
            onApplyDown={i < sets.length - 1 ? () => onApplyDown(i) : undefined}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAddSet}
        className="v2-focus inline-flex h-[34px] items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3.5 text-body font-bold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        ＋ serie <span className="font-medium text-[color:var(--v2-faint)]">(copia la última)</span>
      </button>
    </div>
  );
}

function PyramidRow({
  index,
  set,
  cols,
  showRest,
  targetKind,
  targetStep,
  targetMax,
  proposed,
  onUpdate,
  onRemove,
  onApplyDown,
}: {
  index: number;
  set: PrescriptionSet;
  cols: string;
  showRest: boolean;
  targetKind: TargetKind;
  targetStep: number;
  targetMax: number;
  proposed: { measure: boolean; target: boolean; rest: boolean };
  onUpdate: (patch: Partial<PrescriptionSet>) => void;
  onRemove?: () => void;
  onApplyDown?: () => void;
}) {
  const n = index + 1;
  const measure = setMeasure(set);
  const target = setTarget(set);
  const { lo, hi } = targetScalar(target);
  const clampT = (v: number) => Math.min(targetMax, Math.max(0, v));

  const stepTarget = (delta: number) => {
    // Una banda se desplaza ENTERA; un punto se mueve; vacío arranca en el paso.
    const nextLo = clampT((lo ?? 0) + delta);
    const nextHi = hi != null ? clampT(hi + delta) : null;
    onUpdate({ target: buildTarget(targetKind, nextLo, nextHi) });
  };

  const stepRest = (delta: number) =>
    onUpdate({ rest_s: Math.max(0, (set.rest_s ?? 0) + delta) });

  return (
    <div
      className={cn(
        'group/row grid items-center gap-1 border-t border-[color:var(--v2-border)] px-1 py-1',
        cols,
      )}
    >
      <span className="v2-num text-center text-xs font-bold text-[color:var(--v2-faint)]">{n}</span>

      <PyramidCell
        display={measureDisplay(measure)}
        ariaLabel={proposedAria(`Serie ${n} · reps`, proposed.measure)}
        proposed={proposed.measure}
        onStep={(d) => onUpdate({ measure: stepMeasure(measure, d * STEP_BY_MEASURE[measure?.kind ?? 'reps']) })}
        onCommit={(raw) => onUpdate({ measure: raw.trim() === '' ? undefined : commitMeasure(measure, raw) ?? measure })}
      />

      {targetKind === 'bodyweight' ? (
        <span className="text-center text-xs text-[color:var(--v2-muted)]">corporal</span>
      ) : (
        <PyramidCell
          display={rangeText(lo, hi)}
          ariaLabel={proposedAria(`Serie ${n} · ${TARGET_COL_LABEL[targetKind] ?? 'carga'}`, proposed.target)}
          proposed={proposed.target}
          onStep={(d) => stepTarget(d * targetStep)}
          onCommit={(raw) => {
            if (raw.trim() === '') return onUpdate({ target: undefined });
            const r = parseRange(raw);
            if (!r) return;
            onUpdate({ target: buildTarget(targetKind, clampT(r.lo), r.hi != null ? clampT(r.hi) : null) });
          }}
        />
      )}

      {showRest ? (
        <PyramidCell
          display={set.rest_s != null ? formatDuration(set.rest_s) : ''}
          ariaLabel={proposedAria(`Serie ${n} · descanso`, proposed.rest)}
          proposed={proposed.rest}
          onStep={(d) => stepRest(d * REST_STEP_S)}
          onCommit={(raw) => {
            if (raw.trim() === '') return onUpdate({ rest_s: undefined });
            const s = raw.includes(':') ? parseClock(raw) : parseRange(raw)?.lo ?? null;
            if (s != null) onUpdate({ rest_s: s });
          }}
        />
      ) : null}

      <span className="flex items-center justify-end gap-0.5 pr-1">
        {onApplyDown ? (
          <button
            type="button"
            onClick={onApplyDown}
            aria-label={`Aplicar la serie ${n} hacia abajo`}
            title="Aplicar hacia abajo"
            className="v2-focus rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] opacity-0 transition-all [@media(hover:none)]:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-[color:var(--v2-accent-soft)] hover:text-[color:var(--v2-accent)]"
          >
            <MIcon name="keyboard_double_arrow_down" size={15} />
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar la serie ${n}`}
            className="v2-focus rounded-[var(--v2-r-2xs)] p-1 text-[color:var(--v2-faint)] opacity-0 transition-all [@media(hover:none)]:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-[color:var(--v2-danger)]"
          >
            <MIcon name="close" size={14} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Una celda de la rejilla: −/＋ con mantener-pulsado A LOS LADOS y un campo mono
 * editable EN MEDIO. Los botones aparecen al pasar por la fila (o siempre, en
 * pantallas táctiles); el campo acepta «8», «8-10» o «82,5» — el teclado nunca
 * deja de ser un camino.
 */
function PyramidCell({
  display,
  ariaLabel,
  proposed,
  onStep,
  onCommit,
}: {
  display: string;
  ariaLabel: string;
  proposed?: boolean;
  onStep: (direction: 1 | -1) => void;
  onCommit: (raw: string) => void;
}) {
  const dec = useHoldRepeat(() => onStep(-1));
  const inc = useHoldRepeat(() => onStep(1));
  const btn =
    'v2-focus grid h-6 w-6 shrink-0 select-none place-items-center rounded-[var(--v2-r-2xs)] text-sm text-[color:var(--v2-faint)] opacity-0 transition-all [@media(hover:none)]:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]';

  return (
    <span className="flex min-w-0 items-center justify-center gap-0.5">
      <button type="button" {...dec} aria-label={`${ariaLabel}: menos`} className={btn}>
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        key={display}
        defaultValue={display}
        placeholder="—"
        onBlur={(e) => {
          if (e.target.value !== display) onCommit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          // w fluida con tope: en 390 la rejilla encoge sin desbordar (los −/＋
          // táctiles siempre visibles caben junto a la cifra).
          'v2-focus v2-num w-full min-w-8 max-w-14 rounded-[var(--v2-r-2xs)] bg-transparent py-1 text-center text-sm font-bold text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:bg-[color:var(--v2-surface-2)]',
          proposed && PROPOSED_CELL,
        )}
      />
      <button type="button" {...inc} aria-label={`${ariaLabel}: más`} className={btn}>
        ＋
      </button>
    </span>
  );
}
