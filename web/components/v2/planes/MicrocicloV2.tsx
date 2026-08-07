'use client';

// Screen 7 · V2 microciclo editor — ONE editor, TWO zooms over the same real data
// (rediseño ago-2026, contrato: docs/design/contrato-rediseno-editor-microciclos.md;
// maqueta aprobada: docs/design/microciclos-editor-rediseno-mockup.html):
//
//   SEMANA (no `?dia`): week TABS (S1–S4 · N ses + puntitos de modalidad) + the
//   full-width FOCO row + the WEEKSTRIP (sesiones/bloques/ejercicios + barra
//   apilada + chip ámbar «sin dosis» + Copiar a…/Duplicar) + the 7-day board of
//   SESSION cards (slot + título + bloques con dosis en mono). El tablero vive en
//   SemanaBoard.tsx; las derivaciones puras en semana-model.ts.
//
//   DÍA (`?dia=N`): the SAME canvas swaps the board for the focused day's editor
//   (embedded DayEditor). The tabs + foco row stay visible above, so the two
//   zooms feel like one surface.
//
// AGNOSTIC: a day is a flat, coach-named list of blocks — no imposed sections. The
// week/day nav is a soft, in-place `?dia` navigation wrapped in a View Transition.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import { dayCanvasHref, duplicateWeekInMonth } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MODALITY_META } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { CopyWeekModal } from '@/components/v2/planes/CopyWeekModal';
import { AsignarAtletaModal } from '@/components/v2/planes/AsignarAtletaModal';
import { DeleteMicrocicloModal } from '@/components/v2/planes/DeleteMicrocicloModal';
import { SemanaBoard, vtEnabled } from '@/components/v2/planes/SemanaBoard';
import { weekModalities } from '@/components/v2/planes/semana-model';
import { DayEditor } from '@/components/v2/editor/DayEditor';
import { cn } from '@/lib/utils';

// Compact week TABS (S1 · N ses …) with the week's modality dots underneath (mock:
// weektab.dots). Los puntos son señal secundaria: el conteo va en texto y las
// modalidades también se leen (sr-only + weekstrip); el color nunca va solo.
function WeekTabs({
  weeks,
  activeIndex,
  onSelect,
}: {
  weeks: MicroWeek[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Semanas del microciclo"
      className="inline-flex items-center gap-0.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-1"
    >
      {weeks.map((w, i) => {
        const active = i === activeIndex;
        const mods = weekModalities(w.days);
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(i)}
            title={w.label}
            className={cn(
              'v2-focus flex flex-col items-start gap-1 rounded-[var(--v2-r-s)] px-2.5 py-1.5 transition-colors',
              active
                ? 'bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)] shadow-[var(--v2-shadow-card)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <span className="v2-num">S{i + 1}</span>
              <span
                className={cn(
                  'text-eyebrow font-semibold',
                  active ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-faint)]',
                )}
              >
                {w.session_count} ses
              </span>
            </span>
            {/* Fila de puntos SIEMPRE presente (aunque vacía) para que las pestañas alineen. */}
            <span aria-hidden className="flex h-1 items-center gap-1">
              {mods.map((m) => (
                <span
                  key={m}
                  className="h-1 w-1 rounded-full"
                  style={{ background: `var(${MODALITY_META[m].colorVar})` }}
                />
              ))}
            </span>
            {mods.length > 0 ? (
              <span className="sr-only">
                {mods.map((m) => MODALITY_META[m].label).join(', ')}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// Inline "Foco de la semana" row — a FULL-WIDTH bar (never collapsed), always
// visible above the body in both zooms. The coach writes the athlete-facing focus
// line for the week in focus; saves via PATCH /api/coach/program-weeks/[id] on
// blur / Enter. `focus` doubles as the week label and is surfaced to the athlete.
// Keyed by week id at the call site so switching weeks reseeds the draft.
function WeekFocusRow({
  weekId,
  weekLabel,
  initial,
  onSaved,
}: {
  weekId: string;
  weekLabel: string;
  initial: string | null;
  onSaved: (focus: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const baseline = (initial ?? '').trim();
  const { status, setStatus, save } = useInlineSave(async (next) => {
    const res = await fetch(`/api/coach/program-weeks/${weekId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ focus: next.length > 0 ? next : null }),
    });
    if (!res.ok) return false;
    onSaved(next.length > 0 ? next : null);
    return true;
  });

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 py-2.5">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-label font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
        <MIcon name="flag" size={14} />
        Foco {weekLabel}
      </span>
      <label className="sr-only" htmlFor={`week-focus-${weekId}`}>
        Foco de la semana {weekLabel}
      </label>
      <input
        id={`week-focus-${weekId}`}
        type="text"
        value={value}
        maxLength={200}
        onChange={(e) => {
          setValue(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        onBlur={() => save(value.trim(), baseline)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="p. ej. Acumulación de base aeróbica"
        className="v2-focus min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[color:var(--v2-fg)] outline-none placeholder:font-normal placeholder:text-[color:var(--v2-faint)]"
      />
      <InlineSaveBadge status={status} />
      <span className="hidden shrink-0 items-center gap-1 text-label font-medium text-[color:var(--v2-faint)] sm:inline-flex">
        <MIcon name="visibility" size={13} />
        lo ve el atleta
      </span>
    </div>
  );
}

export function MicrocicloV2({
  microcycle_id,
  name,
  weeks,
  dayModel,
}: {
  microcycle_id: string;
  /** Microciclo template name (for "Asignar a atleta" + the delete confirm). */
  name?: string;
  weeks: MicroWeek[];
  /** DÍA zoom level: the open day's editor model (`?dia=N`). null = full week. */
  dayModel?: DayEditorModel | null;
}) {
  const router = useRouter();
  const [focusIndex, setFocusIndex] = useState(0);
  // When a day is open, the focused week is dictated by the URL (the day's week),
  // not the local stepper — so the tabs + week always show the right week.
  const effectiveFocusIndex = dayModel ? dayModel.week_index : focusIndex;
  const focus = useMemo(
    () => weeks[effectiveFocusIndex] ?? weeks[0] ?? null,
    [weeks, effectiveFocusIndex],
  );

  // ── View-transition soft-nav ────────────────────────────────────────────
  // Wrap the `?dia` push in document.startViewTransition so the canvas morphs as
  // one surface. The new snapshot must wait for the server-driven dayModel to
  // commit, so the VT callback returns a promise we resolve from an effect keyed
  // on the day identity (with a safety timeout so it can never hang).
  const pendingResolve = useRef<(() => void) | null>(null);
  const dayKey = dayModel ? `${dayModel.week_index}-${dayModel.day_of_week}` : 'week';
  useEffect(() => {
    if (pendingResolve.current) {
      pendingResolve.current();
      pendingResolve.current = null;
    }
  }, [dayKey]);
  // DÍA → SEMANA: the column index the editor collapses back into (carries the
  // shared morph name in the rebuilt SEMANA grid). Cleared once the VT settles.
  const [collapseDay, setCollapseDay] = useState<number | null>(null);
  const navigate = useCallback(
    (href: string) => {
      if (!vtEnabled()) {
        router.push(href, { scroll: false });
        return;
      }
      const vt = document.startViewTransition(() => {
        router.push(href, { scroll: false });
        return new Promise<void>((resolve) => {
          pendingResolve.current = resolve;
          window.setTimeout(() => {
            if (pendingResolve.current === resolve) pendingResolve.current = null;
            resolve();
          }, 600);
        });
      });
      vt.finished.finally(() => setCollapseDay(null));
    },
    [router],
  );
  // Close the open day back to the full week, collapsing the editor into its day.
  const activeDayIndex = dayModel ? dayModel.day_of_week - 1 : null;
  const closeDay = useCallback(() => {
    if (activeDayIndex !== null) setCollapseDay(activeDayIndex);
    navigate(`/microciclos/${microcycle_id}`);
  }, [activeDayIndex, navigate, microcycle_id]);

  // Duplicar la semana en foco: clon puro (sin progresión) enganchado justo
  // después de ésta. Al volver, deja al coach EN la copia (índice + 1).
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const duplicateWeek = async () => {
    if (!focus || duplicating) return;
    setDuplicating(true);
    setDuplicateError(false);
    try {
      await duplicateWeekInMonth(microcycle_id, focus.id);
      const next = focusIndex + 1;
      router.refresh();
      setFocusIndex(next);
    } catch {
      setDuplicateError(true);
    } finally {
      setDuplicating(false);
    }
  };

  // Añadir una semana VACÍA al final del microciclo, y dejar al coach EN ella.
  const [addingWeek, setAddingWeek] = useState(false);
  const addWeek = async () => {
    if (addingWeek) return;
    setAddingWeek(true);
    try {
      const res = await fetch(`/api/coach/program-months/${microcycle_id}/weeks`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return;
      const appendedIndex = weeks.length; // new week lands at the end (0-based).
      router.refresh();
      setFocusIndex(appendedIndex);
    } finally {
      setAddingWeek(false);
    }
  };

  // Switch the focused week (tab). If a day is open, switching weeks closes it
  // (back to the full week of the chosen tab), collapsing the editor on the way.
  const selectWeek = (i: number) => {
    setFocusIndex(i);
    if (dayModel) closeDay();
  };

  if (weeks.length === 0) {
    return (
      <EmptyState
        icon="calendar_view_week"
        title="Microciclo sin semanas"
        description="Este microciclo aún no tiene semanas definidas."
        action={
          <button
            type="button"
            onClick={addWeek}
            disabled={addingWeek}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60"
          >
            <MIcon name={addingWeek ? 'progress_activity' : 'add'} size={16} />
            {addingWeek ? 'Añadiendo…' : 'Añadir semana'}
          </button>
        }
      />
    );
  }

  // Day editor offset: continuous day index across the microcycle.
  const dayBase = effectiveFocusIndex * 7;

  // ‹ › day nav hrefs for the embedded DÍA editor — across the week's days
  // (Lun→Dom), null at the week boundaries. «← Semana» = closeDay, the soft-nav is
  // `navigate` (both passed to DayEditor as flat props, never re-wrapped in render).
  const prevDayHref =
    dayModel && dayModel.day_of_week > 1
      ? dayCanvasHref(microcycle_id, dayBase + (dayModel.day_of_week - 2))
      : null;
  const nextDayHref =
    dayModel && dayModel.day_of_week < 7
      ? dayCanvasHref(microcycle_id, dayBase + dayModel.day_of_week)
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — week tabs + microciclo-level actions */}
      <div className="flex flex-wrap items-center gap-2">
        <WeekTabs weeks={weeks} activeIndex={effectiveFocusIndex} onSelect={selectWeek} />
        <button
          type="button"
          onClick={addWeek}
          disabled={addingWeek}
          title="Añade una semana vacía al final del microciclo"
          className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
        >
          <MIcon name={addingWeek ? 'progress_activity' : 'add'} size={15} />
          {addingWeek ? 'Añadiendo…' : 'Semana'}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            title="Borra este microciclo y todas sus semanas"
            className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
          >
            <MIcon name="delete" size={15} />
            Borrar
          </button>
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            title="Asigna este microciclo a un atleta (en borrador)"
            className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="assignment_ind" size={15} /> Asignar a atleta
          </button>
        </div>
      </div>

      {/* Foco de la semana — full-width, always visible in both zooms. */}
      {focus ? (
        <WeekFocusRow
          key={focus.id}
          weekId={focus.id}
          weekLabel={`S${effectiveFocusIndex + 1}`}
          initial={focus.focus}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {/* Body — DÍA zoom (embedded editor) or SEMANA zoom (weekstrip + board). */}
      {dayModel ? (
        <section className="vt-day-editor rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 sm:p-4">
          <DayEditor
            model={dayModel}
            embedded
            onBackToWeek={closeDay}
            onNavigateDay={navigate}
            prevDayHref={prevDayHref}
            nextDayHref={nextDayHref}
            // TODO(integración): descomentar cuando DÍA exporte `DayRailDay` y las
            // props opcionales `weekOutline`/`onSelectDay` (frontera SEMANA↔DÍA
            // pineada en el contrato). El outline se construye de los datos de
            // semana ya presentes, con el builder listo en semana-model.ts:
            //   weekOutline={focus ? buildWeekOutline(focus.days) : []}
            //   onSelectDay={(dia) => navigate(dayCanvasHref(microcycle_id, dayBase + dia - 1))}
          />
        </section>
      ) : focus ? (
        <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
          <SemanaBoard
            microcycleId={microcycle_id}
            week={focus}
            weekIndex={effectiveFocusIndex}
            weeks={weeks}
            dayBase={dayBase}
            onNavigate={navigate}
            collapseDay={collapseDay}
            onChanged={() => router.refresh()}
            canCopyWeek={weeks.length > 1}
            onCopyWeek={() => setCopyOpen(true)}
            onDuplicateWeek={() => void duplicateWeek()}
            duplicating={duplicating}
            duplicateError={duplicateError}
          />
        </section>
      ) : null}

      {/* Copiar a… — estampa el contenido de la semana en foco sobre otras. */}
      {copyOpen && focus ? (
        <CopyWeekModal
          microcycleId={microcycle_id}
          sourceWeek={focus}
          weeks={weeks}
          onClose={() => setCopyOpen(false)}
        />
      ) : null}

      {/* Asignar a atleta — closes the library→athlete loop (assign in draft). */}
      {assignOpen ? (
        <AsignarAtletaModal
          monthTemplateId={microcycle_id}
          monthName={name}
          onClose={() => setAssignOpen(false)}
        />
      ) : null}

      {/* Borrar microciclo — destructive confirm (real DELETE). */}
      {deleteOpen ? (
        <DeleteMicrocicloModal
          microcycleId={microcycle_id}
          name={name ?? 'este microciclo'}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}
