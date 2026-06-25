'use client';

// Zoom MES de la ficha del atleta — el PUENTE entre la Semana y el Macro: las
// semanas del BLOQUE ACTUAL como filas escaneables (modelo training-log, mismo
// lenguaje visual que AthleteWeekCalendar). Cada fila = una semana del bloque:
// barra de estado a altura completa · rango de fechas + "sem X de N" · resumen
// de sesiones (hechas/programadas) · cumplimiento % · estado (Hecha / En curso /
// Planificada / Borrador). La semana en curso marcada en acento. Click en fila →
// salta a Semana en esa fecha. NINGÚN dato anclado al borde derecho muerto.

import type { Roadmap, RoadmapBlock, RoadmapWeek } from './block-roadmap';
import { WEEK_STATE_LABEL, weekRangeLabel, weekStateTone } from './block-roadmap';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/ui/MIcon';

interface AthleteBlockMonthProps {
  roadmap: Roadmap;
  /** Click en una semana → cambia a Semana anclada a esa fecha. */
  onOpenWeek: (weekStartIso: string) => void;
}

function complianceTone(pct: number): string {
  if (pct >= 80) return 'text-[color:var(--status-success)]';
  if (pct >= 50) return 'text-[color:var(--status-warning)]';
  return 'text-[color:var(--danger)]';
}

export function AthleteBlockMonth({ roadmap, onOpenWeek }: AthleteBlockMonthProps) {
  // El bloque a mostrar: el actual (contiene hoy) o, fuera del macrociclo, el
  // primero asignado — para que el Mes nunca quede vacío teniendo plan.
  const block =
    roadmap.currentBlock ?? roadmap.blocks.find((b) => b.is_assigned) ?? roadmap.blocks[0] ?? null;

  if (!block || block.weeks.length === 0) {
    return (
      <div className="rounded-[var(--r-l)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-10 text-center">
        <p className="font-heading uppercase text-[color:var(--fg)]">Bloque sin semanas</p>
        <p className="mt-1.5 text-sm text-[color:var(--text-muted)]">
          Este bloque aún no tiene semanas materializadas. Prográmalo desde Macro.
        </p>
      </div>
    );
  }

  return (
    <section aria-label={`Semanas del bloque ${block.phase_label}`} className="flex flex-col gap-3">
      <MonthHeader block={block} />
      <div className="overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]">
        {block.weeks.map((week, i) => (
          <WeekRow
            key={week.microcycle_id}
            block={block}
            week={week}
            withDivider={i > 0}
            onOpenWeek={onOpenWeek}
          />
        ))}
      </div>
    </section>
  );
}

// Cabecera del bloque: fase + rango + progreso de semanas completadas. Todo
// izq→dcha, sin justify-between con hueco muerto (§11).
function MonthHeader({ block }: { block: RoadmapBlock }) {
  const doneWeeks = block.weeks.filter((w) => w.state === 'hecha').length;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="font-heading uppercase text-[color:var(--fg)]">{block.phase_label}</h3>
      <span aria-hidden className="text-[color:var(--tertiary)]">
        ·
      </span>
      <span className="micro-label">{block.weeks.length} semanas del bloque</span>
      <span aria-hidden className="text-[color:var(--tertiary)]">
        ·
      </span>
      <span className="text-xs text-[color:var(--text-muted)]">
        <span className="metric-num font-semibold text-[color:var(--fg)]">
          {doneWeeks}/{block.weeks.length}
        </span>{' '}
        completadas
      </span>
    </div>
  );
}

// Una fila = una SEMANA del bloque. Mismo esqueleto que el row de día de
// AthleteWeekCalendar: barra de estado a altura completa + columna de fecha a la
// izq + cuerpo (resumen) + cumplimiento + estado + chevron. Fila clicable → Semana.
function WeekRow({
  block,
  week,
  withDivider,
  onOpenWeek,
}: {
  block: RoadmapBlock;
  week: RoadmapWeek;
  withDivider: boolean;
  onOpenWeek: (weekStartIso: string) => void;
}) {
  const tone = weekStateTone(week.state);
  const open = () => onOpenWeek(week.week_start);

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Semana ${week.block_week} de ${block.week_count} · ${weekRangeLabel(week.week_start, week.week_end)} · ${WEEK_STATE_LABEL[week.state]}. Abrir la semana`}
      className={cn(
        'focus-ring group/row relative flex min-h-[64px] w-full cursor-pointer items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors hover:bg-[color:var(--surface-container-low)]',
        withDivider && 'border-t border-[color:var(--border-subtle)]',
        week.is_current && 'bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)]',
      )}
    >
      {/* Barra de estado a altura completa (overlay de cumplimiento). */}
      <span
        aria-hidden
        className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-[2px]"
        style={{ backgroundColor: tone }}
      />

      {/* Columna fija: nº de semana del bloque + rango. EN CURSO en acento. */}
      <div className="flex w-[6.5rem] shrink-0 flex-col justify-center gap-0.5">
        <span
          className={cn(
            'micro-label leading-none',
            week.is_current ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]',
          )}
        >
          Sem {week.block_week}/{block.week_count}
        </span>
        <span className="metric-num text-[11px] font-semibold text-[color:var(--fg)]">
          {weekRangeLabel(week.week_start, week.week_end)}
        </span>
      </div>

      {/* Cuerpo: resumen de sesiones (hechas/programadas) + estado en palabras. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="micro-label">
          {week.scheduled > 0 ? (
            <>
              <span className="metric-num text-[color:var(--fg)]">
                {week.completed}/{week.scheduled}
              </span>{' '}
              {week.scheduled === 1 ? 'sesión' : 'sesiones'}
            </>
          ) : (
            'Sin sesiones'
          )}
        </span>
        <span
          className="text-[13px] font-semibold leading-snug"
          style={{ color: tone }}
        >
          {WEEK_STATE_LABEL[week.state]}
        </span>
      </span>

      {/* Cumplimiento % — el dato cuantitativo, NO anclado al borde (chevron lo
          sigue). "—" honesto cuando la semana aún no empezó. */}
      <span className="flex shrink-0 flex-col items-end gap-0.5 pr-1">
        <span className="micro-label tracking-[0.06em]">Cumpl.</span>
        {week.compliance_pct != null ? (
          <span className={cn('metric-num text-sm font-bold', complianceTone(week.compliance_pct))}>
            {week.compliance_pct}%
          </span>
        ) : (
          <span className="metric-num text-sm font-bold text-[color:var(--text-muted)]" aria-label="Sin datos aún">
            —
          </span>
        )}
      </span>

      <MIcon
        name="chevron_right"
        size={18}
        className="shrink-0 text-[color:var(--text-muted)] transition-colors group-hover/row:text-[color:var(--fg)]"
        aria-hidden
      />
    </button>
  );
}
