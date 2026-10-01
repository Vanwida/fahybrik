'use client';

import { ChevronRight } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@/components/v2/ui';
import type { FichaCalendar } from '@/lib/dashboard/v2/atleta-detalle-types';
import { dayLabel } from '@/lib/dashboard/v2/ficha-dates';
import { formatMinutes, weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';
import { WeekColumn } from './WeekColumn';
import { maxDayLoad } from '@/lib/dashboard/v2/ficha-calendar-model';

/** La misma semana y las mismas sesiones; en móvil se leen como agenda. */
export function MobileAgenda({ calendar, error, loading, onRetry }: {
  calendar: FichaCalendar | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const { openSession } = useFicha();
  if (!calendar) return error ? <ErrorState title={error} onRetry={onRetry} /> : (
    <div role="status" aria-label="Cargando el plan" className="flex flex-col gap-2">
      {[0, 1, 2].map((n) => <Skeleton key={n} className="h-20 w-full" />)}
    </div>
  );
  return (
    <div className={cn('flex flex-col gap-4', loading && 'opacity-70')} aria-busy={loading || undefined}>
      {error ? <ErrorState title={error} onRetry={onRetry} /> : null}
      {calendar.weeks.map((week) => (
        <section key={week.week_start} aria-label={`Semana ${weekRangeLabel(week.week_start)}`} className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
          <div className="flex items-start justify-between gap-3 border-b border-v2-border p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="t-body font-semibold text-v2-fg">{weekRangeLabel(week.week_start)}</h3>
              {week.program ? <span className="t-body-sm text-v2-muted">{week.program.name} · sem {week.program.week} de {week.program.weeks}</span> : null}
            </div>
            <WeekColumn week={week} today={calendar.today} max={maxDayLoad(calendar)} />
          </div>
          <ol className="divide-y divide-v2-border">
            {week.days.map((day) => (
              <li key={day.date} className={cn('flex flex-col gap-1 p-3', day.date === calendar.today && 'bg-v2-surface-2')}>
                <h4 className="t-body-sm font-semibold text-v2-muted">{dayLabel(day.date)}{day.date === calendar.today ? ' · hoy' : ''}</h4>
                {day.sessions.length === 0 ? <p className="t-meta text-v2-faint">Sin entrenos</p> : day.sessions.map((s) => (
                  <Button key={s.id} variant="ghost" className="h-auto min-h-11 justify-between gap-3 whitespace-normal px-0 text-left" onClick={() => openSession(s.id)} aria-label={`Abrir ${s.title} del ${dayLabel(day.date)}`}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="t-body text-v2-fg">{s.title}</span>
                      <span className="t-meta font-normal text-v2-muted">
                        {[s.modality_label, s.libre ? 'Libre · hecho' : s.done ? s.status === 'partial' ? 'Hecho a medias' : 'Hecho' : s.missed ? 'Sin hacer' : s.excluded ? 'No cuenta (pausa o lesión)' : 'Pendiente', s.planned_min != null ? `${s.planned_open ? '≥ ' : ''}${formatMinutes(s.planned_min)}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-v2-faint" />
                  </Button>
                ))}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
