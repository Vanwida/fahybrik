// CARD 2 — NIVEL DEL ATLETA. Segmented radiogroup of the 4 levels; the active
// segment uses the orange SELECTION state (brand accent), matching FilterChip /
// SegmentedTabs active treatment. Justification + evidence metric below. Level
// state + default are preserved from IntakeDecision.

import { cn } from '@/lib/utils';
import type { IntakeProfile } from '@/lib/coach/intake';
import type { AthleteLevel } from '@/lib/coach/intake-schema';
import { DecisionCard } from '../ui/DecisionCard';

const LEVELS: ReadonlyArray<{ value: AthleteLevel; label: string }> = [
  { value: 1, label: 'Principiante' },
  { value: 2, label: 'Intermedio' },
  { value: 3, label: 'Pro' },
  { value: 4, label: 'Élite' },
];

export function LevelCard({
  profile,
  level,
  onChange,
}: {
  profile: IntakeProfile;
  level: AthleteLevel;
  onChange: (level: AthleteLevel) => void;
}) {
  const { suggestions, benchmarks, athlete } = profile;

  // Evidence line: concrete signals the level inference used.
  const evidence: string[] = [];
  evidence.push(`${benchmarks.length} benchmark${benchmarks.length === 1 ? '' : 's'}`);
  if (athlete.training_experience_years != null) {
    evidence.push(
      `${athlete.training_experience_years} año${athlete.training_experience_years === 1 ? '' : 's'} de experiencia`,
    );
  }

  return (
    <DecisionCard step={2} title="Nivel del atleta" eyebrow={<span className="micro-label">Decisión</span>}>
      <div
        role="radiogroup"
        aria-label="Nivel del atleta"
        className="inline-flex overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
      >
        {LEVELS.map(({ value, label }, idx) => {
          const active = level === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(value)}
              className={cn(
                'focus-ring inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
                idx > 0 && 'border-l border-[color:var(--border-subtle)]',
                active
                  ? 'border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] text-[color:var(--accent)]'
                  : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
              )}
            >
              <span className={cn('metric-num text-[11px]', active ? 'opacity-100' : 'opacity-70')}>
                {value}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] text-[color:var(--text-muted)]">
        {suggestions.level_rationale}
      </p>
      {evidence.length > 0 ? (
        <p className="metric-num mt-1 text-xs text-[color:var(--text-muted)]">
          Basado en · {evidence.join(' · ')}
        </p>
      ) : null}
    </DecisionCard>
  );
}
