'use client';

// TriageStrip — la franja de triage sobre el roster (rediseño FLEXR: el roster
// es la casa y el triage es una FRANJA encima, no la casa). Resume lo que /hoy
// desglosa: las 4 bandejas con nombres, más las altas y las propuestas
// pendientes. «Resolver» aterriza en /hoy, que sigue siendo la cola completa.
// El conteo de decisiones es EL MISMO que el titular de /hoy (se calcula en el
// servidor con buildHoyLanes + las mismas fuentes); si no hay nada, la franja
// no aparece: la calma no ocupa sitio.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface TriageStripLane {
  /** Título de la bandeja tal como lo enseña /hoy («Falló sesiones»…). */
  title: string;
  /** Var CSS del dot de la bandeja (viene de V2Lane.dot_var). */
  dot_var: string;
  count: number;
  /** Nombres de pila para leer personas, no números: «Jordi, Iván y 2 más». */
  names_label: string;
}

export interface TriageStripData {
  /** Total de decisiones — el MISMO número que el titular de /hoy. */
  pendientes: number;
  /** Bandejas con contenido (count > 0), en el orden de /hoy. */
  lanes: TriageStripLane[];
  /** Altas sin revisar (intake) — van a /altas. */
  altas: number;
  /** Propuestas pendientes (nivel, asignación, siguiente microciclo, ajuste). */
  propuestas: number;
}

function LaneChip({ lane }: { lane: TriageStripLane }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-body text-[color:var(--v2-fg)]">
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: `var(${lane.dot_var})` }}
      />
      <span className="min-w-0 truncate">
        <span className="v2-num font-semibold">{lane.count}</span> {lane.title.toLowerCase()}
        {lane.names_label ? (
          <span className="text-[color:var(--v2-muted)]"> · {lane.names_label}</span>
        ) : null}
      </span>
    </span>
  );
}

export function TriageStrip({ data }: { data: TriageStripData }) {
  if (data.pendientes <= 0) return null;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)]',
        'bg-[color:var(--v2-surface)] px-4 py-2.5 shadow-[var(--v2-shadow-card)]',
      )}
    >
      <span className="shrink-0 text-body font-semibold text-[color:var(--v2-fg)]">
        Hoy · <span className="v2-num">{data.pendientes}</span>{' '}
        {data.pendientes === 1 ? 'decisión' : 'decisiones'}
      </span>
      <span aria-hidden className="hidden h-4 w-px bg-[color:var(--v2-border)] sm:block" />
      {data.lanes.map((lane) => (
        <LaneChip key={lane.title} lane={lane} />
      ))}
      {data.altas > 0 ? (
        <Link
          href="/altas"
          className="v2-focus flex items-center gap-1.5 rounded-[var(--v2-r-pill)] text-body text-[color:var(--v2-fg)] hover:text-[color:var(--v2-muted)]"
        >
          <MIcon name="how_to_reg" size={15} className="text-[color:var(--v2-info)]" />
          <span>
            <span className="v2-num font-semibold">{data.altas}</span>{' '}
            {data.altas === 1 ? 'alta sin revisar' : 'altas sin revisar'}
          </span>
        </Link>
      ) : null}
      {data.propuestas > 0 ? (
        <span className="flex items-center gap-1.5 text-body text-[color:var(--v2-fg)]">
          <MIcon name="tips_and_updates" size={15} className="text-[color:var(--v2-muted)]" />
          <span>
            <span className="v2-num font-semibold">{data.propuestas}</span>{' '}
            {data.propuestas === 1 ? 'propuesta' : 'propuestas'}
          </span>
        </span>
      ) : null}
      <Link
        href="/hoy"
        className="v2-focus ml-auto inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 py-1.5 text-label font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
      >
        Resolver
        <MIcon name="arrow_forward" size={14} />
      </Link>
    </div>
  );
}
