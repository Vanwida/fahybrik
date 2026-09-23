'use client';

// Pestaña Plan del cockpit: el calendario editable (Semana / 3 semanas / Plan
// completo) y la columna Estado. Un atleta con alta pendiente ve su checklist de
// alta en su lugar; uno sin nada programado, «Asignar programa» aquí mismo (P12).
// En el móvil: la semana en 7 puntos y el estado — editar es de escritorio.

import { useRouter } from '@/i18n/navigation';
import { CalendarPlus } from 'lucide-react';
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@/components/v2/ui';
import { WeekDots } from '@/components/v2/shared';
import { IntakeReview } from '@/components/v2/intake/IntakeReview';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import type { CalZoom, FichaCalendar, FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';
import { EstadoColumn } from '../estado/EstadoColumn';
import { useFicha } from '../FichaContext';
import { Calendar } from './Calendar';
import { useCalendar } from './use-calendar';

const ZOOMS: { value: CalZoom; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: '3sem', label: '3 semanas' },
  { value: 'plan', label: 'Plan completo' },
];

function CalendarSkeleton() {
  return (
    <div role="status" aria-label="Cargando el calendario" className="flex flex-col gap-px overflow-hidden rounded-panel border border-v2-border">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-none" />
      ))}
    </div>
  );
}

export function PlanTab({
  calendar,
  estado,
  intake,
}: {
  calendar: FichaCalendar | null;
  estado: FichaEstado | null;
  intake: IntakeReviewPayload | null;
}) {
  const { shell, openAssign } = useFicha();
  const router = useRouter();
  const c = useCalendar(calendar);

  // Alta pendiente SIN plan: la lista de lo que falta para asignar ocupa el sitio del
  // calendario. Si ya tiene plan (p. ej. entró por un grupo), manda el calendario y
  // «Revisar alta» abre la revisión entera.
  if (shell.intake_pending && intake && !shell.has_upcoming_plan) {
    return <IntakeReview review={intake} athleteId={shell.athlete_id} embedded />;
  }

  const cal = c.cal;
  const inRange = cal ? cal.weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.sessions.length, 0), 0) : 0;
  const upcoming = cal
    ? cal.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions)).filter((s) => s.editable && s.date >= cal.today)
    : [];
  const noPlan = !shell.has_upcoming_plan && inRange === 0;
  const adh = shell.adherence;

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <SegmentedControl items={ZOOMS} value={c.zoom} onValueChange={c.setZoom} aria-label="Cuánto plan ver" size="sm" />
      <p className="t-body-sm text-v2-muted t-tnum">
        {adh && adh.due > 0 ? (
          <>
            Adherencia ({adh.window_days} d): <b className="font-semibold text-v2-fg">{adh.done} de {adh.due}</b> debidas
          </>
        ) : (
          'Adherencia (14 d): nada debido todavía'
        )}
        {shell.program ? (
          <span className="text-v2-faint">
            {' '}
            · {shell.program.name} · sem {shell.program.week} de {shell.program.weeks}
          </span>
        ) : null}
      </p>
    </div>
  );

  let body: React.ReactNode;
  if (c.error && !cal) {
    body = <ErrorState title={c.error} onRetry={c.retry} />;
  } else if (!cal) {
    body = <CalendarSkeleton />;
  } else if (noPlan && c.zoom !== 'plan') {
    body = (
      <div className="rounded-panel border border-v2-border bg-v2-surface">
        <EmptyState
          variant="page"
          icon={CalendarPlus}
          title="Sin nada programado"
          description={`${shell.name.split(' ')[0]} no tiene entrenos de hoy en adelante.`}
          action={
            <>
              <Button variant="primary" onClick={openAssign}>
                Asignar programa
              </Button>
              <Button variant="ghost" onClick={() => c.setZoom('plan')}>
                Ver lo anterior
              </Button>
            </>
          }
        />
      </div>
    );
  } else {
    body = (
      <div className={cn('flex flex-col gap-2 transition-opacity', c.loading && 'opacity-70')} aria-busy={c.loading || undefined}>
        {c.error ? <ErrorState title={c.error} onRetry={c.retry} /> : null}
        <Calendar cal={cal} onMove={(id, date) => void c.move(id, date)} />
        {noPlan ? (
          <div className="flex items-center justify-between gap-3 t-body-sm text-v2-muted">
            <span>Nada programado de hoy en adelante.</span>
            <Button size="sm" variant="primary" onClick={openAssign}>
              Asignar programa
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_328px]">
      {/* Móvil: la semana en 7 puntos. */}
      <section aria-label="Esta semana" className="flex flex-col gap-2 rounded-panel border border-v2-border bg-v2-surface p-3 md:hidden">
        <div className="flex items-baseline justify-between">
          <span className="t-label text-v2-faint">Esta semana</span>
          {adh && adh.due > 0 ? (
            <span className="t-meta text-v2-muted t-tnum">
              Adh. {adh.window_days} d: {adh.done} de {adh.due}
            </span>
          ) : null}
        </div>
        <WeekDots days={shell.week_days} className="justify-between" />
        {!shell.has_upcoming_plan ? (
          <Button variant="primary" onClick={openAssign}>
            Asignar programa
          </Button>
        ) : null}
      </section>

      <div className="hidden min-w-0 flex-col gap-3 md:flex">
        {toolbar}
        {body}
      </div>
      <EstadoColumn estado={estado} upcoming={upcoming} onRetry={() => router.refresh()} />
    </div>
  );
}
