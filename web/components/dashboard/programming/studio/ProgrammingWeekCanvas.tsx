'use client';

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import {
  blocksForSession,
  canAddSecondSession,
  dayHasAnySession,
  daySubtitle,
  isSecondSessionVisible,
  visibleSessionIndices,
} from '@/lib/dashboard/programming/day-composition';
import { dayLabel, type DayOfWeek } from '@/lib/dashboard/constants/calendar';
import type { SessionIndex, StudioSelection } from '@/lib/dashboard/programming/studio-types';
import { dropIdSession, sortIdPart } from '@/lib/dashboard/programming/studio-types';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';
import { AddBlockMenu } from '@/components/dashboard/programming/studio/AddBlockMenu';
import { AtrLegend } from '@/components/dashboard/programming/studio/AtrLegend';
import { DayPartCard } from '@/components/dashboard/programming/studio/DayPartCard';

interface ProgrammingWeekCanvasProps {
  slots: WeekSlots;
  selected: StudioSelection | null;
  secondaryExpanded: ReadonlySet<number>;
  /** Fase ATR activa del microciclo — alimenta el glosario inline. */
  phaseHint?: string | null;
  /**
   * Texto de orientación del board (p.ej. "Semana 2 del microciclo · ACC").
   * F14 (opción B): el board edita una PLANTILLA sin fecha de calendario real,
   * así que orientamos con la posición en el microciclo + fase, nunca con una
   * fecha inventada. La fecha real + "HOY" vive en la vista de la semana del
   * atleta / publicar (Fase 5), donde existe start_date.
   */
  weekContextLabel?: string | null;
  onSelectPart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
  onSelectItem: (selection: Extract<StudioSelection, { target: 'item' }>) => void;
  onRemovePart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
  onRemoveItem: (selection: Extract<StudioSelection, { target: 'item' }>) => void;
  onAddSecondSession: (dayOfWeek: number) => void;
  /** Abre la Biblioteca de bloques de Pablo para la sesión indicada. */
  onAddBlockFromLibrary: (dayOfWeek: number, sessionIndex: SessionIndex) => void;
  /** Crea un bloque a medida con el formato (preset) elegido. */
  onAddCustomBlock: (dayOfWeek: number, sessionIndex: SessionIndex, presetId: string) => void;
  /** Abre el modal Pablo IA para componer el día indicado. */
  onPabloIADay: (dayOfWeek: number, sessionIndex: SessionIndex) => void;
  /** F12 — duplica un bloque (copia tras el original en la misma sesión). */
  onDuplicatePart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
  /** F12 — duplica un día completo a otro día de la misma semana. */
  onDuplicateDay: (fromDayOfWeek: number, toDayOfWeek: number) => void;
}

function sessionLabel(idx: SessionIndex): string {
  if (idx === 0) return 'Entreno';
  if (idx === 1) return '2.º entreno';
  return `${idx + 1}.º entreno`;
}

export function ProgrammingWeekCanvas({
  slots,
  selected,
  secondaryExpanded,
  phaseHint,
  weekContextLabel,
  onSelectPart,
  onSelectItem,
  onRemovePart,
  onRemoveItem,
  onAddSecondSession,
  onAddBlockFromLibrary,
  onAddCustomBlock,
  onPabloIADay,
  onDuplicatePart,
  onDuplicateDay,
}: ProgrammingWeekCanvasProps) {
  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 py-2 snap-x snap-mandatory lg:snap-none">
      {phaseHint || weekContextLabel ? (
        <div className="mb-2 flex shrink-0 items-center gap-2">
          {phaseHint ? <AtrLegend activePhase={phaseHint} /> : null}
          {weekContextLabel ? (
            <span className="micro-label tracking-[0.12em]">{weekContextLabel}</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex h-full min-h-[min(720px,calc(100vh-8rem))] min-w-max gap-3">
        {slots.days.map((day, dayIndex) => {
          const dow = day.day_of_week as DayOfWeek;
          const label = dayLabel(dow);
          const dayActive = selected?.day_of_week === day.day_of_week;
          const subtitle = daySubtitle(day, secondaryExpanded);
          const secondaryVisible = isSecondSessionVisible(day, secondaryExpanded);
          const sessions = visibleSessionIndices(day, secondaryExpanded);
          const isRestDay = !dayHasAnySession(day);

          return (
            <div
              key={day.day_of_week}
              id={`day-col-${day.day_of_week}`}
              // Staggered entrance: one orchestrated reveal across the week
              // (shared .stagger-in primitive, reduced-motion aware).
              style={{ '--stagger-i': dayIndex } as React.CSSProperties}
              className={cn(
                // En <lg cada día ocupa ~85vw (el siguiente asoma para indicar
                // scroll) y se alinea al inicio con scroll-snap. En lg+ vuelve a
                // los 320px densos del board de escritorio (sin tocar desktop).
                'stagger-in flex h-full min-h-[640px] w-[85vw] max-w-[340px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-[color:var(--surface-container-lowest)] transition-colors duration-150 lg:w-[320px] lg:max-w-none',
                dayActive
                  ? 'border-[color:var(--accent)]/60'
                  : 'border-[color:var(--border-subtle)]',
                isRestDay && 'opacity-80',
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5">
                {/* Day label + CAPA-1 day intent (the day's logic, e.g. "Fuerza
                    inferior pesada"). The intent lives in day.focus / coach
                    notes; daySubtitle surfaces it (falling back to block count).
                    The day label is the column's identity — bold-italic display
                    so the week scans like a programmed instrument. */}
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate font-display text-[15px] font-bold italic uppercase leading-none tracking-tight',
                      dayActive ? 'text-[color:var(--accent)]' : 'text-[color:var(--fg)]',
                    )}
                  >
                    {label}
                  </span>
                  <span className="micro-label mt-1.5 block truncate normal-case tracking-[0.08em]">
                    {subtitle}
                  </span>
                </div>
                {!isRestDay ? (
                  <DuplicateDayMenu
                    fromDayOfWeek={day.day_of_week}
                    days={slots.days.map((d) => d.day_of_week)}
                    onDuplicate={(toDow) => onDuplicateDay(day.day_of_week, toDow)}
                  />
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-1.5">
                {sessions.map((sessionIndex) => {
                  const blocks = blocksForSession(day, sessionIndex);

                  return (
                    <DaySession
                      key={sessionIndex}
                      dayOfWeek={day.day_of_week}
                      sessionIndex={sessionIndex}
                      blocks={blocks}
                      showSessionLabel={secondaryVisible}
                      selected={selected}
                      onSelectPart={onSelectPart}
                      onSelectItem={onSelectItem}
                      onRemovePart={onRemovePart}
                      onRemoveItem={onRemoveItem}
                      onAddBlockFromLibrary={onAddBlockFromLibrary}
                      onAddCustomBlock={onAddCustomBlock}
                      onPabloIADay={onPabloIADay}
                      onDuplicatePart={onDuplicatePart}
                    />
                  );
                })}

                {canAddSecondSession(day, secondaryExpanded) ? (
                  <button
                    type="button"
                    onClick={() => onAddSecondSession(day.day_of_week)}
                    className="focus-ring flex h-9 w-full shrink-0 items-center justify-center gap-1 rounded-md border border-dashed border-[color:var(--border-subtle)] text-[10px] font-bold uppercase text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--primary-container)] hover:text-[color:var(--primary-container)]"
                  >
                    <span className="text-base leading-none">+</span>
                    <span>2.º entreno</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DaySessionProps {
  dayOfWeek: number;
  sessionIndex: SessionIndex;
  blocks: ReturnType<typeof blocksForSession>;
  showSessionLabel: boolean;
  selected: StudioSelection | null;
  onSelectPart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
  onSelectItem: (selection: Extract<StudioSelection, { target: 'item' }>) => void;
  onRemovePart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
  onRemoveItem: (selection: Extract<StudioSelection, { target: 'item' }>) => void;
  onAddBlockFromLibrary: (dayOfWeek: number, sessionIndex: SessionIndex) => void;
  onAddCustomBlock: (dayOfWeek: number, sessionIndex: SessionIndex, presetId: string) => void;
  onPabloIADay: (dayOfWeek: number, sessionIndex: SessionIndex) => void;
  onDuplicatePart: (selection: Extract<StudioSelection, { target: 'part' }>) => void;
}

/**
 * Una sesión dentro de una columna de día. Es un droppable a nivel sesión
 * (F13): se puede soltar un bloque arrastrado de otro día aquí, incluso si la
 * sesión está vacía.
 */
function DaySession({
  dayOfWeek,
  sessionIndex,
  blocks,
  showSessionLabel,
  selected,
  onSelectPart,
  onSelectItem,
  onRemovePart,
  onRemoveItem,
  onAddBlockFromLibrary,
  onAddCustomBlock,
  onPabloIADay,
  onDuplicatePart,
}: DaySessionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropIdSession(dayOfWeek, sessionIndex),
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-1.5 rounded-md transition-colors duration-150',
        isOver &&
          'bg-[color:var(--accent)]/10 ring-2 ring-inset ring-[color:var(--accent)]/60',
      )}
    >
      {showSessionLabel ? (
        <span className="micro-label px-0.5 tracking-[0.12em]">
          {sessionLabel(sessionIndex)}
        </span>
      ) : null}

      {blocks.length === 0 ? (
        <p
          className={cn(
            'px-1 py-2 text-[10px] transition-colors',
            isOver
              ? 'font-bold uppercase tracking-wider text-[color:var(--accent)]'
              : 'text-[color:var(--text-muted)]',
          )}
        >
          {isOver ? 'Soltar bloque aquí' : 'Sin bloques — añade uno abajo'}
        </p>
      ) : (
        <SortableContext
          items={blocks.map((part) => sortIdPart(dayOfWeek, sessionIndex, part.uid))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1.5">
            {blocks.map((part) => {
              const partRef = {
                target: 'part' as const,
                day_of_week: dayOfWeek,
                session_index: sessionIndex,
                part_uid: part.uid,
              };

              return (
                <DayPartCard
                  key={part.uid}
                  part={part}
                  dayOfWeek={dayOfWeek}
                  sessionIndex={sessionIndex}
                  selected={selected}
                  onSelectPart={() => onSelectPart(partRef)}
                  onSelectItem={(itemUid) =>
                    onSelectItem({
                      target: 'item',
                      day_of_week: dayOfWeek,
                      session_index: sessionIndex,
                      part_uid: part.uid,
                      item_uid: itemUid,
                    })
                  }
                  onRemovePart={() => onRemovePart(partRef)}
                  onDuplicatePart={() => onDuplicatePart(partRef)}
                  onRemoveItem={(itemUid) =>
                    onRemoveItem({
                      target: 'item',
                      day_of_week: dayOfWeek,
                      session_index: sessionIndex,
                      part_uid: part.uid,
                      item_uid: itemUid,
                    })
                  }
                />
              );
            })}
          </div>
        </SortableContext>
      )}

      <AddBlockMenu
        onLibrary={() => onAddBlockFromLibrary(dayOfWeek, sessionIndex)}
        onPabloIA={() => onPabloIADay(dayOfWeek, sessionIndex)}
        onCustom={(presetId) => onAddCustomBlock(dayOfWeek, sessionIndex, presetId)}
      />
    </div>
  );
}

interface DuplicateDayMenuProps {
  fromDayOfWeek: number;
  /** Días disponibles en la semana (1-7) para elegir destino. */
  days: number[];
  onDuplicate: (toDayOfWeek: number) => void;
}

/**
 * Menú "Duplicar día" (F12) en la cabecera de la columna: copia todas las
 * sesiones/bloques del día a OTRO día de la misma semana (sustituye su
 * contenido). Botón con icono content_copy y aria-label; cierre con
 * Escape/click-fuera.
 */
function DuplicateDayMenu({ fromDayOfWeek, days, onDuplicate }: DuplicateDayMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const targets = days.filter((d) => d !== fromDayOfWeek);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (targets.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Duplicar ${dayLabel(fromDayOfWeek as DayOfWeek)} a otro día`}
        title="Duplicar día a otro día de la semana"
        className="focus-ring flex h-6 w-6 items-center justify-center rounded-[var(--r-sm)] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--fg)]"
      >
        <MIcon name="content_copy" size={14} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Duplicar día en"
          className="absolute right-0 top-full z-50 mt-1 w-44 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-1 shadow-xl"
        >
          <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--text-muted)]">
            Copiar este día en
          </p>
          {targets.map((dow) => (
            <button
              key={dow}
              type="button"
              role="menuitem"
              onClick={() => {
                onDuplicate(dow);
                setOpen(false);
              }}
              className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[13px] font-medium text-[color:var(--fg)] hover:bg-[color:var(--surface-container-highest)]"
            >
              <MIcon name="content_copy" size={14} />
              <span>{dayLabel(dow as DayOfWeek)}</span>
            </button>
          ))}
          <p className="px-2 pb-1 pt-1 text-[10px] leading-snug text-[color:var(--text-muted)]">
            Sobrescribe el día destino.
          </p>
        </div>
      ) : null}
    </div>
  );
}
