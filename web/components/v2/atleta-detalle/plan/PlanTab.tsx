'use client';

// Pestaña Plan del cockpit: el calendario editable (Semana / 3 semanas / Plan
// completo) y el detalle plegado de Estado. Un atleta con alta pendiente ve su checklist de
// alta en su lugar; uno sin nada programado, «Asignar programa» aquí mismo (P12).
// En móvil, agenda por días con las mismas sesiones y herramientas de semana.

import { usePathname, useSearchParams } from 'next/navigation';
import { withCoachReturn } from '@/components/v2/shared/context-link';
import { Link, useRouter } from '@/i18n/navigation';
import { CalendarPlus } from 'lucide-react';
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@/components/v2/ui';
import { IntakeReview } from '@/components/v2/intake/IntakeReview';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import type { CalZoom, FichaCalendar, FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';
import { EstadoColumn } from '../estado/EstadoColumn';
import { useFicha } from '../FichaContext';
import { Calendar } from './Calendar';
import { useCalendar } from './use-calendar';
import { isPlanSession } from '@/lib/dashboard/v2/ficha-calendar-model';
import { MobileAgenda } from './MobileAgenda';
import { PersonalPlanChain } from '../plan-chain/PersonalPlanChain';

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
  const pathname = usePathname();
  const search = useSearchParams();
  const origin = `${pathname}${search.size ? `?${search.toString()}` : ''}`;
  const c = useCalendar(calendar);

  // Alta pendiente SIN plan: la lista de lo que falta para asignar ocupa el sitio del
  // calendario. Si ya tiene plan (p. ej. entró por un grupo), manda el calendario y
  // «Revisar alta» abre la revisión entera.
  // Un atleta «Nuevo» (alta pendiente) enseña su alta en vez del calendario, tenga
  // o no ya semanas (entró en su grupo al invitarle): el plan aún no está firmado.
  if (shell.intake_pending && intake) {
    return <IntakeReview review={intake} athleteId={shell.athlete_id} embedded />;
  }

  const cal = c.cal;
  // «Sin plan» se decide con lo del PLAN; los libres hechos del atleta no son
  // plan, pero si los hay en el rango se enseña el calendario para verlos.
  const all = cal ? cal.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions)) : [];
  const inRange = all.filter(isPlanSession).length;
  const hasLibre = all.some((s) => !isPlanSession(s));
  const upcoming = cal ? all.filter((s) => s.editable && s.date >= cal.today) : [];
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
      </p>
    </div>
  );

  let body: React.ReactNode;
  if (c.error && !cal) {
    body = <ErrorState title={c.error} onRetry={c.retry} />;
  } else if (!cal) {
    body = <CalendarSkeleton />;
  } else if (noPlan && !hasLibre && c.zoom !== 'plan') {
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
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        {shell.program || shell.group ? (
          <div aria-label="Origen del plan" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 t-body-sm text-v2-muted">
            {shell.program ? <span>Programa: <Link className="font-medium text-v2-fg underline underline-offset-4" href={withCoachReturn(`/programar/programas/${shell.program.id}`, origin)}>{shell.program.name}</Link> · sem {shell.program.week} de {shell.program.weeks}</span> : null}
            {shell.group ? <span>Grupo: <Link className="font-medium text-v2-fg underline underline-offset-4" href={withCoachReturn(`/programar/grupos/${shell.group.id}`, origin)}>{shell.group.name}</Link></span> : null}
          </div>
        ) : null}
        {toolbar}
        <EstadoColumn estado={estado} upcoming={upcoming} onRetry={() => router.refresh()} />
        <div className="md:hidden">
          {noPlan && !hasLibre && c.zoom !== 'plan' ? body : <MobileAgenda calendar={cal} error={c.error} loading={c.loading} onRetry={c.retry} />}
        </div>
        <div className="hidden md:block">{body}</div>
        <PersonalPlanChain />
      </div>
    </div>
  );
}
