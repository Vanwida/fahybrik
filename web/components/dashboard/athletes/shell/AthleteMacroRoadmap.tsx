'use client';

// Zoom MACRO de la ficha del atleta — EL ROADMAP. Línea de tiempo ATR horizontal
// del macrociclo entero, anclada a la carrera: los bloques (Acumulación →
// Intensificación → Tapering) izq→dcha, dimensionados por nº de semanas; dentro
// de cada bloque, las semanas como celdas — PASADAS coloreadas por cumplimiento
// (la trayectoria histórica), la ACTUAL con marca "estás aquí", FUTURAS neutras
// (planificadas) y BORRADOR con su marca. La carrera ancla el final de la línea.
// Click en semana → Semana en esa fecha · click en bloque sin programar →
// "Programar bloque" (AssignFlow). Vocabulario del fundador: "bloque" + nombre
// de fase, NUNCA "microciclo".
//
// GATE ÚNICO: programar el próximo bloque SIEMPRE pasa por el flujo borrador→
// revisar→publicar (AssignFlow). El roadmap NO asigna en vivo: tanto el CTA de
// un bloque sin programar como el empty state "sin macrociclo" abren AssignFlow,
// el único camino canónico. Nada publica-en-vivo-con-push desde aquí.

import type { Roadmap, RoadmapBlock, RoadmapWeek } from './block-roadmap';
import {
  WEEK_STATE_LABEL,
  blockRangeLabel,
  blockWeekLabel,
  singleDateLabel,
  weekRangeLabel,
} from './block-roadmap';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';

interface RaceAnchor {
  name: string;
  days_until: number;
}

interface AthleteMacroRoadmapProps {
  roadmap: Roadmap;
  /** Fases de periodización del coach (0052) — alimenta la leyenda de fases. */
  coachPhases: ReadonlyArray<MethodologyPhase>;
  /** Carrera objetivo (header) — ancla del final de la línea. null → sin carrera. */
  race: RaceAnchor | null;
  /** Click en una semana → cambia a Semana anclada a esa fecha. */
  onOpenWeek: (weekStartIso: string) => void;
  /** Click en un bloque sin programar → abre el flujo "Programar bloque". */
  onProgramBlock: () => void;
}

// Relleno de una celda de semana según su estado/cumplimiento. PASADA: por
// cumplimiento (la trayectoria). ACTUAL: acento. FUTURA: superficie neutra.
// BORRADOR: trama de aviso (warning) tenue. Misma codificación que Mes.
function weekCellFill(week: RoadmapWeek): string {
  switch (week.state) {
    case 'en_curso':
      return 'bg-[color:var(--accent)]';
    case 'borrador':
      return 'bg-[color:color-mix(in_srgb,var(--status-warning)_22%,var(--surface-container-low))]';
    case 'planificada':
      return 'bg-[color:var(--surface-container-high)]';
    case 'hecha':
    default: {
      const pct = week.compliance_pct;
      if (pct == null) return 'bg-[color:var(--surface-container-high)]';
      if (pct >= 80) return 'bg-[color:var(--status-success)]';
      if (pct >= 50) return 'bg-[color:var(--status-warning)]';
      return 'bg-[color:var(--danger)]';
    }
  }
}

// Texto sobre la celda: legible sobre relleno saturado (hecha/actual) vs neutro.
function weekCellText(week: RoadmapWeek): string {
  if (week.state === 'en_curso') return 'text-[color:var(--accent-on)]';
  if (week.state === 'hecha' && week.compliance_pct != null) return 'text-[color:var(--bg)]';
  return 'text-[color:var(--text-muted)]';
}

export function AthleteMacroRoadmap({
  roadmap,
  coachPhases,
  race,
  onOpenWeek,
  onProgramBlock,
}: AthleteMacroRoadmapProps) {
  const { blocks, totalWeeks } = roadmap;

  if (blocks.length === 0) {
    return (
      <div className="rounded-[var(--r-l)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-10 text-center">
        <p className="font-heading uppercase text-[color:var(--fg)]">Sin macrociclo</p>
        <p className="mt-1.5 text-sm text-[color:var(--text-muted)]">
          Crea el macrociclo (objetivo + fechas) para ver el roadmap del atleta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Roadmap del macrociclo"
        className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5"
      >
        {/* Cabecera del roadmap: rango del macrociclo + total de semanas. */}
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-heading uppercase text-[color:var(--fg)]">Roadmap</h3>
          {roadmap.macrocycleStart && roadmap.macrocycleEnd ? (
            <>
              <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
              <span className="micro-label">
                {blockRangeLabel(roadmap.macrocycleStart, roadmap.macrocycleEnd)}
              </span>
            </>
          ) : null}
          <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
          <span className="text-xs text-[color:var(--text-muted)]">
            <span className="metric-num font-semibold text-[color:var(--fg)]">{totalWeeks}</span>{' '}
            {race ? 'semanas a competir' : 'semanas planificadas'}
          </span>
        </div>

        {/* La línea de tiempo: bloques izq→dcha dimensionados por nº de semanas,
            + el ancla de carrera al final. Scroll horizontal si no cabe — región
            enfocable por teclado. El padding vertical de la fila interna evita
            que el focus-ring/hover-scale de las celdas se recorten al borde. */}
        <div
          tabIndex={0}
          role="group"
          aria-label="Línea de tiempo del macrociclo (desplazable)"
          className="focus-ring overflow-x-auto rounded-[var(--r-s)]"
        >
          <div className="flex min-w-[680px] items-stretch gap-2 px-1 py-2">
            <div className="flex flex-1 items-stretch gap-2">
              {blocks.map((block) => (
                <BlockColumn
                  key={block.block_id}
                  block={block}
                  onOpenWeek={onOpenWeek}
                  onProgramBlock={onProgramBlock}
                />
              ))}
            </div>
            <RaceFlag race={race} fallbackDateIso={roadmap.macrocycleEnd} />
          </div>
        </div>

        <PhaseLegend roadmap={roadmap} coachPhases={coachPhases} />
        <Legend />
      </section>
    </div>
  );
}

// Una columna = un BLOQUE ATR. Ancho proporcional a sus semanas. Cabecera con
// nombre de fase + nº de semanas; cuerpo con las celdas de semana. Un bloque sin
// programar es clicable entero → "Programar bloque".
function BlockColumn({
  block,
  onOpenWeek,
  onProgramBlock,
}: {
  block: RoadmapBlock;
  onOpenWeek: (weekStartIso: string) => void;
  onProgramBlock: () => void;
}) {
  // flex-grow proporcional al nº de semanas → bloques anchos = más semanas.
  const grow = block.week_count > 0 ? block.week_count : 1;
  const unprogrammed = !block.is_assigned;

  return (
    <div
      className="flex flex-col"
      style={{ flexGrow: grow, flexBasis: 0 }}
    >
      {/* Cabecera de fase: badge de código + nombre + rango + nº de semanas. */}
      <div className="mb-1.5 flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'shrink-0 rounded-[var(--r-pill)] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]',
              block.phase_badge_class,
            )}
          >
            {block.type}
          </span>
          <span
            className={cn(
              'truncate text-[11px] font-bold uppercase tracking-[0.04em]',
              block.is_current ? 'text-[color:var(--accent)]' : 'text-[color:var(--fg)]',
            )}
          >
            {block.phase_label}
          </span>
        </div>
        <span className="micro-label leading-none">
          {block.week_count} {block.week_count === 1 ? 'semana' : 'semanas'} ·{' '}
          {blockRangeLabel(block.start_date, block.end_date)}
        </span>
      </div>

      {/* Cuerpo: las celdas de semana, o el CTA "Programar bloque" si no está
          asignado (un bloque planificado sin semanas materializadas). */}
      {unprogrammed && block.weeks.length === 0 ? (
        <button
          type="button"
          onClick={onProgramBlock}
          className="focus-ring group/prog flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-[var(--r-m)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 py-3 text-center transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border-subtle))] hover:bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]"
          aria-label={`Programar el bloque ${block.phase_label}`}
        >
          <MIcon
            name="event_repeat"
            size={18}
            className="text-[color:var(--text-muted)] transition-colors group-hover/prog:text-[color:var(--accent)]"
            aria-hidden
          />
          <span className="text-[10px] font-semibold leading-tight text-[color:var(--text-muted)] transition-colors group-hover/prog:text-[color:var(--fg)]">
            Programar bloque
          </span>
        </button>
      ) : (
        <div className="flex flex-1 items-stretch gap-1">
          {block.weeks.map((week) => (
            <WeekCell key={week.microcycle_id} block={block} week={week} onOpenWeek={onOpenWeek} />
          ))}
        </div>
      )}
    </div>
  );
}

// Una celda = una SEMANA. Relleno por estado/cumplimiento. La ACTUAL lleva la
// marca "estás aquí". Clicable → Semana en esa fecha. El % se imprime dentro
// cuando hay datos (trayectoria legible, no heatmap abstracto).
function WeekCell({
  block,
  week,
  onOpenWeek,
}: {
  block: RoadmapBlock;
  week: RoadmapWeek;
  onOpenWeek: (weekStartIso: string) => void;
}) {
  const fill = weekCellFill(week);
  const textTone = weekCellText(week);
  const title = `${blockWeekLabel(block, week)} · ${weekRangeLabel(week.week_start, week.week_end)} · ${WEEK_STATE_LABEL[week.state]}${week.compliance_pct != null ? ` · ${week.compliance_pct}% cumplido` : ''}`;

  return (
    <button
      type="button"
      onClick={() => onOpenWeek(week.week_start)}
      title={title}
      aria-label={`${title}. Abrir la semana`}
      className={cn(
        'group/cell focus-ring relative flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r-s)] px-1 py-2 transition-transform hover:z-10 hover:scale-[1.04]',
        fill,
        week.state === 'borrador' &&
          'border border-dashed border-[color:color-mix(in_srgb,var(--status-warning)_55%,transparent)]',
        week.is_current &&
          'ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--surface-card)]',
      )}
    >
      {/* Marca "estás aquí" sobre la semana actual. */}
      {week.is_current ? (
        <span className="absolute -top-[7px] left-1/2 flex -translate-x-1/2 items-center">
          <span aria-hidden className="size-2 rotate-45 rounded-[1px] bg-[color:var(--accent)]" />
        </span>
      ) : null}

      <span className={cn('metric-num text-[11px] font-bold leading-none', textTone)}>
        {week.block_week}
      </span>
      {week.compliance_pct != null ? (
        <span className={cn('metric-num text-[9px] font-semibold leading-none', textTone)}>
          {week.compliance_pct}%
        </span>
      ) : week.state === 'borrador' ? (
        <span className="text-[8px] font-bold uppercase tracking-[0.06em] text-[color:var(--status-warning)]">
          Borr.
        </span>
      ) : null}
    </button>
  );
}

// Ancla de carrera al final de la línea: bandera + nombre + cuenta atrás. Si no
// hay carrera objetivo, degrada al horizonte del macrociclo (fecha fin, sin
// countdown) para que la línea siga teniendo un destino.
function RaceFlag({
  race,
  fallbackDateIso,
}: {
  race: RaceAnchor | null;
  fallbackDateIso: string | null;
}) {
  const days = race ? (race.days_until <= 0 ? 0 : race.days_until) : null;
  return (
    <div className="flex w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] px-2 py-3 text-center">
      <MIcon name="flag" size={20} className="text-[color:var(--accent)]" aria-hidden />
      {race ? (
        <>
          <span className="text-[11px] font-bold uppercase leading-tight text-[color:var(--fg)]">
            {race.name}
          </span>
          <span className="flex items-baseline gap-1">
            <span className="metric-num text-lg font-bold leading-none text-[color:var(--accent)]">
              {days}
            </span>
            <span className="micro-label">{days === 1 ? 'día' : 'días'}</span>
          </span>
        </>
      ) : fallbackDateIso ? (
        <>
          <span className="text-[11px] font-bold uppercase leading-tight text-[color:var(--fg)]">
            Fin del plan
          </span>
          <span className="micro-label leading-tight">
            {singleDateLabel(fallbackDateIso)}
          </span>
        </>
      ) : (
        <span className="text-[11px] font-bold uppercase leading-tight text-[color:var(--text-muted)]">
          Sin carrera objetivo
        </span>
      )}
    </div>
  );
}

// Leyenda de FASES: refleja las fases reales del coach (su nombre + color del
// role), no un set fijo de 3. Se deriva de los bloques del roadmap (orden
// temporal, deduplicado por fase) para que la leyenda case EXACTAMENTE con lo
// pintado. Si el coach tiene fases configuradas que aún no aparecen en el
// macrociclo, se añaden al final (la rampa de fases completa del coach). Sin
// fases configuradas → solo las del roadmap (enum ATR legacy resuelto = hoy).
function PhaseLegend({
  roadmap,
  coachPhases,
}: {
  roadmap: Roadmap;
  coachPhases: ReadonlyArray<MethodologyPhase>;
}) {
  // Fases presentes en el roadmap, en orden temporal, deduplicadas por label.
  const seen = new Set<string>();
  const items: { label: string; color: string }[] = [];
  for (const b of roadmap.blocks) {
    if (seen.has(b.phase_label)) continue;
    seen.add(b.phase_label);
    items.push({ label: b.phase_label, color: b.phase_color });
  }
  // Fases del coach que aún no salen en el macrociclo (rampa completa del coach).
  for (const p of [...coachPhases].sort((a, c) => a.sequence_order - c.sequence_order)) {
    if (seen.has(p.label)) continue;
    seen.add(p.label);
    items.push({ label: p.label, color: p.color ?? 'var(--text-muted)' });
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[color:var(--border-subtle)] pt-3">
      <p className="micro-label mb-2">Fases</p>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-[3px]"
              style={{ background: it.color }}
            />
            <span className="text-[10px] text-[color:var(--text-muted)]">{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Leyenda de ESTADOS: los colores SIGNIFICAN algo (no heatmap mudo). Cumplimiento
// (hecha) · en curso · planificada · borrador.
function Legend() {
  const items: { label: string; className: string }[] = [
    { label: 'Cumplida ≥80%', className: 'bg-[color:var(--status-success)]' },
    { label: 'Parcial 50-79%', className: 'bg-[color:var(--status-warning)]' },
    { label: 'Baja <50%', className: 'bg-[color:var(--danger)]' },
    { label: 'En curso', className: 'bg-[color:var(--accent)]' },
    { label: 'Planificada', className: 'bg-[color:var(--surface-container-high)]' },
    {
      label: 'Borrador',
      className:
        'border border-dashed border-[color:color-mix(in_srgb,var(--status-warning)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_22%,var(--surface-container-low))]',
    },
  ];
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px]', it.className)} />
          <span className="text-[10px] text-[color:var(--text-muted)]">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
