'use client';

import type { ReactNode } from 'react';
import { CircleAlert, RotateCcw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

/**
 * Vacío. `inline` (por defecto) = UNA línea dentro de una tarjeta o sección
 * («Sin series con ritmo en 4 semanas»); `page` = pantalla entera vacía, solo
 * cuando no hay nada más que enseñar. Nunca una tarjeta hecha solo de prosa.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  variant = 'inline',
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  variant?: 'inline' | 'page';
  className?: string;
}) {
  if (variant === 'inline') {
    return (
      <div className={cn('flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 t-body-sm text-v2-faint', className)}>
        {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0" /> : null}
        <span>
          {title}
          {description ? <span className="text-v2-faint"> · {description}</span> : null}
        </span>
        {action}
      </div>
    );
  }
  return (
    <div className={cn('mx-auto flex max-w-[420px] flex-col items-center px-4 py-16 text-center', className)}>
      {Icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-full border border-v2-border bg-v2-surface text-v2-muted">
          <Icon aria-hidden strokeWidth={1.75} className="size-5" />
        </div>
      ) : null}
      <h2 className="t-title-sm text-v2-fg">{title}</h2>
      {description ? <p className="mt-1.5 t-body text-v2-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Error honesto: qué falló y «Reintentar». `inline` para una sección; `page` si cae la pantalla. */
export function ErrorState({
  title = 'No se ha podido cargar',
  description,
  onRetry,
  variant = 'inline',
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  variant?: 'inline' | 'page';
  className?: string;
}) {
  if (variant === 'inline') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ctl border border-v2-border bg-v2-surface px-3 py-2.5 t-body-sm',
          className,
        )}
      >
        <CircleAlert aria-hidden strokeWidth={2} className="size-4 shrink-0 text-v2-danger" />
        <span className="min-w-0 flex-1 text-v2-fg">
          {title}
          {description ? <span className="text-v2-muted"> · {description}</span> : null}
        </span>
        {onRetry ? (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div role="alert" className={cn('mx-auto flex max-w-[420px] flex-col items-center px-4 py-16 text-center', className)}>
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-v2-danger-soft text-v2-danger">
        <CircleAlert aria-hidden strokeWidth={1.75} className="size-5" />
      </div>
      <h2 className="t-title-sm text-v2-fg">{title}</h2>
      {description ? <p className="mt-1.5 t-body text-v2-muted">{description}</p> : null}
      {onRetry ? (
        <Button className="mt-5" icon={RotateCcw} onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** Bloque de carga con la forma de lo que viene (por componente, no genérico). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[4px] bg-v2-select motion-reduce:animate-none', className)} />;
}

/** N filas de 40 px con avatar + dos líneas: el esqueleto de una tabla o bandeja. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={cn('divide-y divide-v2-border', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-10 items-center gap-3 px-4">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="hidden h-3 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
