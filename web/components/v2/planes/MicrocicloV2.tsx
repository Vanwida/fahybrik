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
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import { dayCanvasHref, duplicateWeekInMonth } from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MODALITY_META } from '@/components/v2/constants';
import type {
  MicroWeek,
  MicrocicloOwner,
  MicrocicloDeliveredElsewhere,
} from '@/components/v2/planes/MicrocicloEditor';
import { CopyWeekModal } from '@/components/v2/planes/CopyWeekModal';
import { AsignarAtletaModal } from '@/components/v2/planes/AsignarAtletaModal';
import { ActivarPlanPersonalModal } from '@/components/v2/planes/ActivarPlanPersonalModal';
import { DeleteMicrocicloModal } from '@/components/v2/planes/DeleteMicrocicloModal';
import { SemanaBoard, vtEnabled } from '@/components/v2/planes/SemanaBoard';
import { buildWeekOutline, weekModalities } from '@/components/v2/planes/semana-model';
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
                  active ? 'text-[color:var(--v2-accent-text)]' : 'text-[color:var(--v2-faint)]',
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
      <span className="inline-flex shrink-0 items-center gap-1.5 text-label font-bold uppercase tracking-wide text-[color:var(--v2-accent-text)]">
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

// Plantilla vacía pero el atleta ya tiene semanas entregadas — franja HONESTA, tono
// `info` (nunca rojo: no es un error, es un estado). Solo el llamador decide cuándo
// pintarla (plantilla sin sesiones + entregado > 0); este componente no repite ese
// cálculo, solo el copy + la salida al plan del atleta.
function DeliveredElsewhereNotice({ notice }: { notice: MicrocicloDeliveredElsewhere }) {
  const plural = notice.count !== 1;
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-card)] border border-[color:var(--v2-info)] bg-[color:var(--v2-info-soft)] p-3.5">
      <MIcon name="info" size={18} className="mt-0.5 shrink-0 text-[color:var(--v2-info)]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
          Esta plantilla está vacía, pero el atleta ya tiene sus semanas
        </span>
        <span className="text-xs text-[color:var(--v2-muted)]">
          {plural ? 'Las' : 'La'} {notice.count} {plural ? 'sesiones' : 'sesión'} de{' '}
          {notice.athlete_name} se {plural ? 'escribieron' : 'escribió'} día a día, no desde esta
          plantilla. Aquí no verás su trabajo.
        </span>
        <Link
          href={`/atletas/${notice.athlete_id}?tab=plan`}
          className="v2-focus mt-1 inline-flex w-fit items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-info)] px-3 py-1 text-xs font-semibold text-[color:var(--v2-info)] transition-colors hover:bg-[color:var(--v2-info)] hover:text-[color:var(--v2-bg)]"
        >
          Ver el plan de {notice.athlete_name}
          <MIcon name="arrow_forward" size={14} />
        </Link>
      </div>
    </div>
  );
}

export function MicrocicloV2({
  microcycle_id,
  name,
  weeks,
  dayModel,
  owner = null,
  deliveredElsewhere = null,
}: {
  microcycle_id: string;
  /** Microciclo template name (for "Asignar a atleta" + the delete confirm). */
  name?: string;
  weeks: MicroWeek[];
  /** DÍA zoom level: the open day's editor model (`?dia=N`). null = full week. */
  dayModel?: DayEditorModel | null;
  /** Whose PERSONAL plan this is (0164); null = a library microciclo. Swaps
   *  "Asignar a atleta" (which implies picking ANY athlete — meaningless once a
   *  plan already belongs to one) for the athlete context + an in-place activate. */
  owner?: MicrocicloOwner | null;
  /** Plantilla sin sesiones pero con trabajo ya entregado al atleta — null = nada
   *  que avisar (el caso normal). */
  deliveredElsewhere?: MicrocicloDeliveredElsewhere | null;
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

  // Frontera SEMANA↔DÍA (contrato): el outline de la semana en foco para el rail
  // del editor de día, y el salto a otro día (1..7) por el MISMO soft-nav `?dia`.
  // Estables (useMemo/useCallback) para no re-envolver el nav en cada render.
  const weekOutline = useMemo(() => (focus ? buildWeekOutline(focus.days) : []), [focus]);
  const selectDay = useCallback(
    (dia: number) =>
      navigate(dayCanvasHref(microcycle_id, effectiveFocusIndex * 7 + dia - 1)),
    [navigate, microcycle_id, effectiveFocusIndex],
  );

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
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60"
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
      {deliveredElsewhere ? <DeliveredElsewhereNotice notice={deliveredElsewhere} /> : null}

      {/* Toolbar — week tabs + microciclo-level actions */}
      <div className="flex flex-wrap items-center gap-2">
        <WeekTabs weeks={weeks} activeIndex={effectiveFocusIndex} onSelect={selectWeek} />
        <button
          type="button"
          onClick={addWeek}
          disabled={addingWeek}
          title="Añade una semana vacía al final del microciclo"
          className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
        >
          <MIcon name={addingWeek ? 'progress_activity' : 'add'} size={15} />
          {addingWeek ? 'Añadiendo…' : 'Semana'}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            title="Borra este microciclo y todas sus semanas"
            className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
          >
            <MIcon name="delete" size={15} />
            Borrar
          </button>
          {owner ? (
            <>
              {/* La vuelta al atleta: era una etiqueta muerta y el coach se
                  quedaba sin salida (solo el atrás del navegador). Misma voz
                  que el editor de día. */}
              <Link
                href={`/atletas/${owner.athlete_id}?tab=plan`}
                title={`Volver a la ficha de ${owner.athlete_name}`}
                className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="arrow_back" size={15} />
                Plan de {owner.athlete_name}
              </Link>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                title="Elige desde qué lunes este atleta ve el plan"
                className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="play_arrow" size={15} /> Poner en marcha
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              title="Asigna este microciclo a un atleta (en borrador)"
              className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
            >
              <MIcon name="assignment_ind" size={15} /> Asignar a atleta
            </button>
          )}
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
        <section className="vt-day-editor rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 sm:p-4">
          {/* key por identidad SEMANA+DÍA (mismo `dayKey` de arriba): sin ella
              React reutiliza la instancia al cambiar de día — DayEditor guarda
              sus sesiones en useState(initial) sin resincronizar, así que el
              panel se quedaba mostrando el día anterior mientras cabecera y
              carril ya marcaban el nuevo (bug real, no cosmético, cazado en
              QA de producción; day_of_week solo no basta porque dos semanas
              comparten el mismo 1..7). */}
          <DayEditor
            key={dayKey}
            model={dayModel}
            embedded
            onBackToWeek={closeDay}
            onNavigateDay={navigate}
            prevDayHref={prevDayHref}
            nextDayHref={nextDayHref}
            weekOutline={weekOutline}
            onSelectDay={selectDay}
          />
        </section>
      ) : focus ? (
        <section className="rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
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

      {/* Asignar a atleta — closes the library→athlete loop (assign in draft).
          A PERSONAL plan skips the roster picker (it already belongs to one
          athlete) and activates in place instead. */}
      {assignOpen && owner ? (
        <ActivarPlanPersonalModal
          athleteId={owner.athlete_id}
          athleteName={owner.athlete_name}
          monthTemplateId={microcycle_id}
          onClose={() => setAssignOpen(false)}
        />
      ) : assignOpen ? (
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
