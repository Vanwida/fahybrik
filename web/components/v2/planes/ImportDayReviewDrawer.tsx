'use client';

// ImportDayReviewDrawer — the #28 review drill-in (Fork C). A right-side drawer
// that opens the #33 BLOCK editor on ONE imported day's session so the coach fixes
// the review lines and PICKS the out-of-catalog exercises inline. Pure reuse:
// BlockEditor self-manages the ExercisePicker (via ExercisePickerField), so
// resolving an exercise here is the exact same affordance as authoring by hand —
// the resolved exercise_id lands on the line and the day turns green in the grid.

import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ReviewDay } from '@/lib/dashboard/v2/import-review';
import { dayTone } from '@/lib/dashboard/v2/import-review';
import { MIcon } from '@/components/ui/MIcon';
import { BlockEditor } from '@/components/v2/editor/BlockEditor';

const TONE_COPY: Record<ReturnType<typeof dayTone>, { label: string; className: string }> = {
  rest: { label: 'Descanso', className: 'text-[color:var(--v2-faint)]' },
  ok: { label: 'Tipado', className: 'text-[color:var(--v2-ok)]' },
  review: { label: 'Revisar', className: 'text-[color:var(--v2-warn)]' },
  unresolved: { label: 'Falta ejercicio', className: 'text-[color:var(--v2-danger)]' },
};

export function ImportDayReviewDrawer({
  day,
  dayLabel,
  onChangeSession,
  onClose,
}: {
  day: ReviewDay;
  /** e.g. "Semana 1 · Martes". */
  dayLabel: string;
  onChangeSession: (session: EditorSession) => void;
  onClose: () => void;
}) {
  const session = day.session;
  const tone = TONE_COPY[dayTone(day)];

  const updateBlock = (next: EditorBlock) => {
    if (!session) return;
    onChangeSession({
      ...session,
      blocks: session.blocks.map((b) => (b.uid === next.uid ? next : b)),
    });
  };

  const setFocus = (focus: string) => {
    if (!session) return;
    onChangeSession({ ...session, focus });
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={`Revisar ${dayLabel}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="v2-display text-xl">{dayLabel}</h2>
              <span className={`text-[11px] font-bold uppercase tracking-wide ${tone.className}`}>
                {tone.label}
              </span>
            </div>
            {day.stimulus ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--v2-muted)]">
                <span className="text-[color:var(--v2-faint)]">Estímulo · </span>
                {day.stimulus}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar revisión del día"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {!session ? (
            <p className="text-sm text-[color:var(--v2-muted)]">Día de descanso — nada que revisar.</p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="v2-micro">Título de la sesión</span>
                <input
                  type="text"
                  value={session.focus ?? ''}
                  maxLength={120}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="p. ej. Fuerza · Tren inferior"
                  className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
                />
              </label>

              {session.blocks.length === 0 ? (
                <p className="text-sm text-[color:var(--v2-muted)]">
                  Esta sesión no tiene bloques tipados.
                </p>
              ) : (
                session.blocks.map((block) => (
                  <div
                    key={block.uid}
                    className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-4"
                  >
                    <BlockEditor block={block} onChange={updateBlock} />
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-[color:var(--v2-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="check" size={16} />
            Hecho
          </button>
        </footer>
      </div>
    </div>
  );
}
