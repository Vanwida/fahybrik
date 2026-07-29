'use client';

// Screen 7 · V2 microciclo editor — ONE editor, TWO zooms over the same real data:
//
//   SEMANA (no `?dia`): compact week TABS (S1–S4 · N ses) + a full-width, always-
//   visible FOCO row + the 7 day COLUMNS (Lun→Dom). Each day stacks its real block
//   CHIPS (name + a content-summary line, modality accent). Rest → "Descanso";
//   empty → a dashed add affordance. Clicking a day opens it.
//
//   DÍA (`?dia=N`): the SAME canvas swaps the 7-column grid for the focused day's
//   editor (embedded DayEditor) — «← Semana» + ‹ › day nav live in the day header.
//   The tabs + foco row stay visible above, so the two zooms feel like one surface.
//
// AGNOSTIC: a day is a flat, coach-named list of blocks — no imposed sections. The
// week/day nav is a soft, in-place `?dia` navigation wrapped in a View Transition.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import {
  DAY_LABELS_FULL,
  dayCanvasHref,
  duplicateWeekInMonth,
  type DayBlockInfo,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import type { DayEditorModel } from '@/lib/dashboard/v2/editor-types';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { CopyWeekModal } from '@/components/v2/planes/CopyWeekModal';
import { AsignarAtletaModal } from '@/components/v2/planes/AsignarAtletaModal';
import { DayEditor } from '@/components/v2/editor/DayEditor';
import { cn } from '@/lib/utils';

// Shared view-transition-name (see v2-theme.css `.vt-day-editor`). The open-day
// editor carries it via className; the day column it morphs from/to gets it
// imperatively (forward) or via className (collapse), so the box interpolates.
const VT_DAY_EDITOR = 'vt-day-editor';
// Belt-and-braces guard around the API + reduced-motion (the CSS guards too).
function vtEnabled(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Flatten the day's blocks (across AM/PM) in scheduled order for the column.
function dayBlocks(day: DayModalityInfo): DayBlockInfo[] {
  return day.sessions.flatMap((s) => s.blocks);
}

// Distinct modalities present across a full week (first-seen order) — the honest
// "what does this week cover" summary, derived from real day content.
function weekModalities(days: DayModalityInfo[]): V2Modality[] {
  const seen = new Set<V2Modality>();
  const out: V2Modality[] = [];
  for (const d of days) {
    for (const m of d.modalities) {
      if (!seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
  }
  return out;
}

// One block CHIP on a day column: the coach's block NAME + a compact content
// summary (first exercise · dose, honest — from the structured prescription), with
// the block's modality as a left accent. No imposed section/group label.
function BlockChip({ block }: { block: DayBlockInfo }) {
  const first = block.lines[0];
  const summary = first
    ? `${first.name}${first.dose ? ` · ${first.dose}` : ''}`
    : block.item_count > 0
      ? `${block.item_count} ${block.item_count === 1 ? 'ejercicio' : 'ejercicios'}`
      : null;
  return (
    <div
      className="min-w-0 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-1.5 py-1"
      style={
        block.modality
          ? { borderLeft: `3px solid var(${MODALITY_META[block.modality].colorVar})` }
          : undefined
      }
    >
      <div className="truncate text-[11px] font-bold text-[color:var(--v2-fg)]">{block.title}</div>
      {summary ? (
        <div className="truncate text-[10px] leading-snug text-[color:var(--v2-muted)]">
          {summary}
        </div>
      ) : null}
    </div>
  );
}

// One day COLUMN of the SEMANA grid. Workout → its real block chips; rest → the
// "Descanso" card; empty → a dashed add affordance. The whole card is the link
// that opens the day (View-Transition soft-nav on click). `carryMorphName` tags
// this column with the shared morph name when the editor collapses back into it.
function DayColumn({
  day,
  dayIndex,
  href,
  onNavigate,
  carryMorphName = false,
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
  onNavigate: (href: string) => void;
  carryMorphName?: boolean;
}) {
  const mod = day.dominant;
  const isWorkout = day.session_count > 0 && !!mod;
  const blocks = isWorkout ? dayBlocks(day) : [];
  const morphClass = carryMorphName ? VT_DAY_EDITOR : undefined;

  // Intercept the soft-nav: tag THIS column with the shared morph name (so the old
  // snapshot maps it to the editor box) then hand off to the VT-wrapped push. Plain
  // Link semantics (cmd/middle-click, no-JS) are preserved by the href.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return; // let the Link soft-nav as today (instant)
    e.preventDefault();
    e.currentTarget.style.setProperty('view-transition-name', VT_DAY_EDITOR);
    onNavigate(href);
  };

  const header = (
    <div className="flex items-baseline justify-between gap-1 px-0.5">
      <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
        {DAY_LABELS_FULL[dayIndex]}
      </span>
      {day.session_count > 1 ? (
        <span className="v2-num shrink-0 text-[10px] text-[color:var(--v2-faint)]">
          {day.session_count} ses
        </span>
      ) : null}
    </div>
  );

  const baseCard =
    'v2-focus flex h-full min-h-[132px] flex-col gap-1.5 rounded-[var(--v2-r-m)] border p-2 transition-colors';

  if (isWorkout) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-1.5">
        {header}
        <Link
          href={href}
          scroll={false}
          onClick={handleClick}
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · ${MODALITY_META[mod].label} · ${day.block_count} bloques`}
          className={cn(
            baseCard,
            morphClass,
            'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]',
          )}
          style={{ borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[mod].colorVar})` }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            {blocks.map((b, i) => (
              <BlockChip key={i} block={b} />
            ))}
          </div>
          <span className="v2-num mt-auto pt-0.5 text-[9.5px] text-[color:var(--v2-faint)]">
            {day.block_count} bl{day.item_count > 0 ? ` · ${day.item_count} ej` : ''}
          </span>
        </Link>
      </div>
    );
  }

  if (day.is_rest) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-1.5">
        {header}
        <Link
          href={href}
          scroll={false}
          onClick={handleClick}
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · descanso`}
          className={cn(
            baseCard,
            morphClass,
            'items-center justify-center border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)]',
          )}
        >
          <MIcon name="bedtime" size={20} />
          <span className="text-[11px] font-semibold">Descanso</span>
          {day.focus ? (
            <span className="px-2 text-center text-[9px] text-[color:var(--v2-faint)]">
              {day.focus}
            </span>
          ) : null}
          {day.has_recovery ? (
            <span
              className="mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold"
              style={{ color: 'var(--v2-ok)' }}
            >
              <MIcon name="spa" size={11} />
              Recuperación
            </span>
          ) : null}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-1.5">
      {header}
      <Link
        href={href}
        scroll={false}
        onClick={handleClick}
        aria-label={`${DAY_LABELS_FULL[dayIndex]} · añadir sesión`}
        className={cn(
          baseCard,
          morphClass,
          'items-center justify-center border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
        )}
      >
        <MIcon name="add" size={20} />
        <span className="text-[10px] font-medium">Añadir</span>
      </Link>
    </div>
  );
}

// Compact week TABS (S1 · N ses …) — replaces the giant week-step cards. The active
// tab lifts onto the surface with an accent session count.
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
        return (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(i)}
            title={w.label}
            className={cn(
              'v2-focus flex items-center gap-1.5 rounded-[var(--v2-r-s)] px-2.5 py-1.5 text-xs font-bold transition-colors',
              active
                ? 'bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)] shadow-[var(--v2-shadow-card)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            <span className="v2-num">S{i + 1}</span>
            <span
              className={cn(
                'text-[10px] font-semibold',
                active ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-faint)]',
              )}
            >
              {w.session_count} ses
            </span>
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
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-accent)]">
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
      <span className="hidden shrink-0 items-center gap-1 text-[11px] font-medium text-[color:var(--v2-faint)] sm:inline-flex">
        <MIcon name="visibility" size={13} />
        lo ve el atleta
      </span>
    </div>
  );
}

// Destructive confirm for "Borrar microciclo" — real DELETE, honest error, and on
// success it leaves the (now-gone) canvas for the library. Escape / scrim close.
function DeleteMicrocicloModal({
  microcycleId,
  name,
  onClose,
}: {
  microcycleId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const remove = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/coach/program-months/${microcycleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      router.push('/biblioteca');
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Borrar microciclo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]">
            <MIcon name="delete" size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Borrar microciclo</h2>
            <p className="mt-1 text-sm text-[color:var(--v2-muted)]">
              Vas a borrar «{name}» y todas sus semanas. Esta acción no se puede deshacer.
            </p>
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-[13px] font-semibold text-[color:var(--v2-danger)]">
            No se pudo borrar. Inténtalo de nuevo.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger)] px-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <MIcon name={busy ? 'progress_activity' : 'delete'} size={16} />
            {busy ? 'Borrando…' : 'Borrar microciclo'}
          </button>
        </div>
      </div>
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
  const focusModalities = useMemo(() => (focus ? weekModalities(focus.days) : []), [focus]);

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

      {/* Body — DÍA zoom (embedded editor) or SEMANA zoom (7 day columns). */}
      {dayModel ? (
        <section className="vt-day-editor rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3 sm:p-4">
          <DayEditor
            model={dayModel}
            embedded
            onBackToWeek={closeDay}
            onNavigateDay={navigate}
            prevDayHref={prevDayHref}
            nextDayHref={nextDayHref}
          />
        </section>
      ) : (
        <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
          {/* Week meta + week-level actions */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-sm font-bold text-[color:var(--v2-fg)]">
              Semana {effectiveFocusIndex + 1}
              {focus?.label ? (
                <span className="ml-1.5 font-medium text-[color:var(--v2-muted)]">
                  · {focus.label}
                </span>
              ) : null}
            </h2>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="v2-num text-[11px] font-semibold text-[color:var(--v2-muted)]">
                {focus?.session_count ?? 0}{' '}
                {(focus?.session_count ?? 0) === 1 ? 'sesión' : 'sesiones'}
              </span>
              {focusModalities.length > 0 ? (
                <>
                  <span className="text-[color:var(--v2-faint)]">·</span>
                  <div className="flex flex-wrap gap-1">
                    {focusModalities.map((m) => (
                      <span
                        key={m}
                        className="rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{
                          background: `var(${MODALITY_META[m].softVar})`,
                          color: `var(${MODALITY_META[m].colorVar})`,
                        }}
                      >
                        {MODALITY_META[m].label}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {weeks.length > 1 && focus ? (
                <button
                  type="button"
                  onClick={() => setCopyOpen(true)}
                  title="Copia el contenido de esta semana sobre otras semanas del microciclo"
                  className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                >
                  <MIcon name="library_add" size={14} />
                  Copiar a…
                </button>
              ) : null}
              <button
                type="button"
                onClick={duplicateWeek}
                disabled={duplicating}
                title="Crea una copia idéntica de esta semana justo después"
                className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
              >
                <MIcon name={duplicating ? 'progress_activity' : 'content_copy'} size={14} />
                {duplicating ? 'Duplicando…' : 'Duplicar semana'}
              </button>
            </div>

            {duplicateError ? (
              <p className="basis-full text-[11px] font-semibold text-[color:var(--v2-danger)]">
                No se pudo duplicar la semana. Inténtalo de nuevo.
              </p>
            ) : null}
          </div>

          {/* The 7 day columns — responsive: 2/3 up top on small, 7 equal columns
              on desktop. Clicking a day opens the DÍA zoom (soft-nav + VT). */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-h-[58vh] lg:grid-cols-7 lg:[grid-template-rows:minmax(0,1fr)]">
            {(focus?.days ?? []).map((day, i) => (
              <DayColumn
                key={day.day_of_week}
                day={day}
                dayIndex={i}
                href={dayCanvasHref(microcycle_id, dayBase + i)}
                onNavigate={navigate}
                carryMorphName={i === collapseDay}
              />
            ))}
          </div>
        </section>
      )}

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
