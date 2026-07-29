'use client';

// EndPolicyPanel — the "Al terminar la secuencia" panel at the foot of the editor.
//   · end_policy   : Repetir | Subir nivel | Parar (segmented, 3 options).
//   · progression  : a per-loop increment (progression_pct) + the lever it applies
//                    to (progression_applies_to: strength_load | volume | pace).
//
// The increment only makes sense when the loop repeats, so the whole increment row
// dims (and is cleared) when policy != 'repeat' — there is no loop to increment.
// The panel itself dims when the sequence has no microciclos yet (nothing to loop).
//
// progression_pct + progression_applies_to are an all-or-nothing pair (the shared
// Zod schema enforces it): both set or both null. We keep them coherent here.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type {
  SequenceEndPolicy,
  SequenceProgressionTarget,
} from '@fahybrid/shared/schema/program-sequences';

// The progression step (% per loop). Whole-number percents; coarse enough to be
// a real coaching lever, not a fiddly slider.
const PCT_STEP = 5;
const PCT_MIN = 0;
const PCT_MAX = 50;
const DEFAULT_PCT = 5;

const END_POLICY_OPTIONS: ReadonlyArray<{ value: SequenceEndPolicy; label: string; icon: string }> = [
  { value: 'repeat', label: 'Repetir', icon: 'repeat' },
  { value: 'level_up', label: 'Subir nivel', icon: 'arrow_upward' },
  { value: 'stop', label: 'Parar', icon: 'stop' },
];

const TARGET_OPTIONS: ReadonlyArray<{ value: SequenceProgressionTarget; label: string }> = [
  { value: 'strength_load', label: 'Carga de fuerza' },
  { value: 'volume', label: 'Volumen' },
  { value: 'pace', label: 'Ritmo objetivo' },
];

export function EndPolicyPanel({
  endPolicy,
  progressionPct,
  progressionTarget,
  disabled,
  onChange,
}: {
  endPolicy: SequenceEndPolicy;
  progressionPct: number | null;
  progressionTarget: SequenceProgressionTarget | null;
  /** True when the sequence is empty (no microciclos) — whole panel dims. */
  disabled: boolean;
  onChange: (next: {
    endPolicy: SequenceEndPolicy;
    progressionPct: number | null;
    progressionTarget: SequenceProgressionTarget | null;
  }) => void;
}) {
  const incrementActive = endPolicy === 'repeat';
  // The displayed % falls back to the default when the increment is on but unset.
  const pctValue = progressionPct ?? DEFAULT_PCT;
  const targetValue = progressionTarget ?? 'strength_load';

  const setPolicy = (value: SequenceEndPolicy) => {
    if (value === 'repeat') {
      // Entering repeat: seed a sensible increment pair (the all-or-nothing pair).
      onChange({
        endPolicy: value,
        progressionPct: progressionPct ?? DEFAULT_PCT,
        progressionTarget: progressionTarget ?? 'strength_load',
      });
    } else {
      // Leaving repeat: there is no loop, so clear the increment pair.
      onChange({ endPolicy: value, progressionPct: null, progressionTarget: null });
    }
  };

  const setPct = (next: number) => {
    const clamped = Math.max(PCT_MIN, Math.min(PCT_MAX, next));
    onChange({
      endPolicy,
      progressionPct: clamped,
      progressionTarget: progressionTarget ?? 'strength_load',
    });
  };

  const setTarget = (value: SequenceProgressionTarget) => {
    onChange({ endPolicy, progressionPct: progressionPct ?? DEFAULT_PCT, progressionTarget: value });
  };

  return (
    <div
      className={cn(
        'mt-5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4',
        disabled ? 'pointer-events-none opacity-50' : undefined,
      )}
    >
      <div className="mb-3.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.07em] text-[color:var(--v2-muted)]">
        <MIcon name="repeat" size={16} className="text-[color:var(--v2-accent)]" />
        Al terminar la secuencia
      </div>

      {disabled ? (
        <p className="text-xs text-[color:var(--v2-faint)]">
          Añade al menos un microciclo para configurar qué pasa al acabar.
        </p>
      ) : (
        <>
          {/* Policy row */}
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="min-w-[150px] text-xs font-semibold text-[color:var(--v2-muted)]">
              Qué pasa al acabar
            </span>
            <div
              role="radiogroup"
              aria-label="Qué pasa al acabar la secuencia"
              className="inline-flex items-center gap-0.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-0.5"
            >
              {END_POLICY_OPTIONS.map((opt) => {
                const on = endPolicy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPolicy(opt.value)}
                    className={cn(
                      'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] px-3 py-1.5 text-label font-bold transition-colors',
                      on
                        ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                        : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                    )}
                  >
                    <MIcon name={opt.icon} size={14} /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Increment row */}
          <div
            className={cn(
              'mt-3.5 flex flex-wrap items-center gap-3.5 border-t border-[color:var(--v2-border)] pt-3.5',
              incrementActive ? undefined : 'pointer-events-none opacity-40',
            )}
          >
            <span className="min-w-[150px] text-xs font-semibold text-[color:var(--v2-muted)]">
              Incremento por vuelta
            </span>
            <div className="inline-flex items-center overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
              <button
                type="button"
                onClick={() => setPct(pctValue - PCT_STEP)}
                aria-label="Menos incremento"
                disabled={!incrementActive}
                className="v2-focus flex h-[30px] w-[30px] items-center justify-center text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="remove" size={16} />
              </button>
              <span className="v2-num min-w-[52px] px-2 text-center text-sm font-bold text-[color:var(--v2-fg)]">
                +{pctValue}%
              </span>
              <button
                type="button"
                onClick={() => setPct(pctValue + PCT_STEP)}
                aria-label="Más incremento"
                disabled={!incrementActive}
                className="v2-focus flex h-[30px] w-[30px] items-center justify-center text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="add" size={16} />
              </button>
            </div>
            <span className="text-xs font-semibold text-[color:var(--v2-muted)]">sobre</span>
            <div className="inline-flex items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
              <label className="sr-only" htmlFor="seq-progression-target">
                Sobre qué se aplica el incremento
              </label>
              <select
                id="seq-progression-target"
                value={targetValue}
                onChange={(e) => setTarget(e.target.value as SequenceProgressionTarget)}
                disabled={!incrementActive}
                className="v2-focus h-[30px] cursor-pointer rounded-[var(--v2-r-s)] bg-transparent px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] focus:outline-none"
              >
                {TARGET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-3 text-label leading-relaxed text-[color:var(--v2-faint)]">
            {endPolicy === 'repeat' ? (
              <>
                El incremento se aplica solo cuando el atleta <b className="text-[color:var(--v2-muted)]">vuelve a empezar</b> la
                secuencia (no entre microciclos). Carga, volumen y ritmo son ejes separados: nunca se mezclan.
              </>
            ) : endPolicy === 'level_up' ? (
              <>
                Con <b className="text-[color:var(--v2-muted)]">Subir nivel</b>, al acabar el atleta se re-clasifica al nivel
                siguiente y cae en la celda de ese nivel. No hay vuelta que incrementar.
              </>
            ) : (
              <>
                Con <b className="text-[color:var(--v2-muted)]">Parar</b>, la secuencia termina y el atleta no recibe más semanas
                automáticas. Para planes finitos (preparación a una carrera concreta).
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
