'use client';

// La columna de contexto: lo que el coach necesita para CONTESTAR bien, del
// atleta del hilo abierto y de nadie más. Su estado y por qué, su readiness
// contra su propia base, lo que tiene HOY de verdad (los entrenos del día, no el
// nombre del programa), su semana, su adherencia de 14 días y la carrera.
// Mismos datos que el vistazo de Hoy y Atletas (`loadAthletePeek`).

import { Link } from '@/i18n/navigation';
import { ArrowUpRight, Check, Circle } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Tag,
  buttonVariants,
} from '@/components/v2/ui';
import { AdherenceMini, ReadinessMini, StatusBadgeFor, WeekDots, countdown } from '@/components/v2/shared';
import { relativeDayLabel } from '@/components/v2/shared/format';
import type { AthletePeekData } from '@/lib/coach/athlete-peek';
import { cn } from '@/lib/utils';
import type { ThreadContextLoad } from './use-thread-context';

function Section({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-label text-v2-faint">{label}</h3>
        {aside ? <span className="t-meta text-v2-faint">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Lo de HOY: sus entrenos del día tal cual, o por qué no hay. */
function Today({ data }: { data: AthletePeekData }) {
  const today = data.week.days.find((d) => d.is_today);
  if (!data.program && (!today || today.sessions.length === 0)) {
    return <EmptyState title="Sin plan" description="no tiene programa asignado" />;
  }
  if (!today || today.sessions.length === 0) {
    return <EmptyState title="Descanso" description="hoy no tiene entreno" />;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {today.sessions.map((s, i) => (
        <li key={`${s.title}-${i}`} className="flex min-w-0 items-center gap-2 t-body">
          {s.done ? (
            <Check aria-label="Hecho" strokeWidth={2.25} className="size-4 shrink-0 text-v2-ok" />
          ) : (
            <Circle aria-label="Pendiente" strokeWidth={1.75} className="size-4 shrink-0 text-v2-faint" />
          )}
          <span className="truncate text-v2-fg">{s.title}</span>
        </li>
      ))}
    </ul>
  );
}

function ContextBody({ data }: { data: AthletePeekData }) {
  const { week } = data;
  return (
    <div className="flex flex-col gap-6">
      <Section label="Estado">
        <StatusBadgeFor status={data.status} withReason className="flex-wrap" />
        {data.status.signals.length > 1 ? (
          <span className="t-meta text-v2-faint">
            +{data.status.signals.length - 1} {data.status.signals.length - 1 === 1 ? 'señal más' : 'señales más'}
          </span>
        ) : null}
      </Section>

      {/* El panel de readiness lleva su propia ceja («Readiness · 14 días»); sin lecturas, la ponemos aquí. */}
      {data.readiness ? (
        <ReadinessMini readiness={data.readiness} today={week.today} size="panel" />
      ) : (
        <Section label="Readiness">
          <span className="t-body-sm text-v2-faint">sin datos</span>
        </Section>
      )}

      <Section
        label="Hoy"
        aside={data.program ? `${data.program.name} · semana ${data.program.week} de ${data.program.weeks}` : undefined}
      >
        <Today data={data} />
        {!week.visible && data.program ? (
          <span className="t-meta text-v2-warn">
            Semana oculta al atleta
            {week.opens_on && week.opens_on > week.today ? ` · se abre ${relativeDayLabel(week.opens_on, week.today)}` : ''}
          </span>
        ) : null}
      </Section>

      <Section label="Esta semana">
        <WeekDots days={week.days} />
      </Section>

      <Section label="Adherencia">
        <AdherenceMini adherence={data.adherence} windowDays={14} showWindow detail width={72} />
      </Section>

      {data.race || data.last_checkin ? (
        <Section label="Además">
          <dl className="flex flex-col gap-1.5 t-body-sm">
            {data.race ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 truncate text-v2-muted">{data.race.name}</dt>
                <dd className="shrink-0 font-medium text-v2-fg t-tnum">{countdown(data.race.days, data.race.date)}</dd>
              </div>
            ) : null}
            {data.last_checkin ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-v2-muted">Último check-in</dt>
                <dd className="shrink-0 font-medium text-v2-fg t-tnum">
                  {data.last_checkin.score} · {relativeDayLabel(data.last_checkin.on, week.today)}
                </dd>
              </div>
            ) : null}
          </dl>
          {data.last_checkin?.notes ? (
            <p className="rounded-ctl bg-v2-surface-2 px-2.5 py-2 t-body-sm text-v2-fg">«{data.last_checkin.notes}»</p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

export function ContextPane({
  load,
  athleteId,
  onRetry,
  showIdentity = false,
  className,
}: {
  load: ThreadContextLoad;
  athleteId: string | null;
  onRetry: () => void;
  /** En el panel lateral (pantallas estrechas) el nombre no está al lado: se repite. */
  showIdentity?: boolean;
  className?: string;
}) {
  if (!athleteId || load.state === 'idle') {
    return (
      <div className={cn('p-4', className)}>
        <EmptyState title="Abre una conversación" description="aquí verás cómo está ese atleta" />
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col gap-6 p-4', className)}>
      {load.state === 'loading' ? (
        <div role="status" aria-label="Cargando su contexto" className="flex flex-col gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          ))}
        </div>
      ) : load.state === 'error' ? (
        load.notFound ? (
          <EmptyState title="Este atleta ya no está en tu lista" />
        ) : (
          <ErrorState title="No se ha podido cargar su contexto" onRetry={onRetry} />
        )
      ) : (
        <>
          {showIdentity ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-title-sm text-v2-fg">{load.data.name}</span>
              {load.data.level ? <Tag>{load.data.level.label}</Tag> : null}
              {load.data.group ? <Tag>{load.data.group.name}</Tag> : null}
            </div>
          ) : load.data.group ? (
            <div>
              <Tag>{load.data.group.name}</Tag>
            </div>
          ) : null}
          <ContextBody data={load.data} />
        </>
      )}
      <Link
        href={`/atletas/${encodeURIComponent(athleteId)}`}
        className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'w-full')}
      >
        Abrir ficha
        <ArrowUpRight aria-hidden strokeWidth={1.75} className="opacity-70" />
      </Link>
    </div>
  );
}
