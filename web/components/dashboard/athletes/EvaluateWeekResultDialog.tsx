'use client';

// Panel de RESULTADO de "Evaluar la semana" — surface el veredicto que el
// sistema YA computa pero que hoy sólo se asoma en un toast. Jerarquía de lectura
// (founder red lines): VEREDICTO (foco) → POR QUÉ (sólo triggers disparados, con
// número real) → LO QUE HIZO (feed lun→dom de la semana evaluada) → UN solo CTA.
// Reusa el scaffold de modal (scrim + superficie oscura + header/footer) de
// SessionCreateDialog, los tokens de estado canónicos (SESSION_STATUS_COLOR/LABEL)
// y las etiquetas de día (DAY_LABELS). Sin iconos de "IA" (sparkle/✨/⭐).

import { useCallback, useEffect, useRef } from 'react';
import type {
  FiredTrigger,
  WeekFeedSummary,
} from '@/lib/dashboard/coach/weekly-evaluation';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import {
  SESSION_STATUS_COLOR,
  SESSION_STATUS_LABEL,
} from '@/lib/dashboard/constants/session-status';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

type Verdict = 'ok' | 'needs_adjustment';

export interface EvaluateWeekResultDialogProps {
  /** Rango "dd/mm–dd/mm" de la semana evaluada (lo construye el botón). */
  weekRangeLabel: string;
  verdict: Verdict;
  firedTriggers: FiredTrigger[];
  weekFeed: WeekFeedSummary;
  /** needs_adjustment → abre la superficie canónica de revisión. */
  onReview: () => void;
  onClose: () => void;
}

/** Color del token según el tono del trigger (warning | danger). */
function triggerToneColor(tone: FiredTrigger['tone']): string {
  return tone === 'danger' ? 'var(--danger)' : 'var(--status-warning)';
}

export function EvaluateWeekResultDialog({
  weekRangeLabel,
  verdict,
  firedTriggers,
  weekFeed,
  onReview,
  onClose,
}: EvaluateWeekResultDialogProps) {
  const needsAdjustment = verdict === 'needs_adjustment';
  const panelRef = useRef<HTMLDivElement>(null);

  // Accesibilidad del diálogo (mismo patrón que AssignFlow): foco inicial dentro,
  // Escape cierra, Tab atrapado dentro, y foco de vuelta al cerrar.
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Evaluación de la semana ${weekRangeLabel}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--scrim)] p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-modal)] outline-none"
      >
        {/* Header — kicker + cerrar. */}
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <p className="micro-label">Semana {weekRangeLabel}</p>
            <h2 className="font-heading mt-0.5 text-[color:var(--fg)]">
              Evaluación de la semana
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar evaluación"
            className="focus-ring rounded-[var(--r-s)] p-1.5 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="close" size={17} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          {/* 1) VEREDICTO — la lectura focal. */}
          <VerdictBanner needsAdjustment={needsAdjustment} />

          {/* 2) POR QUÉ — sólo los triggers que dispararon, con número real. */}
          <section className="flex flex-col gap-2">
            <h3 className="micro-label">Por qué</h3>
            {firedTriggers.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {firedTriggers.map((t) => (
                  <li
                    key={t.code}
                    className="flex items-center gap-2.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: triggerToneColor(t.tone) }}
                    />
                    <span className="min-w-0 flex-1 text-[13px] text-[color:var(--fg)]">
                      {t.label}
                    </span>
                    <span
                      className="metric-num shrink-0 text-sm font-semibold"
                      style={{ color: triggerToneColor(t.tone) }}
                    >
                      {t.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2 text-[13px] text-[color:var(--text-muted)]">
                Sin señales de alarma — cumplimiento, readiness y HRV en rango.
              </p>
            )}
          </section>

          {/* 3) LO QUE HIZO — feed lun→dom de la semana evaluada. */}
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="micro-label">Lo que hizo</h3>
              {weekFeed.scheduled > 0 ? (
                <span className="metric-num text-xs font-semibold text-[color:var(--text-muted)]">
                  {weekFeed.completed}/{weekFeed.scheduled} hechas
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col divide-y divide-[color:var(--border-subtle)] overflow-hidden rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]">
              {weekFeed.days.map((day) => (
                <WeekFeedRow
                  key={day.iso_date}
                  dayLabel={DAY_LABELS[day.day_of_week - 1] ?? ''}
                  sessions={day.sessions}
                />
              ))}
            </ul>
          </section>
        </div>

        {/* CTA — needs_adjustment → revisar el ajuste; ok → cerrar en calma. */}
        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--border-subtle)] px-4 py-3">
          {needsAdjustment ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={onReview}
                className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
              >
                <MIcon name="tune" size={15} aria-hidden />
                Revisar ajuste
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
            >
              Cerrar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

// ── Veredicto: la lectura focal ─────────────────────────────────────────────
function VerdictBanner({ needsAdjustment }: { needsAdjustment: boolean }) {
  const color = needsAdjustment ? 'var(--status-warning)' : 'var(--status-success)';
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--r-m)] border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${color} 45%, var(--border-subtle))`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, var(--surface-card))`,
      }}
    >
      <MIcon
        name={needsAdjustment ? 'tune' : 'check_circle'}
        size={22}
        className="shrink-0"
        style={{ color }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="micro-label">Veredicto</p>
        <p className="font-heading text-[color:var(--fg)]">
          {needsAdjustment ? 'Necesita ajuste' : 'Semana en orden'}
        </p>
      </div>
    </div>
  );
}

// ── Una fila del feed: día + sus sesiones (✓ hecha / ✗ perdida) ─────────────
function WeekFeedRow({
  dayLabel,
  sessions,
}: {
  dayLabel: string;
  sessions: WeekFeedSummary['days'][number]['sessions'];
}) {
  const hasSessions = sessions.length > 0;
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <span className="micro-label mt-0.5 w-8 shrink-0 uppercase">{dayLabel}</span>
      {hasSessions ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {sessions.map((s, i) => {
            const color = SESSION_STATUS_COLOR[s.status];
            const done = s.status === 'completed';
            const missed = s.status === 'missed' || s.status === 'skipped';
            return (
              <li key={i} className="flex items-center gap-2">
                <MIcon
                  name={done ? 'check' : missed ? 'close' : 'remove'}
                  size={15}
                  className="shrink-0"
                  style={{ color }}
                  aria-hidden
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    done
                      ? 'text-[color:var(--fg)]'
                      : 'text-[color:var(--text-muted)]',
                  )}
                  title={s.title}
                >
                  {s.title}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color }}>
                  {SESSION_STATUS_LABEL[s.status]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="flex-1 text-[13px] text-[color:var(--text-muted)]">
          Descanso
        </span>
      )}
    </li>
  );
}
