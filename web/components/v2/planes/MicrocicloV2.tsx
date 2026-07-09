'use client';

// Screen 7 · V2 "Editor · semana en foco" + the DÍA master-detail. A week-step
// header (one card per week: dot + "Sk · etiqueta" + N ses; selected = accent
// ring) over the focused week laid out as a full-height weekly calendar.
//
// FULL WEEK (no `?dia`): 7 equal day COLUMNS across the full width, each stretched
// to fill the viewport, showing its REAL content stacked top→bottom — the day's
// blocks (modality color, title, agnostic group tag, real exercise/dose lines from
// prescription_json). Rest → "Descanso"; empty → dashed add affordance.
//
// OPEN DAY (`?dia=N`): a proper MASTER-DETAIL (Linear / mail / Notion). The MASTER
// is a vertical LIST of 7 COMPACT day-cards (~30% width) — each natural height, with
// modality accent + its real summary ("Fuerza · 2 ej" / "Descanso" / "+ Añadir");
// the active day is highlighted. The DETAIL (~70%) hosts the embedded DayEditor.
// Cards are content-filled and breathe — no stretched full-height "fideos". Clicking
// a card switches `?dia` in place (soft-nav, animated). "← Semana completa" returns
// to the 7-equal-column SEMANA calendar, which stays unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import {
  DAY_LABELS_FULL,
  DAY_LABELS_SHORT,
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
// editor carries it via className; the day column/card it morphs from/to gets it
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

// The day column's primary heading: the first session focus the coach set, else
// the dominant (first) block title — so the column always names the work.
function dayHeadline(day: DayModalityInfo): string | null {
  for (const s of day.sessions) {
    if (s.focus) return s.focus;
  }
  for (const s of day.sessions) {
    for (const b of s.blocks) {
      if (b.title) return b.title;
    }
  }
  return null;
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

function BlockPreview({
  block,
  groupNames,
}: {
  block: DayBlockInfo;
  groupNames: Record<number, string>;
}) {
  const groupLabel = block.group_id != null ? groupNames[block.group_id] : undefined;
  const extra = block.item_count - block.lines.length;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] px-1.5 py-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {block.modality ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: `var(${MODALITY_META[block.modality].colorVar})` }}
          />
        ) : null}
        <span className="truncate text-[11px] font-semibold text-[color:var(--v2-fg)]">
          {block.title}
        </span>
      </div>
      {groupLabel ? (
        <span className="truncate text-[8.5px] font-medium uppercase tracking-wide text-[color:var(--v2-faint)]">
          {groupLabel}
        </span>
      ) : null}
      {block.lines.map((line, i) => (
        <div key={i} className="min-w-0 truncate text-[10px] leading-snug text-[color:var(--v2-muted)]">
          <span className="text-[color:var(--v2-fg)]">{line.name}</span>
          {line.dose ? (
            <>
              {' '}
              <span className="text-[color:var(--v2-faint)]">·</span> {line.dose}
            </>
          ) : null}
        </div>
      ))}
      {extra > 0 ? (
        <span className="text-[9px] text-[color:var(--v2-faint)]">+{extra} más</span>
      ) : null}
    </div>
  );
}

function DayColumn({
  day,
  dayIndex,
  href,
  groupNames,
  onNavigate,
  carryMorphName = false,
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
  groupNames: Record<number, string>;
  /** SEMANA → DÍA: animate the clicked column growing into the editor. */
  onNavigate: (href: string) => void;
  /** DÍA → SEMANA: this is the column the editor collapses back into, so its
   *  card carries the shared morph name in the rebuilt SEMANA snapshot. */
  carryMorphName?: boolean;
}) {
  const mod = day.dominant;
  const isWorkout = day.session_count > 0 && !!mod;
  const blocks = isWorkout ? dayBlocks(day) : [];
  const headline = isWorkout ? dayHeadline(day) : null;
  const morphClass = carryMorphName ? VT_DAY_EDITOR : undefined;

  // Intercept the soft-nav: tag THIS column with the shared morph name (so the
  // old snapshot maps it to the editor box) then hand off to the VT-wrapped push.
  // Plain Link semantics (cmd/middle-click, no-JS) are preserved by the href.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return; // let the Link soft-nav as today (instant)
    e.preventDefault();
    e.currentTarget.style.setProperty('view-transition-name', VT_DAY_EDITOR);
    onNavigate(href);
  };

  // Column header (day name + session count) — shared across all three states.
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
    'v2-focus flex min-h-[160px] flex-1 flex-col gap-2 rounded-[var(--v2-r-m)] border p-2 transition-colors';

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
          {headline ? (
            <span className="line-clamp-2 text-[12px] font-bold leading-tight text-[color:var(--v2-fg)]">
              {headline}
            </span>
          ) : null}

          {day.modalities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {day.modalities.map((m) => (
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
          ) : null}

          <div className="flex flex-1 flex-col gap-1.5">
            {blocks.map((b, i) => (
              <BlockPreview key={i} block={b} groupNames={groupNames} />
            ))}
          </div>

          <span className="v2-num mt-auto pt-0.5 text-[9.5px] text-[color:var(--v2-faint)]">
            {day.block_count} bl
            {day.item_count > 0 ? ` · ${day.item_count} ej` : ''}
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

// A compact day-card in the MASTER list shown while a day is open. Natural height
// (NOT a stretched full-height column) — day name + modality accent + the SAME
// honest summary the calendar derives ("Fuerza · 2 ej" / "Descanso" / "+ Añadir").
// The active day is highlighted (accent ring); the others are clickable Links that
// switch `?dia` in place. Active = a non-link div (you're already there).
function DayCard({
  day,
  dayIndex,
  href,
  active,
  onNavigate,
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
  active: boolean;
  /** DÍA → DÍA: switch the open day (editor cross-fades, highlight slides). */
  onNavigate: (href: string) => void;
}) {
  const mod = day.dominant;
  const isWorkout = day.session_count > 0 && !!mod;
  const headline = isWorkout ? dayHeadline(day) : null;
  // Honest summary from the real derivation: modality + exercise/block count, or
  // the rest / add affordance. Same fields the calendar columns surface.
  const summary = isWorkout
    ? `${MODALITY_META[mod].label}${
        day.item_count > 0
          ? ` · ${day.item_count} ej`
          : day.block_count > 0
            ? ` · ${day.block_count} bl`
            : ''
      }`
    : day.is_rest
      ? 'Descanso'
      : 'Añadir';

  const className = cn(
    'v2-focus flex flex-col gap-1 rounded-[var(--v2-r-m)] border p-2.5 text-left transition-colors',
    // The active card carries the shared highlight name so it slides between days.
    active && 'vt-active-day',
    active
      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-surface)] ring-1 ring-[color:var(--v2-accent)]'
      : isWorkout
        ? 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]'
        : day.is_rest
          ? 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] hover:border-[color:var(--v2-border-strong)]'
          : 'border-dashed border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
  );
  const style =
    isWorkout && mod
      ? { borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[mod].colorVar})` }
      : undefined;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-[color:var(--v2-fg)]">
          {DAY_LABELS_FULL[dayIndex]}
        </span>
        {day.session_count > 1 ? (
          <span className="v2-num shrink-0 text-[9.5px] text-[color:var(--v2-faint)]">
            {day.session_count} ses
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {isWorkout ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: `var(${MODALITY_META[mod].colorVar})` }}
          />
        ) : !day.is_rest ? (
          <MIcon name="add" size={13} className="shrink-0 text-[color:var(--v2-faint)]" />
        ) : (
          <MIcon name="bedtime" size={13} className="shrink-0 text-[color:var(--v2-muted)]" />
        )}
        <span
          className="truncate text-[11px] font-semibold"
          style={isWorkout && mod ? { color: `var(${MODALITY_META[mod].colorVar})` } : undefined}
        >
          {summary}
        </span>
      </div>
      {headline ? (
        <span className="truncate text-[10px] leading-snug text-[color:var(--v2-muted)]">
          {headline}
        </span>
      ) : null}
    </>
  );

  const ariaLabel = `${DAY_LABELS_FULL[dayIndex]} · ${
    isWorkout ? summary : day.is_rest ? 'descanso' : 'añadir sesión'
  }`;

  if (active) {
    return (
      <div className={className} style={style} aria-current="true" aria-label={ariaLabel}>
        {body}
      </div>
    );
  }
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return;
    e.preventDefault();
    onNavigate(href);
  };
  return (
    <Link
      href={href}
      scroll={false}
      onClick={handleClick}
      className={className}
      style={style}
      aria-label={ariaLabel}
    >
      {body}
    </Link>
  );
}

// The grown column: the SAME week grid track, now hosting the full day editor
// inline (the week IS the editor). A slim header gives the one-click way back to
// the full 7-column week (clears `?dia`); the body is the reused DayEditor.
function ActiveDayColumn({
  microcycleId,
  dayModel,
  onBack,
}: {
  microcycleId: string;
  dayModel: DayEditorModel;
  /** DÍA → SEMANA: collapse the editor back into its day column. */
  onBack: () => void;
}) {
  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!vtEnabled()) return;
    e.preventDefault();
    onBack();
  };
  return (
    <div className="vt-day-editor flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-accent)] bg-[color:var(--v2-surface)] ring-1 ring-[color:var(--v2-accent)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--v2-border)] px-3 py-2">
        <Link
          href={`/microciclos/${microcycleId}`}
          scroll={false}
          onClick={handleBack}
          className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="arrow_back" size={15} />
          Semana completa
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DayEditor model={dayModel} embedded />
      </div>
    </div>
  );
}

// Inline "Foco de la semana" editor — the coach writes the athlete-facing focus
// line for the week in focus. Saves via PATCH /api/coach/program-weeks/[id]
// (metadata-only, no slots_json round-trip) on blur / Enter; `focus` doubles as
// the editor's week label and is surfaced verbatim to the athlete on the Plan.
// Keyed by week id at the call site so switching weeks reseeds the draft.
function WeekFocusInput({
  weekId,
  initial,
  onSaved,
}: {
  weekId: string;
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
    <div className="basis-full">
      <label
        htmlFor={`week-focus-${weekId}`}
        className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]"
      >
        <MIcon name="flag" size={13} />
        Foco de la semana
        <span className="font-medium normal-case tracking-normal text-[color:var(--v2-faint)]">
          · lo ve el atleta
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
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
          // Fill the row (flex-1 + min-w-0), badge sits at the end — matches the
          // session-title input idiom. `w-full` alone let the flex row shrink the
          // field to ~1 char; flex-1 makes it robustly full-width.
          className="v2-focus min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-1.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)]"
        />
        <InlineSaveBadge status={status} />
      </div>
    </div>
  );
}

export function MicrocicloV2({
  microcycle_id,
  name,
  weeks,
  groupNames,
  dayModel,
}: {
  microcycle_id: string;
  /** Microciclo template name (for the "Asignar a atleta" modal). */
  name?: string;
  weeks: MicroWeek[];
  /** methodology_group_id → coach label (agnostic) for the per-block group tag. */
  groupNames: Record<number, string>;
  /** DÍA zoom level: the open day's editor model (`?dia=N`). null = full week. */
  dayModel?: DayEditorModel | null;
}) {
  const router = useRouter();
  const [focusIndex, setFocusIndex] = useState(0);
  // When a day is open, the focused week is dictated by the URL (the day's week),
  // not the local stepper — so the master-detail always shows the right week.
  const effectiveFocusIndex = dayModel ? dayModel.week_index : focusIndex;
  // Active day within the focused week (0=Mon … 6=Sun), or null in the full week.
  const activeDayIndex = dayModel ? dayModel.day_of_week - 1 : null;
  const focus = useMemo(
    () => weeks[effectiveFocusIndex] ?? weeks[0] ?? null,
    [weeks, effectiveFocusIndex],
  );
  const focusModalities = useMemo(
    () => (focus ? weekModalities(focus.days) : []),
    [focus],
  );

  // ── View-transition soft-nav ────────────────────────────────────────────
  // Wrap the `?dia` push in document.startViewTransition so the canvas morphs
  // as one surface. The new snapshot must wait for the server-driven dayModel
  // to commit, so the VT callback returns a promise we resolve from an effect
  // keyed on the day identity (with a safety timeout so it can never hang).
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
          // Never hang if the target render doesn't change the day key.
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


  if (weeks.length === 0) {
    return (
      <EmptyState
        icon="calendar_view_week"
        title="Microciclo sin semanas"
        description="Este microciclo aún no tiene semanas definidas."
      />
    );
  }

  // Day editor offset: continuous day index across the microcycle.
  const dayBase = effectiveFocusIndex * 7;

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper header — actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{weeks.length}</span>&nbsp;semanas
        </Pill>
        <button
          type="button"
          onClick={addWeek}
          disabled={addingWeek}
          title="Añade una semana vacía al final del microciclo"
          className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
        >
          <MIcon name={addingWeek ? 'progress_activity' : 'add'} size={15} />
          {addingWeek ? 'Añadiendo…' : 'Añadir semana'}
        </button>
        {/* This is a LIBRARY template (no athlete in scope) — "publishing" a
            microciclo happens per-athlete. Assigning it to an athlete (in draft)
            is the real delivery step; the coach then publishes from the athlete's
            plan. So this opens the assign flow, never a (non-existent) template
            publish. */}
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          title="Asigna este microciclo a un atleta (en borrador)"
          className="v2-focus ml-auto inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          <MIcon name="assignment_ind" size={15} /> Asignar a atleta
        </button>
      </div>

      {/* Week-step cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weeks.map((w, i) => {
          const active = i === effectiveFocusIndex;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setFocusIndex(i);
                // If a day is open, switching weeks closes it (back to the full
                // week of the chosen step), collapsing the editor on the way out.
                if (dayModel) closeDay();
              }}
              aria-pressed={active}
              className={cn(
                'v2-focus flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)] p-2.5 text-left transition-colors',
                active
                  ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
                  : 'border-[color:var(--v2-border)] hover:border-[color:var(--v2-border-strong)]',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: active ? 'var(--v2-accent)' : 'var(--v2-faint)',
                  }}
                />
                <span className="text-xs font-bold text-[color:var(--v2-fg)]">S{i + 1}</span>
                <span className="truncate text-[10px] text-[color:var(--v2-muted)]">
                  {w.label}
                </span>
              </div>
              <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">
                {w.session_count} ses
              </span>
            </button>
          );
        })}
      </div>

      {/* Focused week — full-width weekly calendar */}
      <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
        {/* Week toolbar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-bold text-[color:var(--v2-fg)]">
            Semana {effectiveFocusIndex + 1}
            {focus?.label ? (
              <span className="ml-1.5 font-medium text-[color:var(--v2-muted)]">
                · {focus.label}
              </span>
            ) : null}
          </h2>

          {/* Honest week summary — real session count + the modalities the week
              actually covers. No fabricated load number. */}
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
                className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
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
              className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
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

          {/* Foco de la semana — the athlete-facing focus line for this week. */}
          {focus ? (
            <WeekFocusInput
              key={focus.id}
              weekId={focus.id}
              initial={focus.focus}
              onSaved={() => router.refresh()}
            />
          ) : null}
        </div>

        {/* The week grid. SEMANA (no `?dia`) = 7 equal rich day columns across the
            full width (the calendar, unchanged). Open a day → MASTER-DETAIL: a list
            of 7 compact day-cards (~30%) + the embedded editor (~70%). No fideos. */}

        {/* Desktop (lg+) */}
        {activeDayIndex !== null && dayModel ? (
          <div className="v2-stagger mt-3 hidden gap-3 lg:grid lg:min-h-[62vh] lg:grid-cols-[minmax(0,30%)_minmax(0,1fr)] lg:[grid-template-rows:minmax(0,1fr)]">
            {/* Master — vertical list of compact day-cards */}
            <div className="flex min-w-0 flex-col gap-2 overflow-y-auto pr-0.5">
              {(focus?.days ?? []).map((day, i) => (
                <DayCard
                  key={day.day_of_week}
                  day={day}
                  dayIndex={i}
                  href={dayCanvasHref(microcycle_id, dayBase + i)}
                  active={i === activeDayIndex}
                  onNavigate={navigate}
                />
              ))}
            </div>
            {/* Detail — the embedded day editor. Keyed on (week, day) so switching
                days in place REMOUNTS DayEditor (its local state seeds from the
                model on mount), instead of reusing a stale instance. */}
            <ActiveDayColumn
              key={`${dayModel.week_index}-${dayModel.day_of_week}`}
              microcycleId={microcycle_id}
              dayModel={dayModel}
              onBack={closeDay}
            />
          </div>
        ) : (
          <div className="mt-3 hidden gap-2 lg:grid lg:min-h-[62vh] lg:grid-cols-7 lg:[grid-template-rows:minmax(0,1fr)]">
            {(focus?.days ?? []).map((day, i) => (
              <DayColumn
                key={day.day_of_week}
                day={day}
                dayIndex={i}
                href={dayCanvasHref(microcycle_id, dayBase + i)}
                groupNames={groupNames}
                onNavigate={navigate}
                carryMorphName={i === collapseDay}
              />
            ))}
          </div>
        )}

        {/* Mobile (<lg) — stacks: full week = card grid; open day = a top day
            switcher strip (the rail, horizontal) + the editor below. */}
        <div className="mt-3 lg:hidden">
          {activeDayIndex !== null && dayModel ? (
            <div className="flex flex-col gap-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {(focus?.days ?? []).map((day, i) => {
                  const isActive = i === activeDayIndex;
                  const dayHref = isActive
                    ? `/microciclos/${microcycle_id}`
                    : dayCanvasHref(microcycle_id, dayBase + i);
                  return (
                    <Link
                      key={day.day_of_week}
                      href={dayHref}
                      scroll={false}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
                          return;
                        if (!vtEnabled()) return;
                        e.preventDefault();
                        if (isActive) closeDay();
                        else navigate(dayHref);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={DAY_LABELS_FULL[i]}
                      className={cn(
                        'v2-focus flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--v2-r-s)] border text-[12px] font-bold transition-colors',
                        // The active day-pill slides between days like the desktop highlight.
                        isActive && 'vt-active-day',
                        isActive
                          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)]'
                          : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)]',
                      )}
                    >
                      <span>{DAY_LABELS_SHORT[i]}</span>
                      {day.dominant ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: `var(${MODALITY_META[day.dominant].colorVar})` }}
                        />
                      ) : (
                        <span aria-hidden className="h-1.5 w-1.5" />
                      )}
                    </Link>
                  );
                })}
              </div>
              <ActiveDayColumn
                key={`${dayModel.week_index}-${dayModel.day_of_week}`}
                microcycleId={microcycle_id}
                dayModel={dayModel}
                onBack={closeDay}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(focus?.days ?? []).map((day, i) => (
                <DayColumn
                  key={day.day_of_week}
                  day={day}
                  dayIndex={i}
                  href={dayCanvasHref(microcycle_id, dayBase + i)}
                  groupNames={groupNames}
                  onNavigate={navigate}
                  carryMorphName={i === collapseDay}
                />
              ))}
            </div>
          )}
        </div>
      </section>

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
    </div>
  );
}
