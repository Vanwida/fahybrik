'use client';

// Primeros pasos del coach, calculados de sus datos (lib/coach/setup-checklist):
//
//   <SetupChecklist />                       tarjeta entera (Hoy en el primer uso, Ajustes)
//   <SetupChecklist checklist={fromServer} /> sin petición si la página ya la cargó
//   <SetupProgress />                        «Setup 5/9» con barra, para la barra lateral;
//                                            no pinta nada cuando lo obligatorio está hecho
//
// Cada paso lleva a donde se hace. No hay casillas a mano: un paso está hecho
// cuando existe lo que pide.

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { SetupChecklist as SetupChecklistData } from '@/lib/coach/setup-checklist';
import { Card, ErrorState, Meter, Skeleton, Tag, buttonVariants } from '@/components/v2/ui';
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
  const next = data.steps.find((s) => !s.done && !s.optional);
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="t-title-sm text-v2-fg">{title}</h2>
          <span className="t-body-sm text-v2-muted t-tnum">
            {data.done} de {data.total}
          </span>
        </div>
        <Meter value={data.done} max={data.total} label="Primeros pasos hechos" showValue={false} width={120} />
      </div>
      <ol className="border-t border-v2-border">
        {data.steps.map((s) => {
          const isNext = s === next;
          return (
            <li key={s.key} className="border-b border-v2-border last:border-b-0">
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
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    s.done ? 'bg-v2-ok text-v2-bg' : 'text-v2-faint',
                  )}
                >
                  {s.done ? (
                    <Check aria-hidden strokeWidth={3} className="size-3" />
                  ) : (
                    <Circle aria-hidden strokeWidth={1.75} className="size-5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={cn('t-body font-medium', s.done ? 'text-v2-muted' : 'text-v2-fg')}>{s.label}</span>
                    {s.optional ? <Tag>Opcional</Tag> : null}
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
    </Card>
  );
}

/** «Setup 5/9» compacto (barra lateral). Invisible cuando lo obligatorio está hecho o si falla. */
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
        Setup
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
