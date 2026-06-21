'use client';

// Screen 7 · V2 "Editor · semana en foco". A week-step header (one card per week:
// dot + "Sk · etiqueta" + N ses + load bar; selected = accent ring) over the
// focused week expanded into 7 day columns. Each day shows its session cards
// (modality left-border, → links to the day editor) or a dashed "+". A right rail
// summarizes the week and offers draggable library mini-blocks.

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { Pill } from '@/components/v2/Pill';
import { StatTile } from '@/components/v2/StatTile';
import { EmptyState } from '@/components/v2/EmptyState';
import { LoadBar, ModalityDot } from '@/components/v2/planes/parts';
import {
  DAY_LABELS_SHORT,
  DAY_LABELS_FULL,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { MODALITY_META } from '@/components/v2/constants';
import type { MicroLibraryItem, MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { cn } from '@/lib/utils';

function DayCell({
  day,
  dayIndex,
  href,
}: {
  day: DayModalityInfo;
  dayIndex: number;
  href: string;
}) {
  const mod = day.dominant;
  const rest = day.session_count === 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
          {DAY_LABELS_SHORT[dayIndex]}
        </span>
        {day.session_count > 1 ? (
          <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">
            {day.session_count}
          </span>
        ) : null}
      </div>

      {rest || !mod ? (
        <Link
          href={href}
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · añadir sesión`}
          className="v2-focus flex min-h-[68px] flex-col items-center justify-center rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="add" size={18} />
        </Link>
      ) : (
        <Link
          href={href}
          aria-label={`${DAY_LABELS_FULL[dayIndex]} · ${MODALITY_META[mod].label}`}
          className="v2-focus flex min-h-[68px] flex-col gap-1 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2 transition-colors hover:border-[color:var(--v2-border-strong)]"
          style={{ borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[mod].colorVar})` }}
        >
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
          <span className="v2-num mt-auto text-[10px] text-[color:var(--v2-faint)]">
            {day.block_count} bl
          </span>
        </Link>
      )}
    </div>
  );
}

export function MicrocicloV2({
  microcycle_id,
  weeks,
  library,
}: {
  microcycle_id: string;
  weeks: MicroWeek[];
  library: MicroLibraryItem[];
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  const focus = useMemo(() => weeks[focusIndex] ?? weeks[0] ?? null, [weeks, focusIndex]);

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
  const prevLabel = focusIndex > 0 ? `S${focusIndex}` : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper header — actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{weeks.length}</span>&nbsp;semanas
        </Pill>
        <button
          type="button"
          // TODO(endpoint): wire to the assign-to-athlete action.
          className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="person_add" size={15} /> Asignar a atleta
        </button>
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

      {/* Focused week + right rail */}
      <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-[minmax(0,1fr)_230px]">
        <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
          {/* Week toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-[color:var(--v2-fg)]">
              Semana {focusIndex + 1}
              {focus?.label ? (
                <span className="ml-1.5 font-medium text-[color:var(--v2-muted)]">
                  · {focus.label}
                </span>
              ) : null}
            </h2>
            <div className="ml-auto flex items-center gap-1.5">
              {prevLabel ? (
                <button
                  type="button"
                  // TODO(endpoint): wire "copiar +5%" to the week-duplicate-with-progression action.
                  className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
                >
                  <MIcon name="content_copy" size={14} /> copiar {prevLabel} +5%
                </button>
              ) : null}
              <button
                type="button"
                className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-[11px] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
              >
                <MIcon name="add" size={14} /> desde plantilla
              </button>
            </div>
          </div>

          {/* 7 day columns */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(focus?.days ?? []).map((day, i) => (
              <DayCell
                key={day.day_of_week}
                day={day}
                dayIndex={i}
                href={`/v2/microciclos/${microcycle_id}/dia/${dayBase + i}`}
              />
            ))}
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex flex-col gap-2.5">
          <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
            <h3 className="v2-micro">Resumen semana {focusIndex + 1}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile label="Sesiones" value={focus?.session_count ?? 0} />
              <StatTile
                label="Carga"
                value={focus?.load?.label ?? '—'}
                tone={focus?.load?.stage === 'pico' ? 'accent' : 'fg'}
              />
            </div>
          </section>

          <section className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
            <h3 className="v2-micro">Biblioteca · arrastra</h3>
            {library.length === 0 ? (
              <p className="mt-2 text-[11px] text-[color:var(--v2-faint)]">
                Sin sesiones en la biblioteca.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {library.slice(0, 6).map((b) => (
                  <Link
                    key={b.id}
                    href={`/v2/biblioteca/sesion/${b.id}`}
                    className="v2-focus flex items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-1.5 transition-colors hover:border-[color:var(--v2-border-strong)]"
                    style={{
                      borderLeftWidth: '3px',
                      borderLeftColor: `var(${MODALITY_META[b.modality].colorVar})`,
                    }}
                  >
                    <ModalityDot modality={b.modality} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[color:var(--v2-fg)]">
                      {b.name}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
