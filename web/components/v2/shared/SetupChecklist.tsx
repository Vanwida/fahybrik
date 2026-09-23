'use client';

// Primeros pasos del coach, calculados de sus datos (lib/coach/setup-checklist):
//
//   <SetupChecklist />                       tarjeta entera (Hoy en el primer uso, Ajustes)
//   <SetupChecklist checklist={fromServer} /> sin petición si la página ya la cargó
//   <SetupProgress />                        «Primeros pasos 1/3» con barra, para la barra
//                                            lateral; no pinta nada cuando un atleta ya ve
//                                            su semana
//
// Dos caminos: «Empieza con un atleta» (lo único obligatorio) y «Monta tu
// método» (opcional, en cualquier orden).
//
// Cada paso lleva a donde se hace. No hay casillas a mano: un paso está hecho
// cuando existe lo que pide.

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { SetupChecklist as SetupChecklistData } from '@/lib/coach/setup-checklist';
import { Card, ErrorState, Meter, Skeleton, buttonVariants } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { apiJson, errorMessage } from './api';

export type { SetupChecklistData };

function useChecklist(given?: SetupChecklistData | null) {
  const [data, setData] = useState<SetupChecklistData | null>(given ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (given) return;
    const ctrl = new AbortController();
    apiJson<{ checklist: SetupChecklistData }>('/api/coach/setup-checklist', { signal: ctrl.signal })
      .then((res) => {
        setData(res.checklist);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se han podido cargar tus primeros pasos'));
      });
    return () => ctrl.abort();
  }, [given, attempt]);
  return { data: given ?? data, error, retry: () => setAttempt((a) => a + 1) };
}

export function SetupChecklist({
  checklist,
  title = 'Primeros pasos',
  className,
}: {
  checklist?: SetupChecklistData | null;
  title?: string;
  className?: string;
}) {
  const { data, error, retry } = useChecklist(checklist);
  if (error)
    return <ErrorState title="No se han podido cargar tus primeros pasos" onRetry={retry} className={className} />;
  if (!data) {
    return (
      <Card className={className}>
        <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }
  const empieza = data.steps.filter((s) => s.track === 'empieza');
  const metodo = data.steps.filter((s) => s.track === 'metodo');
  // «Empezar» va en el siguiente paso del camino corto; hecho ese camino, en el
  // primer paso del método que falte.
  const next = empieza.find((s) => !s.done) ?? metodo.find((s) => !s.done) ?? null;
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h2 className="t-title-sm text-v2-fg">{title}</h2>
      </div>
      <StepGroup
        title="Empieza con un atleta"
        count={`${data.done} de ${data.total}`}
        meter={{ value: data.done, max: data.total }}
        steps={empieza}
        next={next}
        numbered
      />
      <StepGroup
        title="Monta tu método"
        count={`${data.method.done} de ${data.method.total} · cuando quieras`}
        steps={metodo}
        next={next}
      />
    </Card>
  );
}

function StepGroup({
  title,
  count,
  meter,
  steps,
  next,
  numbered = false,
}: {
  title: string;
  count: string;
  meter?: { value: number; max: number };
  steps: SetupChecklistData['steps'];
  next: SetupChecklistData['steps'][number] | null;
  numbered?: boolean;
}) {
  return (
    <section aria-label={title} className="border-t border-v2-border">
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="t-label text-v2-muted">{title}</h3>
          <span className="t-meta text-v2-faint t-tnum">{count}</span>
        </div>
        {meter ? <Meter value={meter.value} max={meter.max} label={`${title}: pasos hechos`} showValue={false} width={96} /> : null}
      </div>
      <ol>
        {steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.key} className="border-t border-v2-border first:border-t-0">
              <Link
                href={s.href}
                className={cn(
                  'group/step flex min-h-12 items-center gap-3 px-4 py-2 outline-none',
                  'hover:bg-v2-hover focus-visible:shadow-[inset_0_0_0_2px_var(--v2-accent)]',
                  'pointer-coarse:min-h-14',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full t-meta font-semibold',
                    s.done ? 'bg-v2-ok text-v2-bg' : numbered ? 'border border-v2-border-strong text-v2-muted' : 'text-v2-faint',
                  )}
                >
                  {s.done ? (
                    <Check aria-hidden strokeWidth={3} className="size-3" />
                  ) : numbered ? (
                    <span aria-hidden>{i + 1}</span>
                  ) : (
                    <Circle aria-hidden strokeWidth={1.75} className="size-5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={cn('t-body font-medium', s.done ? 'text-v2-muted' : 'text-v2-fg')}>{s.label}</span>
                    <span className="sr-only">{s.done ? '(hecho)' : '(pendiente)'}</span>
                  </span>
                  <span className="truncate t-body-sm text-v2-faint">{s.detail}</span>
                </span>
                {isNext ? (
                  <span className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'pointer-events-none')}>
                    Empezar
                  </span>
                ) : (
                  <ArrowRight
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-4 shrink-0 text-v2-faint opacity-0 transition-opacity group-hover/step:opacity-100"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** «Primeros pasos 1/3» compacto (barra lateral). Invisible en cuanto un atleta ve su
 *  semana (el camino corto hecho) o si falla. */
export function SetupProgress({
  checklist,
  href = '/ajustes',
  className,
}: {
  checklist?: SetupChecklistData | null;
  href?: string;
  className?: string;
}) {
  const { data } = useChecklist(checklist);
  if (!data || data.complete) return null;
  return (
    <Link
      href={href}
      aria-label={`Primeros pasos: ${data.done} de ${data.total} hechos`}
      className={cn(
        'flex flex-col gap-1.5 rounded-panel border border-dashed border-v2-border-strong px-3 py-2.5 outline-none',
        'hover:bg-v2-hover focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
        className,
      )}
    >
      <span className="flex items-baseline justify-between gap-2 t-meta text-v2-muted">
        Primeros pasos
        <span className="font-semibold text-v2-fg t-tnum">
          {data.done}/{data.total}
        </span>
      </span>
      <Meter
        value={data.done}
        max={data.total}
        label="Primeros pasos hechos"
        showValue={false}
        width={999}
        className="w-full [&>span]:!w-full"
      />
    </Link>
  );
}
