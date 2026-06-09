import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import type { PlanDay, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import { dayLabel } from '@/lib/dashboard/constants/calendar';
import { Card } from '@/components/dashboard/ui/Card';
import { DayColumn } from '@/components/dashboard/programming/DayColumn';
import { WorkoutCard } from '@/components/dashboard/programming/WorkoutCard';
import { cn } from '@/lib/utils';

type RuntimeWeekBoardProps = {
  mode: 'runtime';
  weeks: PlanWeekRow[];
  maxSessionsPerDay?: number;
  onDayClick?: (day: PlanDay) => void;
  variant?: 'default' | 'ficha';
  weekAdherencePct?: number | null;
};

type TemplateWeekBoardProps = {
  mode: 'template';
  slots: WeekSlots;
  templates?: Map<string, { name: string }>;
  /**
   * Si se pasa, cada columna día se vuelve clickable y dispara el callback
   * con `day_of_week` (1–7). Útil para abrir un modal de edición por día
   * desde el hub `/programar`.
   */
  onSelectDay?: (dayOfWeek: number) => void;
};

export type WeekBoardProps = (RuntimeWeekBoardProps | TemplateWeekBoardProps) & {
  weekTitle?: string;
  adherencePct?: number | null;
  className?: string;
};

function sessionsForTemplateDay(
  day: WeekSlots['days'][0],
  templates?: Map<string, { name: string }>,
) {
  const out: Array<{ label: string; template_id: string | null }> = [];
  day.sessions.forEach((session, idx) => {
    if (session.kind !== 'workout') return;
    const id = session.template_id != null ? String(session.template_id) : null;
    const fallback = idx === 0 ? 'Entreno' : 'Entreno +';
    out.push({
      label: id && templates?.get(id)?.name ? templates.get(id)!.name : fallback,
      template_id: id,
    });
  });
  return out;
}

function WeekGrid({
  children,
  className,
  ficha,
}: {
  children: React.ReactNode;
  className?: string;
  ficha?: boolean;
}) {
  if (ficha) {
    return (
      <div
        className={cn(
          'grid min-h-[400px] grid-cols-1 gap-[var(--gutter)] lg:grid-cols-7',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  // Vista densa (7 días). En móvil no cabe → scroll horizontal con snap;
  // cada columna mantiene un ancho mínimo legible. En lg+ vuelve a grid 7.
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] lg:mx-0 lg:overflow-visible lg:px-0">
      <div
        className={cn(
          'grid min-h-[100px] auto-cols-[minmax(8.5rem,1fr)] grid-flow-col gap-[var(--gutter)] [scroll-snap-type:x_proximity]',
          'lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-7',
          '[&>*]:[scroll-snap-align:start]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function WeekBoard(props: WeekBoardProps) {
  const { weekTitle, adherencePct, className } = props;

  const header =
    weekTitle || adherencePct != null ? (
      <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
        {weekTitle ? (
          <p className="text-xs text-[color:var(--text-muted)]">{weekTitle}</p>
        ) : (
          <span />
        )}
        {adherencePct != null ? (
          <p className="font-heading-sm text-[color:var(--fg)]">
            {Math.round(adherencePct)}%
          </p>
        ) : null}
      </header>
    ) : null;

  if (props.mode === 'template') {
    const { slots, templates, onSelectDay } = props;
    return (
      <div className={className}>
        {header}
        <WeekGrid>
          {slots.days.map((day) => {
            const sessions = sessionsForTemplateDay(day, templates);
            const label = dayLabel(day.day_of_week as 1 | 2 | 3 | 4 | 5 | 6 | 7);
            return (
              <DayColumn
                key={day.day_of_week}
                dayLabel={label}
                onClick={onSelectDay ? () => onSelectDay(day.day_of_week) : undefined}
              >
                {sessions.length === 0 ? (
                  <WorkoutCard title="" isRest variant="ficha" />
                ) : (
                  sessions.map((s, i) => (
                    <WorkoutCard
                      key={i}
                      title={s.label}
                      categoryTag={s.label.split(' ')[0]}
                      status="scheduled"
                      variant="ficha"
                    />
                  ))
                )}
              </DayColumn>
            );
          })}
        </WeekGrid>
      </div>
    );
  }

  const {
    weeks,
    maxSessionsPerDay = 3,
    onDayClick,
    variant = 'default',
    weekAdherencePct,
  } = props;
  const isFicha = variant === 'ficha';

  if (isFicha) {
    return (
      <div className={className}>
        {header}
        {weeks.map((week) => (
          <WeekGrid key={week.week_start} ficha>
            {week.days.map((day) => {
              const visible = day.sessions.slice(0, maxSessionsPerDay);
              return (
                <DayColumn
                  key={day.iso_date}
                  dayLabel={day.label}
                  isToday={day.is_today}
                  onClick={onDayClick ? () => onDayClick(day) : undefined}
                  variant="ficha"
                >
                  {day.sessions.length === 0 ? (
                    <WorkoutCard title="" isRest isToday={day.is_today} variant="ficha" />
                  ) : (
                    visible.map((s) => (
                      <WorkoutCard
                        key={s.assignment_id}
                        title={s.title}
                        categoryTag={s.format ?? undefined}
                        duration={s.duration_min}
                        status={s.status}
                        isToday={day.is_today}
                        variant="ficha"
                      />
                    ))
                  )}
                </DayColumn>
              );
            })}
          </WeekGrid>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {weekTitle || adherencePct != null || weekAdherencePct != null ? header : null}
      {weeks.map((week) => (
        <Card key={week.week_start} className="overflow-hidden p-0">
          <header className="border-b border-[color:var(--border-subtle)] px-4 py-2 text-xs text-[color:var(--text-muted)]">
            Semana {week.week_start.slice(5)} – {week.week_end.slice(5)}
          </header>
          <div className="p-[var(--gutter)]">
            <WeekGrid>
              {week.days.map((day) => {
                const visible = day.sessions.slice(0, maxSessionsPerDay);
                const overflow = day.sessions.length - visible.length;

                return (
                  <DayColumn
                    key={day.iso_date}
                    dayLabel={day.label}
                    dateLabel={day.iso_date.slice(8)}
                    isToday={day.is_today}
                    onClick={onDayClick ? () => onDayClick(day) : undefined}
                  >
                    {day.sessions.length === 0 ? (
                      <WorkoutCard title="" isRest />
                    ) : (
                      <>
                        {visible.map((s) => (
                          <WorkoutCard
                            key={s.assignment_id}
                            title={s.title}
                            categoryTag={s.format ?? undefined}
                            duration={s.duration_min}
                            status={s.status}
                            isToday={day.is_today}
                          />
                        ))}
                        {overflow > 0 ? (
                          <span className="text-[10px] text-[color:var(--text-muted)]">
                            +{overflow}
                          </span>
                        ) : null}
                      </>
                    )}
                  </DayColumn>
                );
              })}
            </WeekGrid>
          </div>
        </Card>
      ))}
    </div>
  );
}
