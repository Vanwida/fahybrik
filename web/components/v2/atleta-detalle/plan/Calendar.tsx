'use client';

// El calendario editable (informe C §4): filas = semanas, columnas = días, y una
// columna «Semana» con su visibilidad, su carga y su menú. Todos los entrenos se
// ven (sin recortar el segundo de un día, R4). Arrastrar mueve (a hoy o después),
// «+» añade, clic abre el panel que ES el editor.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CalWeek, FichaCalendar } from '@/lib/dashboard/v2/atleta-detalle-types';
import { canDropOn, maxDayLoad } from '@/lib/dashboard/v2/ficha-calendar-model';
import { dayOfMonth, dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { weekRowLabel } from '@/lib/dashboard/v2/ficha-format';
import { useFicha } from '../FichaContext';
import { AddSession } from './AddSession';
import { DRAG_MIME, SessionChip } from './SessionChip';
import { WeekColumn } from './WeekColumn';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const GRID = 'grid grid-cols-[64px_repeat(7,minmax(0,1fr))_128px]';

function WeekRow({
  week,
  today,
  max,
  dragging,
  setDragging,
  onMove,
}: {
  week: CalWeek;
  today: string;
  max: number;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  onMove: (id: string, date: string) => void;
}) {
  const { openSession, shell } = useFicha();
  const [over, setOver] = useState<string | null>(null);
  const paused = shell.lifecycle.status !== 'activo';
  const { days: a, months: b } = weekRowLabel(week.week_start);
  return (
    <div role="row" className={cn(GRID, 'border-b border-v2-border last:border-b-0')}>
      <div role="rowheader" className="flex flex-col border-r border-v2-border px-2 py-2">
        <span className="t-meta font-semibold text-v2-muted t-tnum">{a}</span>
        <span className="t-meta text-v2-faint">{b}</span>
        {week.due > 0 ? (
          <span className="mt-auto pt-1 t-meta text-v2-faint t-tnum" title="Debidas hechas esa semana">
            {week.done}/{week.due}
          </span>
        ) : null}
      </div>
      {week.days.map((d) => {
        const isToday = d.date === today;
        const droppable = dragging != null && canDropOn(d.date, today);
        const past = d.date < today;
        return (
          <div
            key={d.date}
            role="gridcell"
            aria-label={dayLabel(d.date)}
            onDragOver={(e) => {
              if (!droppable || !e.dataTransfer.types.includes(DRAG_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (over !== d.date) setOver(d.date);
            }}
            onDragLeave={() => setOver((o) => (o === d.date ? null : o))}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG_MIME);
              setOver(null);
              setDragging(null);
              if (id && droppable) {
                e.preventDefault();
                onMove(id, d.date);
              }
            }}
            className={cn(
              'group/day flex min-h-[76px] min-w-0 flex-col gap-1 border-r border-v2-border p-1.5',
              isToday && 'bg-v2-surface-2',
              past && !isToday && 'bg-[color-mix(in_srgb,var(--v2-bg)_35%,transparent)]',
              over === d.date && 'bg-v2-select shadow-[inset_0_0_0_2px_var(--v2-border-strong)]',
              dragging != null && !droppable && 'opacity-60',
            )}
          >
            <div className="flex h-5 items-center justify-between">
              <span
                className={cn(
                  't-meta t-tnum',
                  isToday ? 'rounded-[4px] bg-v2-fg px-1 font-semibold text-v2-bg' : 'text-v2-faint',
                )}
              >
                {dayOfMonth(d.date)}
              </span>
              {!past && !paused ? (
                <span className="opacity-0 transition-opacity group-hover/day:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">
                  <AddSession date={d.date} compact />
                </span>
              ) : null}
            </div>
            {d.sessions.map((s) => (
              <SessionChip
                key={s.id}
                session={s}
                onOpen={openSession}
                dragging={dragging === s.id}
                onDragStart={setDragging}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              />
            ))}
          </div>
        );
      })}
      <div className="px-2 py-2">
        <WeekColumn week={week} max={max} today={today} />
      </div>
    </div>
  );
}

export function Calendar({ cal, onMove }: { cal: FichaCalendar; onMove: (id: string, date: string) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const max = maxDayLoad(cal);
  const todayIdx = (() => {
    const w = cal.weeks.find((wk) => wk.days.some((d) => d.date === cal.today));
    return w ? w.days.findIndex((d) => d.date === cal.today) : -1;
  })();
  return (
    <div role="grid" aria-label="Calendario del plan" className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
      <div role="row" className={cn(GRID, 'border-b border-v2-border')}>
        <div role="columnheader" className="border-r border-v2-border" />
        {DAY_NAMES.map((n, i) => (
          <div
            key={n}
            role="columnheader"
            className={cn(
              'border-r border-v2-border px-2 py-1.5 t-label text-v2-faint',
              i === todayIdx && 'bg-v2-surface-2 text-v2-fg',
            )}
          >
            {n}
          </div>
        ))}
        <div role="columnheader" className="px-2 py-1.5 t-label text-v2-faint">
          Semana
        </div>
      </div>
      {cal.weeks.map((w) => (
        <WeekRow
          key={w.week_start}
          week={w}
          today={cal.today}
          max={max}
          dragging={dragging}
          setDragging={setDragging}
          onMove={onMove}
        />
      ))}
    </div>
  );
}
