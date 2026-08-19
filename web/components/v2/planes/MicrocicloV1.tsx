'use client';

// Screen 7 · V1 "Vista general · 4 semanas". The classic week×day grid: a header
// row (semana↓ / día→), then one row per week — a left meta cell (week label +
// descriptor + "⎘ duplicar") and 7 day cells (mini session chips with modality
// left-border, or "+"/"descanso"). Day chip → /microciclos/[id]?dia=[idx]
// (the DÍA zoom level of the same canvas — in-place, no navigation).

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import {
  DAY_LABELS_FULL,
  dayCanvasHref,
  duplicateWeekInMonth,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { MODALITY_META } from '@/components/v2/constants';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { DeleteWeekModal } from '@/components/v2/planes/DeleteWeekModal';

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
  // Un día sin sesiones en una PLANTILLA está VACÍO (sin rellenar), no es un
  // descanso: el descanso es una decisión del coach y aquí no hay dato que lo
  // diga. Misma palabra que el carril del editor en foco, que ya decía «vacío».
  const vacio = day.session_count === 0;

  if (vacio || !mod) {
    return (
      <Link
        href={href}
        scroll={false}
        aria-label={`${DAY_LABELS_FULL[dayIndex]} · añadir sesión`}
        className="v2-focus group/dia flex min-h-[84px] items-center justify-center gap-1.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        {vacio ? (
          <>
            <MIcon
              name="add"
              size={15}
              className="opacity-0 transition-opacity group-hover/dia:opacity-100"
            />
            <span className="text-label font-semibold">vacío</span>
          </>
        ) : (
          <MIcon name="add" size={18} />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${DAY_LABELS_FULL[dayIndex]} · ${MODALITY_META[mod].label}`}
      className="v2-focus flex min-h-[84px] flex-col gap-1 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5 transition-colors hover:border-[color:var(--v2-border-strong)]"
      style={{ borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[mod].colorVar})` }}
    >
      <span
        className="truncate text-label font-bold"
        style={{ color: `var(${MODALITY_META[mod].colorVar})` }}
      >
        {MODALITY_META[mod].label}
      </span>
      <span className="v2-num mt-auto text-eyebrow text-[color:var(--v2-faint)]">
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
  const router = useRouter();
  // Per-row in-flight week id (so only the duplicated row spins) + honest error.
  const [busyWeekId, setBusyWeekId] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  // Semana a borrar (abre el modal de confirmación) — null = cerrado.
  const [deletingWeek, setDeletingWeek] = useState<{ id: string; label: string } | null>(null);

  // Duplica esa semana (clon puro enganchado justo después) reusando la MISMA
  // ruta/lógica que el editor de semana en foco. router.refresh() re-deriva la
  // rejilla del servidor con la copia ya insertada.
  const duplicateWeek = async (weekId: string) => {
    if (busyWeekId) return;
    setBusyWeekId(weekId);
    setErrored(false);
    try {
      await duplicateWeekInMonth(microcycle_id, weekId);
      router.refresh();
    } catch {
      setErrored(true);
    } finally {
      setBusyWeekId(null);
    }
  };

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
        {errored ? (
          <span className="text-label font-semibold text-[color:var(--v2-danger)]">
            No se pudo duplicar la semana. Inténtalo de nuevo.
          </span>
        ) : null}
        {/* No publish here: this is the LIBRARY template editor (no athlete in
            scope). Publishing is athlete-scoped and lives in the athlete PlanTab. */}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
        <div className="min-w-[820px]">
          {/* Day-header row */}
          <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] gap-2.5 border-b border-[color:var(--v2-border)] px-3 py-2.5">
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
              className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] items-stretch gap-2.5 border-b border-[color:var(--v2-border)] px-3 py-2.5 last:border-b-0"
            >
              {/* Left meta cell */}
              <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-body font-bold text-[color:var(--v2-fg)]">
                    Semana {wi + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => duplicateWeek(w.id)}
                      disabled={busyWeekId !== null}
                      title="Crea una copia idéntica de esta semana justo después"
                      aria-label={`Duplicar semana ${wi + 1}`}
                      className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-60"
                    >
                      <MIcon
                        name={busyWeekId === w.id ? 'progress_activity' : 'content_copy'}
                        size={14}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingWeek({ id: w.id, label: `Semana ${wi + 1}` })}
                      disabled={busyWeekId !== null}
                      title="Borra esta semana, para arreglar duplicados de más"
                      aria-label={`Borrar semana ${wi + 1}`}
                      className="v2-focus text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)] disabled:opacity-60"
                    >
                      <MIcon name="delete" size={14} />
                    </button>
                  </div>
                </div>
                <span className="truncate text-label text-[color:var(--v2-muted)]" title={w.label}>
                  {w.label}
                </span>
                <span className="v2-num mt-auto text-label font-semibold text-[color:var(--v2-faint)]">
                  {w.session_count} {w.session_count === 1 ? 'sesión' : 'sesiones'}
                </span>
              </div>

              {/* Day cells */}
              {w.days.map((day, di) => (
                <DayChip
                  key={day.day_of_week}
                  day={day}
                  dayIndex={di}
                  href={dayCanvasHref(microcycle_id, wi * 7 + di)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {deletingWeek ? (
        <DeleteWeekModal
          microcycleId={microcycle_id}
          weekId={deletingWeek.id}
          label={deletingWeek.label}
          onClose={() => setDeletingWeek(null)}
        />
      ) : null}
    </div>
  );
}
