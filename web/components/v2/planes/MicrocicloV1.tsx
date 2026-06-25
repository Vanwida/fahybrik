'use client';

// Screen 7 · V1 "Vista general · 4 semanas". The classic week×day grid: a header
// row (semana↓ / día→), then one row per week — a left meta cell (week label +
// descriptor + load bar + "⎘ duplicar") and 7 day cells (mini session chips with
// modality left-border, or "+"/"descanso"). The load bars across the rows trace
// the entrada→carga→pico→descarga ramp. Day chip → /v2/microciclos/[id]/dia/[idx].

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { LoadBar } from '@/components/v2/planes/parts';
import {
  DAY_LABELS_FULL,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { MODALITY_META } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';

const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

function DayChip({
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

  if (rest || !mod) {
    return (
      <Link
        href={href}
        aria-label={`${DAY_LABELS_FULL[dayIndex]} · añadir sesión`}
        className="v2-focus flex min-h-[52px] items-center justify-center rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        {rest ? (
          <span className="text-[10px] font-semibold">descanso</span>
        ) : (
          <MIcon name="add" size={16} />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`${DAY_LABELS_FULL[dayIndex]} · ${MODALITY_META[mod].label}`}
      className="v2-focus flex min-h-[52px] flex-col gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-1.5 transition-colors hover:border-[color:var(--v2-border-strong)]"
      style={{ borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[mod].colorVar})` }}
    >
      <span
        className="truncate text-[10px] font-bold"
        style={{ color: `var(${MODALITY_META[mod].colorVar})` }}
      >
        {MODALITY_META[mod].label}
      </span>
      <span className="v2-num mt-auto text-[9px] text-[color:var(--v2-faint)]">
        {day.session_count > 1 ? `${day.session_count} ses · ` : ''}
        {day.block_count} bl
      </span>
    </Link>
  );
}

export function MicrocicloV1({
  microcycle_id,
  weeks,
}: {
  microcycle_id: string;
  weeks: MicroWeek[];
}) {
  if (weeks.length === 0) {
    return (
      <EmptyState
        icon="grid_view"
        title="Microciclo sin semanas"
        description="Este microciclo aún no tiene semanas definidas."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral" variant="soft">
          <span className="v2-num">{weeks.length}</span>&nbsp;semanas
        </Pill>
        <button
          type="button"
          // TODO(endpoint): wire to assign-to-athlete.
          className="v2-focus inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="person_add" size={15} /> Asignar
        </button>
        <button
          type="button"
          // TODO(endpoint): wire to publish.
          className="v2-focus ml-auto inline-flex h-8 items-center gap-1 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          Publicar <MIcon name="arrow_forward" size={15} />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
        <div className="min-w-[820px]">
          {/* Day-header row */}
          <div className="grid grid-cols-[160px_repeat(7,minmax(0,1fr))] gap-2 border-b border-[color:var(--v2-border)] px-3 py-2">
            <span className="v2-micro flex items-end">semana ↓ / día →</span>
            {DAY_HEADERS.map((d) => (
              <span key={d} className="v2-micro text-center">
                {d}
              </span>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((w, wi) => (
            <div
              key={w.id}
              className="grid grid-cols-[160px_repeat(7,minmax(0,1fr))] items-stretch gap-2 border-b border-[color:var(--v2-border)] px-3 py-2 last:border-b-0"
            >
              {/* Left meta cell */}
              <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-[color:var(--v2-fg)]">
                    Semana {wi + 1}
                  </span>
                  <button
                    type="button"
                    // TODO(endpoint): wire to week-duplicate.
                    aria-label={`Duplicar semana ${wi + 1}`}
                    className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
                  >
                    <MIcon name="content_copy" size={14} />
                  </button>
                </div>
                <span className="truncate text-[10px] text-[color:var(--v2-muted)]" title={w.label}>
                  {w.label}
                </span>
                {w.load ? (
                  <>
                    <LoadBar load={w.load} className="mt-auto" />
                    <span className="text-[9px] font-semibold text-[color:var(--v2-faint)]">
                      {w.load.label}
                    </span>
                  </>
                ) : null}
              </div>

              {/* Day cells */}
              {w.days.map((day, di) => (
                <DayChip
                  key={day.day_of_week}
                  day={day}
                  dayIndex={di}
                  href={`/microciclos/${microcycle_id}/dia/${wi * 7 + di}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
