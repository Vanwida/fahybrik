'use client';

// ImportReviewGrid — #28 review step (Fork C: grid + drill-in). Weeks × days, each
// day tinted by its honest tone (grey rest / green typed / amber review / red
// unresolved / grey-struck skipped). Per imported week, an EXPLICIT target-week
// selector (Fork B — the coach maps each imported week onto a container week;
// nothing auto-fits) plus an include/exclude toggle; each non-rest day has its own
// toggle too, so the coach picks EXACTLY what gets imported — excluding a day with
// an unresolved exercise unblocks confirming the rest. Clicking a non-rest day
// opens the day drawer to fix it. "Confirmar" is gated: every INCLUDED week mapped
// + zero unresolved exercises among INCLUDED days (nothing untyped is ever saved).

import { useState } from 'react';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { ImportNotices } from './ImportNotices';
import {
  acceptDayProposals,
  dayHiddenCount,
  dayProposedFields,
  dayReviewLineCount,
  dayTone,
  totalExcludedDays,
  totalIncomplete,
  totalUnresolved,
  totalWritableDays,
  unmappedWeekCount,
  type DayTone,
  type MicroWeekRef,
  type ReviewDay,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { ImportDayReviewDrawer } from './ImportDayReviewDrawer';
import { ImportMissingExercisesPanel } from './ImportMissingExercisesPanel';
import {
  applyMissingExerciseDecisions,
  collectMissingExercises,
  realMissingCount,
} from '@/lib/dashboard/v2/import-missing';

// `incomplete` shares the danger hue with `unresolved` because it shares the
// consequence — both block Confirmar. Amber would promise the coach he can ship
// it, which is a lie. The TAG carries the distinction: which of the two things
// this day is missing, and therefore what he has to go do.
const TONE_CELL: Record<DayTone, string> = {
  rest: 'border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]',
  skipped: 'border-dashed border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
  ok: 'border-[color:var(--v2-ok)]/50 hover:border-[color:var(--v2-ok)]',
  review: 'border-[color:var(--v2-warn)]/60 hover:border-[color:var(--v2-warn)]',
  incomplete: 'border-[color:var(--v2-danger)]/60 hover:border-[color:var(--v2-danger)]',
  unresolved: 'border-[color:var(--v2-danger)]/60 hover:border-[color:var(--v2-danger)]',
};

const TONE_TAG: Record<Exclude<DayTone, 'rest'>, { label: string; className: string }> = {
  ok: { label: 'tipado', className: 'bg-[color:var(--v2-ok)]/15 text-[color:var(--v2-ok)]' },
  review: { label: 'revisar', className: 'bg-[color:var(--v2-warn)]/15 text-[color:var(--v2-warn)]' },
  incomplete: { label: 'sin dosis', className: 'bg-[color:var(--v2-danger)]/15 text-[color:var(--v2-danger)]' },
  unresolved: { label: 'ejercicio?', className: 'bg-[color:var(--v2-danger)]/15 text-[color:var(--v2-danger)]' },
  skipped: { label: 'no entra', className: 'bg-[color:var(--v2-faint)]/15 text-[color:var(--v2-muted)]' },
};

/** The clickable (or inert) content area of a day cell. Rendered as a SIBLING of
 *  the include/exclude toggle so the grid never nests a button inside a button. */
function CellBody({
  as,
  onClick,
  ariaLabel,
  children,
}: {
  as: 'button' | 'div';
  onClick?: () => void;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  const layout = 'flex flex-1 flex-col gap-1 px-2 py-2 text-left';
  if (as === 'button') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn('v2-focus cursor-pointer rounded-[inherit]', layout)}
      >
        {children}
      </button>
    );
  }
  return <div className={layout}>{children}</div>;
}

export function ImportReviewGrid({
  reviewWeeks,
  microWeeks,
  notices,
  onChange,
  onConfirm,
  confirming,
  error,
  onBack,
  onAddPhoto,
}: {
  reviewWeeks: ReviewWeek[];
  microWeeks: MicroWeekRef[];
  /** Lo que la IA no pudo honrar del foco. Se enseña ANTES de la parrilla. */
  notices?: WeekNotice[];
  onChange: (next: ReviewWeek[]) => void;
  onConfirm: () => void;
  confirming: boolean;
  error: string | null;
  onBack: () => void;
  /** Vuelve al paso de las fotos, para la captura de una tarjeta que salió cortada.
   *  Solo existe cuando la propuesta vino de una foto. */
  onAddPhoto?: () => void;
}) {
  const [editing, setEditing] = useState<{ weekIdx: number; dayIdx: number } | null>(null);
  const [creatingMissing, setCreatingMissing] = useState(false);
  // Cuántos NOMBRES distintos faltan, no cuántas líneas: 51 líneas de una semana
  // real son 30 nombres, y es por nombre por lo que se decide.
  const missingCount = realMissingCount(collectMissingExercises(reviewWeeks));

  const setTarget = (weekIdx: number, target: string | null) => {
    onChange(reviewWeeks.map((w, i) => (i === weekIdx ? { ...w, target_week_id: target } : w)));
  };

  /** Reemplaza UNA sesión del día (el resto del día se queda como estaba). */
  const setSession = (
    weekIdx: number,
    dayIdx: number,
    sessionIdx: number,
    session: EditorSession,
  ) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx
          ? w
          : {
              ...w,
              days: w.days.map((d, j) =>
                j !== dayIdx
                  ? d
                  : { ...d, sessions: d.sessions.map((s, k) => (k === sessionIdx ? session : s)) },
              ),
            },
      ),
    );
  };

  const setWeekIncluded = (weekIdx: number, included: boolean) => {
    onChange(reviewWeeks.map((w, i) => (i === weekIdx ? { ...w, included } : w)));
  };

  const setDayIncluded = (weekIdx: number, dayIdx: number, included: boolean) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx
          ? w
          : { ...w, days: w.days.map((d, j) => (j === dayIdx ? { ...d, included } : d)) },
      ),
    );
  };

  const patchDay = (weekIdx: number, dayIdx: number, next: (day: ReviewDay) => ReviewDay) => {
    onChange(
      reviewWeeks.map((w, i) =>
        i !== weekIdx ? w : { ...w, days: w.days.map((d, j) => (j === dayIdx ? next(d) : d)) },
      ),
    );
  };

  const unresolved = totalUnresolved(reviewWeeks);
  const incomplete = totalIncomplete(reviewWeeks);
  const unmapped = unmappedWeekCount(reviewWeeks);
  const writable = totalWritableDays(reviewWeeks);
  const excluded = totalExcludedDays(reviewWeeks);
  const canConfirm =
    !confirming && unresolved === 0 && incomplete === 0 && unmapped === 0 && writable > 0;

  const editingWeek = editing ? reviewWeeks[editing.weekIdx] : null;
  const editingDay = editingWeek ? editingWeek.days[editing!.dayIdx] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {notices && notices.length > 0 ? <ImportNotices notices={notices} /> : null}
        {reviewWeeks.map((week, weekIdx) => (
          <section key={`${week.sheet}-${weekIdx}`} className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[color:var(--v2-fg)]">
                  Semana <span className="v2-num">{week.week}</span>
                </h3>
                <span className="text-label text-[color:var(--v2-faint)]">· {week.sheet}</span>
                {week.fell_back ? (
                  <span
                    title="No existe la hoja de esa variante para esta semana; se leyó la estándar."
                    className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-warn)]/12 px-2 py-0.5 text-eyebrow font-semibold text-[color:var(--v2-warn)]"
                  >
                    <MIcon name="info" size={11} />
                    estándar
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Include/exclude the whole imported week. */}
                <button
                  type="button"
                  onClick={() => setWeekIncluded(weekIdx, !week.included)}
                  aria-label={
                    week.included
                      ? `No importar la semana ${week.week}`
                      : `Importar la semana ${week.week}`
                  }
                  className={cn(
                    'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border px-2.5 py-1 text-label font-semibold transition-colors',
                    week.included
                      ? 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]'
                      : 'border-[color:var(--v2-accent)]/50 text-[color:var(--v2-accent)] hover:border-[color:var(--v2-accent)]',
                  )}
                >
                  <MIcon name={week.included ? 'do_not_disturb_on' : 'add_circle'} size={13} />
                  {week.included ? 'No importar' : 'Importar esta semana'}
                </button>

                {/* Fork B — explicit mapping (an excluded week needs no destination). */}
                <label className="flex items-center gap-1.5 text-label text-[color:var(--v2-muted)]">
                  <MIcon name="arrow_forward" size={13} className="text-[color:var(--v2-accent)]" />
                  <span>Meter en</span>
                  <select
                    value={week.target_week_id ?? ''}
                    onChange={(e) => setTarget(weekIdx, e.target.value || null)}
                    disabled={!week.included}
                    className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-2 py-1 text-xs font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)] disabled:opacity-50"
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
            </div>

            <div
              className={cn(
                'grid grid-cols-4 gap-1.5 sm:grid-cols-7',
                week.included ? '' : 'opacity-60',
              )}
            >
              {week.days.map((day, dayIdx) => {
                const tone = dayTone(day, week.included);
                // Con doble sesión la celda resume las DOS ("Series · Fuerza"):
                // enseñar solo la primera escondería medio día de entreno.
                const headline =
                  day.sessions
                    .map((s) => s.focus ?? s.blocks[0]?.title)
                    .filter(Boolean)
                    .join(' · ') || (tone === 'rest' ? 'Descanso' : '—');
                // A rest day writes nothing → inert. With the week excluded the
                // week-level control governs → cells are display-only too.
                const clickable = tone !== 'rest' && week.included;
                const cellLabel = `${day.dow} de la semana ${week.week}`;
                // Un día ámbar puede serlo por tres motivos MUY distintos y la
                // píldora dice cuál, ordenados por lo que le toca hacer al coach:
                //   1. «N sin ver» — hay trabajo que la foto no enseñó: o lo escribe
                //      a mano o vuelve a fotografiar. Es lo único que falta de verdad.
                //   2. «revisar»   — hay texto que no se pudo tipar: pide sus OJOS.
                //   3. «N huecos»  — valores ya rellenados con sus defaults: solo
                //      pide un visto bueno, así que va el último.
                // El orden importa: con «huecos» arriba, un día con diez huecos ya
                // tapados y dos líneas sin tipar se leía como si no quedara nada que
                // mirar, que es justo lo contrario de la verdad.
                const hidden = tone === 'review' ? dayHiddenCount(day) : 0;
                const toReview = tone === 'review' ? dayReviewLineCount(day) : 0;
                const proposed = tone === 'review' ? dayProposedFields(day).length : 0;
                const tagLabel =
                  hidden > 0
                    ? `${hidden} sin ver`
                    : toReview > 0
                      ? TONE_TAG.review.label
                      : proposed > 0
                        ? `${proposed} hueco${proposed === 1 ? '' : 's'}`
                        : tone === 'rest'
                          ? ''
                          : TONE_TAG[tone].label;
                return (
                  <div
                    key={day.day_of_week}
                    className={cn(
                      'relative flex min-h-[68px] flex-col rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface)] transition-colors',
                      TONE_CELL[tone],
                    )}
                  >
                    {clickable ? (
                      /* Small include/exclude toggle, top-right (sibling of the main
                         button — never nested). */
                      <button
                        type="button"
                        onClick={() => setDayIncluded(weekIdx, dayIdx, !day.included)}
                        aria-label={
                          day.included ? `No importar ${cellLabel}` : `Importar ${cellLabel}`
                        }
                        title={day.included ? 'No importar este día' : 'Importar este día'}
                        className="v2-focus absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-[var(--v2-r-pill)] text-[color:var(--v2-faint)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
                      >
                        <MIcon name={day.included ? 'do_not_disturb_on' : 'add_circle'} size={14} />
                      </button>
                    ) : null}

                    <CellBody
                      as={clickable ? 'button' : 'div'}
                      onClick={clickable ? () => setEditing({ weekIdx, dayIdx }) : undefined}
                      ariaLabel={clickable ? `Revisar ${cellLabel}` : undefined}
                    >
                      <span className="v2-micro uppercase tracking-wide text-[color:var(--v2-faint)]">
                        {day.dow.slice(0, 3)}
                      </span>
                      <span
                        className={cn(
                          'line-clamp-2 flex-1 text-label font-medium',
                          tone === 'skipped'
                            ? 'text-[color:var(--v2-faint)] line-through'
                            : 'text-[color:var(--v2-muted)]',
                        )}
                      >
                        {headline}
                      </span>
                      {tone !== 'rest' ? (
                        <span
                          className={cn(
                            'inline-flex w-fit items-center rounded-[var(--v2-r-pill)] px-1.5 py-px text-nano font-bold',
                            TONE_TAG[tone].className,
                          )}
                        >
                          {tagLabel}
                        </span>
                      ) : null}
                    </CellBody>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="space-y-2 border-t border-[color:var(--v2-border)] px-5 py-3">
        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-danger)]">
            <MIcon name="error" size={14} />
            {error}
          </p>
        ) : unresolved > 0 ? (
          /* La salida de un solo toque. Sin ella, una semana real obliga a abrir
             el selector treinta veces, que es donde se abandona la función. */
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-danger)]">
              <MIcon name="error" size={14} />
              {unresolved === 1
                ? '1 línea sin ejercicio del catálogo.'
                : `${unresolved} líneas sin ejercicio del catálogo.`}
            </p>
            {missingCount > 0 ? (
              <button
                type="button"
                onClick={() => setCreatingMissing(true)}
                className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent)]/50 px-2.5 py-1 text-label font-semibold text-[color:var(--v2-accent)] transition-colors hover:bg-[color:var(--v2-accent)]/10"
              >
                <MIcon name="library_add" size={14} />
                {missingCount === 1
                  ? 'Resolver el ejercicio que falta'
                  : `Resolver los ${missingCount} ejercicios que faltan`}
              </button>
            ) : (
              <p className="text-xs text-[color:var(--v2-muted)]">
                Ábrelo el día y elige un ejercicio del catálogo, o exclúyelo con el
                botón de arriba a la derecha.
              </p>
            )}
          </div>
        ) : incomplete > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-danger)]">
            <MIcon name="error" size={14} />
            {incomplete === 1
              ? '1 línea dice el ejercicio pero no cuánto trabajo. Ábrela y prescríbela.'
              : `${incomplete} líneas dicen el ejercicio pero no cuánto trabajo. Ábrelas y prescríbelas.`}
          </p>
        ) : unmapped > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-warn)]">
            <MIcon name="info" size={14} />
            Asigna cada semana importada a una semana del microciclo.
          </p>
        ) : writable === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-warn)]">
            <MIcon name="info" size={14} />
            No queda ningún día seleccionado — incluye al menos uno para poder confirmar.
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
          <span className="ml-auto text-label text-[color:var(--v2-muted)]">
            {excluded > 0 ? (
              <>
                Se deja{excluded === 1 ? '' : 'n'} fuera <span className="v2-num">{excluded}</span>{' '}
                día{excluded === 1 ? '' : 's'}
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
          >
            <MIcon name={confirming ? 'progress_activity' : 'download_done'} size={17} />
            {confirming
              ? 'Guardando…'
              : writable > 0
                ? `Confirmar ${writable} día${writable === 1 ? '' : 's'}`
                : 'Confirmar'}
          </button>
        </div>
      </footer>

      {creatingMissing ? (
        <ImportMissingExercisesPanel
          weeks={reviewWeeks}
          onResolved={(decisions) => {
            onChange(applyMissingExerciseDecisions(reviewWeeks, decisions));
            setCreatingMissing(false);
          }}
          onClose={() => setCreatingMissing(false)}
        />
      ) : null}

      {editing && editingDay ? (
        <ImportDayReviewDrawer
          day={editingDay}
          dayLabel={`Semana ${editingWeek!.week} · ${editingDay.dow}`}
          onChangeSession={(sessionIdx, session) =>
            setSession(editing.weekIdx, editing.dayIdx, sessionIdx, session)
          }
          onChangeIncluded={(included) => setDayIncluded(editing.weekIdx, editing.dayIdx, included)}
          onAcceptProposals={() =>
            patchDay(editing.weekIdx, editing.dayIdx, acceptDayProposals)
          }
          onAddPhoto={onAddPhoto}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
