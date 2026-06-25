'use client';

// Screen 7 · V2 "Editor · semana en foco". A week-step header (one card per week:
// dot + "Sk · etiqueta" + N ses + load bar; selected = accent ring) over the
// focused week laid out as a full-height weekly calendar: 7 day COLUMNS across
// the full width (no side rail), each stretched to fill the viewport so the plan
// reads at a glance with no dead void. Every column shows its REAL content stacked
// top→bottom — the day's blocks, each with a modality color, title, agnostic group
// tag and the real exercise/dose lines (rendered from prescription_json). A
// coach-placed rest day reads "Descanso"; a fully empty day shows the dashed add
// affordance. Clicking a column opens that day's editor.

import { useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { LoadBar } from '@/components/v2/planes/parts';
import {
  DAY_LABELS_FULL,
  type DayBlockInfo,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { CopyWeekModal } from '@/components/v2/planes/CopyWeekModal';
import { cn } from '@/lib/utils';

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
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
  groupNames: Record<number, string>;
}) {
  const mod = day.dominant;
  const isWorkout = day.session_count > 0 && !!mod;
  const blocks = isWorkout ? dayBlocks(day) : [];
  const headline = isWorkout ? dayHeadline(day) : null;

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
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · ${MODALITY_META[mod].label} · ${day.block_count} bloques`}
          className={cn(
            baseCard,
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
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · descanso`}
          className={cn(
            baseCard,
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
        aria-label={`${DAY_LABELS_FULL[dayIndex]} · añadir sesión`}
        className={cn(
          baseCard,
          'items-center justify-center border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
        )}
      >
        <MIcon name="add" size={20} />
        <span className="text-[10px] font-medium">Añadir</span>
      </Link>
    </div>
  );
}

export function MicrocicloV2({
  microcycle_id,
  weeks,
  groupNames,
}: {
  microcycle_id: string;
  weeks: MicroWeek[];
  /** methodology_group_id → coach label (agnostic) for the per-block group tag. */
  groupNames: Record<number, string>;
}) {
  const router = useRouter();
  const [focusIndex, setFocusIndex] = useState(0);
  const focus = useMemo(() => weeks[focusIndex] ?? weeks[0] ?? null, [weeks, focusIndex]);
  const focusModalities = useMemo(
    () => (focus ? weekModalities(focus.days) : []),
    [focus],
  );

  // Duplicar la semana en foco: clon puro (sin progresión) enganchado justo
  // después de ésta. Al volver, deja al coach EN la copia (índice + 1).
  const [duplicating, setDuplicating] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const duplicateWeek = async () => {
    if (!focus || duplicating) return;
    setDuplicating(true);
    try {
      const res = await fetch(
        `/api/coach/program-months/${microcycle_id}/weeks/${focus.id}/duplicate`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) return;
      const next = focusIndex + 1;
      router.refresh();
      setFocusIndex(next);
    } finally {
      setDuplicating(false);
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
  const dayBase = focusIndex * 7;

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper header — actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{weeks.length}</span>&nbsp;semanas
        </Pill>
        <button
          type="button"
          // TODO(endpoint): wire to the microcycle publish mutation.
          className="v2-focus ml-auto inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          Publicar <MIcon name="arrow_forward" size={15} />
        </button>
      </div>

      {/* Week-step cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weeks.map((w, i) => {
          const active = i === focusIndex;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setFocusIndex(i)}
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
              {w.load ? <LoadBar load={w.load} /> : null}
            </button>
          );
        })}
      </div>

      {/* Focused week — full-width weekly calendar */}
      <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
        {/* Week toolbar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-bold text-[color:var(--v2-fg)]">
            Semana {focusIndex + 1}
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
        </div>

        {/* 7 day columns — stretched to fill the viewport (no dead void below). */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-h-[62vh] lg:grid-cols-7 lg:[grid-template-rows:minmax(0,1fr)]">
          {(focus?.days ?? []).map((day, i) => (
            <DayColumn
              key={day.day_of_week}
              day={day}
              dayIndex={i}
              href={`/microciclos/${microcycle_id}/dia/${dayBase + i}`}
              groupNames={groupNames}
            />
          ))}
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
    </div>
  );
}
