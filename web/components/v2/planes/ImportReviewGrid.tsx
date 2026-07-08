'use client';

// ImportReviewGrid — #28 review step (Fork C: grid + drill-in). Weeks × days, each
// day tinted by its honest tone (grey rest / green typed / amber review / red
// unresolved). Per imported week, an EXPLICIT target-week selector (Fork B — the
// coach maps each imported week onto a container week; nothing auto-fits).
// Clicking a non-rest day opens the day drawer to fix it. "Confirmar" is gated:
// every week mapped + zero unresolved exercises (nothing untyped is ever saved).

import { useState } from 'react';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import {
  dayTone,
  totalUnresolved,
  totalWritableDays,
  unmappedWeekCount,
  type DayTone,
  type MicroWeekRef,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { ImportDayReviewDrawer } from './ImportDayReviewDrawer';

const TONE_CELL: Record<DayTone, string> = {
  rest: 'border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]',
  ok: 'border-[color:var(--v2-ok)]/50 hover:border-[color:var(--v2-ok)]',
  review: 'border-[color:var(--v2-warn)]/60 hover:border-[color:var(--v2-warn)]',
  unresolved: 'border-[color:var(--v2-danger)]/60 hover:border-[color:var(--v2-danger)]',
};

const TONE_TAG: Record<Exclude<DayTone, 'rest'>, { label: string; className: string }> = {
  ok: { label: 'tipado', className: 'bg-[color:var(--v2-ok)]/15 text-[color:var(--v2-ok)]' },
  review: { label: 'revisar', className: 'bg-[color:var(--v2-warn)]/15 text-[color:var(--v2-warn)]' },
  unresolved: { label: 'ejercicio?', className: 'bg-[color:var(--v2-danger)]/15 text-[color:var(--v2-danger)]' },
};

export function ImportReviewGrid({
  reviewWeeks,
  microWeeks,
  onChange,
  onConfirm,
  confirming,
  error,
  onBack,
}: {
  reviewWeeks: ReviewWeek[];
  microWeeks: MicroWeekRef[];
  onChange: (next: ReviewWeek[]) => void;
  onConfirm: () => void;
  confirming: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<{ weekIdx: number; dayIdx: number } | null>(null);

  const setTarget = (weekIdx: number, target: string | null) => {
    onChange(reviewWeeks.map((w, i) => (i === weekIdx ? { ...w, target_week_id: target } : w)));
  };

  const setSession = (weekIdx: number, dayIdx: number, session: EditorSession) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx
          ? w
          : { ...w, days: w.days.map((d, j) => (j === dayIdx ? { ...d, session } : d)) },
      ),
    );
  };

  const unresolved = totalUnresolved(reviewWeeks);
  const unmapped = unmappedWeekCount(reviewWeeks);
  const writable = totalWritableDays(reviewWeeks);
  const canConfirm = !confirming && unresolved === 0 && unmapped === 0 && writable > 0;

  const editingWeek = editing ? reviewWeeks[editing.weekIdx] : null;
  const editingDay = editingWeek ? editingWeek.days[editing!.dayIdx] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {reviewWeeks.map((week, weekIdx) => (
          <section key={`${week.sheet}-${weekIdx}`} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[color:var(--v2-fg)]">
                  Semana <span className="v2-num">{week.week}</span>
                </h3>
                <span className="text-[11px] text-[color:var(--v2-faint)]">· {week.sheet}</span>
                {week.fell_back ? (
                  <span
                    title="No existe la hoja de esa variante para esta semana; se leyó la estándar."
                    className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-warn)]/12 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--v2-warn)]"
                  >
                    <MIcon name="info" size={11} />
                    estándar
                  </span>
                ) : null}
              </div>

              {/* Fork B — explicit mapping. */}
              <label className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-muted)]">
                <MIcon name="arrow_forward" size={13} className="text-[color:var(--v2-accent)]" />
                <span>Meter en</span>
                <select
                  value={week.target_week_id ?? ''}
                  onChange={(e) => setTarget(weekIdx, e.target.value || null)}
                  className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-2 py-1 text-[12px] font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
                >
                  <option value="">— elige semana —</option>
                  {microWeeks.map((mw) => (
                    <option key={mw.id} value={mw.id}>
                      S{mw.index + 1}
                      {mw.label ? ` · ${mw.label}` : ''}
                      {mw.session_count > 0 ? ` (${mw.session_count} ses)` : ' (vacía)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {week.days.map((day, dayIdx) => {
                const tone = dayTone(day);
                const headline =
                  day.session?.focus ??
                  day.session?.blocks[0]?.title ??
                  (tone === 'rest' ? 'Descanso' : '—');
                const clickable = tone !== 'rest';
                const Cell = clickable ? 'button' : 'div';
                return (
                  <Cell
                    key={day.day_of_week}
                    {...(clickable
                      ? { type: 'button' as const, onClick: () => setEditing({ weekIdx, dayIdx }) }
                      : {})}
                    className={cn(
                      'flex min-h-[68px] flex-col gap-1 rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] px-2 py-2 text-left transition-colors',
                      TONE_CELL[tone],
                      clickable ? 'v2-focus cursor-pointer' : '',
                    )}
                  >
                    <span className="v2-micro uppercase tracking-wide text-[color:var(--v2-faint)]">
                      {day.dow.slice(0, 3)}
                    </span>
                    <span className="line-clamp-2 flex-1 text-[11px] font-medium text-[color:var(--v2-muted)]">
                      {headline}
                    </span>
                    {tone !== 'rest' ? (
                      <span
                        className={cn(
                          'inline-flex w-fit items-center rounded-[var(--v2-r-pill)] px-1.5 py-px text-[9.5px] font-bold',
                          TONE_TAG[tone].className,
                        )}
                      >
                        {TONE_TAG[tone].label}
                      </span>
                    ) : null}
                  </Cell>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="space-y-2 border-t border-[color:var(--v2-border)] px-5 py-3">
        {error ? (
          <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--v2-danger)]">
            <MIcon name="error" size={14} />
            {error}
          </p>
        ) : unresolved > 0 ? (
          <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--v2-danger)]">
            <MIcon name="error" size={14} />
            {unresolved === 1
              ? '1 línea sin ejercicio del catálogo. Resuélvela para poder guardar.'
              : `${unresolved} líneas sin ejercicio del catálogo. Resuélvelas para poder guardar.`}
          </p>
        ) : unmapped > 0 ? (
          <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--v2-warn)]">
            <MIcon name="info" size={14} />
            Asigna cada semana importada a una semana del microciclo.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={confirming}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-50"
          >
            <MIcon name="arrow_back" size={16} />
            Atrás
          </button>
          <span className="ml-auto text-[11px] text-[color:var(--v2-muted)]">
            <span className="v2-num">{writable}</span> día{writable === 1 ? '' : 's'} a importar
          </span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
          >
            <MIcon name={confirming ? 'progress_activity' : 'download_done'} size={17} />
            {confirming ? 'Guardando…' : 'Confirmar y meter en el microciclo'}
          </button>
        </div>
      </footer>

      {editing && editingDay ? (
        <ImportDayReviewDrawer
          day={editingDay}
          dayLabel={`Semana ${editingWeek!.week} · ${editingDay.dow}`}
          onChangeSession={(session) => setSession(editing.weekIdx, editing.dayIdx, session)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
