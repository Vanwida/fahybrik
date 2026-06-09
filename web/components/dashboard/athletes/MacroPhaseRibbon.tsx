'use client';

import type {
  MacroBlockSpan,
  MacroPhaseAssignment,
  MacroProgressPayload,
} from '@/lib/dashboard/coach/macro-progress';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import { ATR_PHASE_LABEL } from '@/lib/dashboard/constants/atr-phases';
import { cn } from '@/lib/utils';

interface MacroPhaseRibbonProps {
  progress: MacroProgressPayload;
  blockWeek?: number | null | undefined;
  /**
   * Click en segmento → abre drawer en la ficha del atleta.
   * Si no se provee, los segmentos no son clickables.
   */
  onSelectPhase?: (phase: {
    atr_block: AtrBlockType;
    assignment: MacroPhaseAssignment | null;
  }) => void;
}

const PHASE_ORDER: AtrBlockType[] = ['ACC', 'TRANS', 'REAL'];

const PHASES: { key: AtrBlockType; label: string }[] = PHASE_ORDER.map((key) => ({
  key,
  label: ATR_PHASE_LABEL[key],
}));

function phaseIndex(block: AtrBlockType | null): number {
  if (!block) return -1;
  return PHASE_ORDER.indexOf(block);
}

/** Semanas reales de un bloque (ACC 5 / TRANS 4 / REAL 3, …) — nunca 4 fijo. */
function weekCountForPhase(phase: AtrBlockType, spans: MacroBlockSpan[]): number | null {
  return spans.find((s) => s.block_type === phase)?.week_count ?? null;
}

/**
 * Relleno % del bloque activo según sus semanas reales: (blockWeek / week_count).
 * A2 hoy → ACC semana 4 de 5 = 80% (no 100% como con el divisor fijo de 4).
 */
function phaseProgress(
  block: AtrBlockType | null,
  blockWeek: number | null,
  spans: MacroBlockSpan[],
): number {
  if (!block || blockWeek == null) return 0;
  const count = weekCountForPhase(block, spans);
  if (!count || count <= 0) return 0;
  return Math.min(100, Math.round((blockWeek / count) * 100));
}

/**
 * Resuelve qué `athlete_month_assignments` corresponde a una fase ATR.
 * Estrategia:
 *  1. Match por `atr_block_hint === phase` (la asignación con esa hint).
 *  2. Si hay varias, la más reciente (mayor `start_date`).
 *  3. Fallback: la N-ésima asignación por orden cronológico, donde
 *     N = índice de la fase (ACC=0, TRANS=1, REAL=2). Aceptable porque
 *     un macrociclo típico va ACC → TRANS → REAL en orden.
 */
function resolveAssignmentForPhase(
  phase: AtrBlockType,
  assignments: MacroPhaseAssignment[],
): MacroPhaseAssignment | null {
  if (assignments.length === 0) return null;
  const matched = assignments.filter((a) => a.atr_block_hint === phase);
  if (matched.length > 0) {
    return matched[matched.length - 1] ?? null;
  }
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  return assignments[phaseIdx] ?? null;
}

export function MacroPhaseRibbon({ progress, blockWeek, onSelectPhase }: MacroPhaseRibbonProps) {
  const spans = progress.block_spans ?? [];
  const currentIdx = phaseIndex(progress.block);
  // Semana relativa al bloque: preferir la fuente correcta (progress.block_week,
  // derivada de atr_blocks/microcycles). `blockWeek` (week_number macro) solo
  // como fallback legacy.
  const currentBlockWeek = progress.block_week ?? blockWeek ?? null;
  const fillPct = phaseProgress(progress.block, currentBlockWeek, spans);
  const activeWeekCount = progress.block ? weekCountForPhase(progress.block, spans) : null;
  const currentWeek = progress.weeks.find((w) => w.status === 'current');

  // Rango de semanas macro real (1..N) derivado de los tramos de bloque — no el
  // "1–4 … 9–12" fijo de 12 semanas. N = suma de week_count de todos los bloques.
  const totalMacroWeeks = spans.reduce((sum, s) => sum + s.week_count, 0);

  return (
    <section aria-label="Macrociclo">
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border-subtle)_1px,transparent_1px)] bg-[size:10%_100%] opacity-20"
        />
        <div className="relative z-10 flex h-12 w-full overflow-hidden rounded-lg border border-[color:var(--border-subtle)]">
          {PHASES.map((phase, idx) => {
            const isPast = currentIdx > idx;
            const isCurrent = progress.block === phase.key;
            const isFuture = currentIdx >= 0 && idx > currentIdx;

            const assignment = resolveAssignmentForPhase(
              phase.key,
              progress.phase_assignments ?? [],
            );
            const clickable = Boolean(onSelectPhase) && assignment != null;

            const segmentClasses = cn(
              'group relative flex w-1/3 items-center justify-center border-r border-[color:var(--border-subtle)] last:border-r-0',
              isFuture
                ? 'bg-[color:var(--surface-container-low)]'
                : 'bg-[color:var(--surface-container-high)]',
              clickable &&
                'cursor-pointer transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
              !clickable && onSelectPhase
                ? 'cursor-not-allowed opacity-90'
                : null,
            );

            const inner = (
              <>
                {isPast ? (
                  <div className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--status-success)_10%,transparent)]" />
                ) : null}
                {isCurrent ? (
                  <div
                    className="absolute bottom-0 left-0 top-0 bg-[color:color-mix(in_srgb,var(--primary)_20%,transparent)]"
                    style={{ width: `${fillPct}%` }}
                  />
                ) : null}
                {isCurrent ? (
                  <div
                    className="absolute bottom-0 top-0 z-20 w-0.5 bg-[color:var(--primary-container)]"
                    style={{ left: `${fillPct}%` }}
                  >
                    <div className="absolute -top-2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[color:var(--primary-container)]" />
                  </div>
                ) : null}
                <span
                  className={cn(
                    'relative z-10 text-[10px] font-bold uppercase tracking-wider',
                    isFuture ? 'text-[color:var(--text-muted)] opacity-50' : 'text-[color:var(--fg)]',
                    isPast && 'text-[color:var(--text-muted)]',
                  )}
                >
                  {phase.label}
                </span>
              </>
            );

            if (clickable && assignment) {
              return (
                <button
                  key={phase.key}
                  type="button"
                  className={segmentClasses}
                  onClick={() => onSelectPhase?.({ atr_block: phase.key, assignment })}
                  aria-label={`Ver detalle microciclo ${phase.label}`}
                  title={`${assignment.name} · ${assignment.start_date} → ${assignment.end_date}`}
                >
                  {inner}
                </button>
              );
            }

            return (
              <div
                key={phase.key}
                className={segmentClasses}
                title={
                  onSelectPhase
                    ? 'Sin microciclo asignado a esta fase'
                    : undefined
                }
              >
                {inner}
              </div>
            );
          })}
        </div>
        <div className="relative z-10 mt-3 flex justify-between px-2 text-xs text-[color:var(--text-muted)]">
          <span>{totalMacroWeeks > 0 ? 'Semana 1' : ''}</span>
          <span className="font-bold text-[color:var(--primary-container)]">
            {progress.block && currentBlockWeek != null
              ? activeWeekCount != null
                ? `Semana ${currentBlockWeek}/${activeWeekCount} (actual)`
                : `Semana ${currentBlockWeek} (actual)`
              : currentWeek
                ? `Semana actual · ${currentWeek.week_start.slice(5)}`
                : 'Sin semana activa'}
          </span>
          <span>{totalMacroWeeks > 0 ? `Semana ${totalMacroWeeks}` : ''}</span>
        </div>
      </div>
    </section>
  );
}
