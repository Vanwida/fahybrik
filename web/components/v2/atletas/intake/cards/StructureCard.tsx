// CARD 3 — ESTRUCTURA DEL BLOQUE. A proportional phase timeline (segments scaled
// by weeks, muted phase hue per block — NEVER orange) ending at a flag + event
// date marker, then one compact stepper row per block (label + grouped [−][n][+]
// sem), then a DEMOTED advisory sub-row for block emphasis. blockSpecs state +
// MIN/MAX validation preserved from V1.
//
// AGNOSTIC: phase labels AND the timeline color ramp come from resolvePhase(block,
// coachPhases) — the single agnostic resolver. The intake block_specs carry only a
// `type` ATR code (the backend commit contract), so resolvePhase falls back to the
// canonical label + role color (ACC→volume/green, TRANS→intensity/amber,
// REAL→peak/red). If the coach later links phases it upgrades automatically. No
// fresh ATR label map, no hardcoded hue map.

import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type { IntakeProfile } from '@/lib/coach/intake';
import type { IntakeBlockSpec } from '@/lib/coach/intake-schema';
import { DecisionCard } from '../ui/DecisionCard';

const MIN_BLOCK_WEEKS = 1;
const MAX_BLOCK_WEEKS = 20;

const EMPHASIS_LABEL: Record<string, string> = {
  running: 'Carrera',
  strength: 'Fuerza',
  hyrox_specific: 'HYROX específico',
  balanced: 'Equilibrado',
};

export function StructureCard({
  profile,
  blockSpecs,
  totalWeeks,
  endDateLabel,
  coachPhases,
  onStep,
}: {
  profile: IntakeProfile;
  blockSpecs: IntakeBlockSpec[];
  totalWeeks: number;
  /** Resolved end date (event start_date / target iso_date), or null. */
  endDateLabel: string | null;
  /** Coach's methodology_phases for agnostic label/color resolution. */
  coachPhases: MethodologyPhase[];
  /** Step one block's weeks by +1 / −1, clamped at the schema bounds. */
  onStep: (idx: number, delta: number) => void;
}) {
  const { suggestions } = profile;
  const emphasis =
    EMPHASIS_LABEL[suggestions.block_emphasis.bias] ?? suggestions.block_emphasis.bias;
  const blocksValid = blockSpecs.every(
    (b) => b.weeks >= MIN_BLOCK_WEEKS && b.weeks <= MAX_BLOCK_WEEKS,
  );

  const eyebrow = (
    <span className="v2-micro">
      {totalWeeks} {totalWeeks === 1 ? 'semana' : 'semanas'}
      {endDateLabel ? ` · termina ${endDateLabel}` : ''}
    </span>
  );

  return (
    <DecisionCard step={3} title="Estructura del bloque" eyebrow={eyebrow}>
      {/* Proportional timeline bar. */}
      <div
        role="img"
        aria-label={`Línea temporal de fases de ${totalWeeks} semanas`}
        className="flex h-9 overflow-hidden rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]"
      >
        {blockSpecs.map((block, idx) => {
          const resolved = resolvePhase(block, coachPhases);
          const isLast = idx === blockSpecs.length - 1;
          return (
            <div
              key={`${block.type}-${idx}`}
              className="relative flex items-center overflow-hidden whitespace-nowrap px-2.5 text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                flexGrow: Math.max(1, block.weeks),
                flexBasis: 0,
                background: `color-mix(in srgb, ${resolved.color} 22%, transparent)`,
                color: resolved.color,
              }}
            >
              <span className="truncate">
                {resolved.label} · {block.weeks} sem
              </span>
              {isLast && endDateLabel ? (
                <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[color:var(--v2-fg)]">
                  <MIcon name="sports_score" size={13} aria-hidden />
                  <span className="v2-num text-[11px]">{endDateLabel}</span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Per-block stepper rows: label + grouped stepper on the trailing side. */}
      <div className="mt-3.5 flex flex-col gap-2">
        {blockSpecs.map((block, idx) => {
          const outOfRange =
            block.weeks < MIN_BLOCK_WEEKS || block.weeks > MAX_BLOCK_WEEKS;
          const resolved = resolvePhase(block, coachPhases);
          const phaseName = resolved.label;
          return (
            <div key={`${block.type}-${idx}`} className="flex items-center gap-2.5 py-1">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: resolved.color }}
              />
              <span className="text-[13px] font-semibold text-[color:var(--v2-fg)]">
                {phaseName}
              </span>
              <div className="ml-auto inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onStep(idx, -1)}
                  disabled={block.weeks <= MIN_BLOCK_WEEKS}
                  aria-label={`Restar una semana a ${phaseName}`}
                  className="v2-focus inline-flex size-[26px] items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MIcon name="remove" size={16} aria-hidden />
                </button>
                <span
                  aria-live="polite"
                  className={cn(
                    'v2-num inline-flex h-[26px] min-w-[38px] items-center justify-center rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] text-[13px] font-semibold',
                    outOfRange
                      ? 'border-[color:var(--v2-danger)] text-[color:var(--v2-danger)]'
                      : 'border-[color:var(--v2-border)] text-[color:var(--v2-fg)]',
                  )}
                >
                  {block.weeks}
                </span>
                <button
                  type="button"
                  onClick={() => onStep(idx, 1)}
                  disabled={block.weeks >= MAX_BLOCK_WEEKS}
                  aria-label={`Sumar una semana a ${phaseName}`}
                  className="v2-focus inline-flex size-[26px] items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <MIcon name="add" size={16} aria-hidden />
                </button>
                <span className="text-xs text-[color:var(--v2-muted)]">sem</span>
              </div>
            </div>
          );
        })}
      </div>

      {!blocksValid ? (
        <p role="alert" className="mt-2 text-sm text-[color:var(--v2-danger)]">
          Cada bloque debe tener entre {MIN_BLOCK_WEEKS} y {MAX_BLOCK_WEEKS} semanas.
        </p>
      ) : null}

      {/* DEMOTED advisory — no border, muted, smaller; must NOT look editable. */}
      <p className="mt-3.5 flex items-start gap-1.5 text-xs text-[color:var(--v2-muted)]">
        <MIcon name="lightbulb" size={14} className="mt-px shrink-0 opacity-70" aria-hidden />
        <span>
          Énfasis sugerido · {emphasis} — advisory, Pablo decide la programación.
          {suggestions.block_emphasis.note ? (
            <span className="block opacity-80">{suggestions.block_emphasis.note}</span>
          ) : null}
        </span>
      </p>
    </DecisionCard>
  );
}
