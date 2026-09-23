// Esqueleto de Hoy: cabecera, chips, tres grupos y ocho filas de 48 px.

import { PageHeader, Skeleton } from '@/components/v2/ui';

function RowSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-v2-border px-3 last:border-b-0 sm:px-4">
      <Skeleton className="hidden size-4 sm:block" />
      <Skeleton className="size-7 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className={wide ? 'h-3 w-56' : 'h-3 w-36'} />
        <Skeleton className="h-2.5 w-64 max-w-full" />
      </div>
      <Skeleton className="hidden h-7 w-28 md:block" />
      <Skeleton className="h-3 w-8" />
    </div>
  );
}

export function HoySkeleton() {
  return (
    <div role="status" aria-label="Cargando Hoy" className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
      <PageHeader title="Hoy">
        <Skeleton className="-mt-1 h-3 w-72 max-w-full" />
        <div className="flex gap-2 overflow-hidden">
          {['w-16', 'w-28', 'w-20', 'w-24', 'w-14', 'w-16'].map((w, i) => (
            <Skeleton key={i} className={`h-7 shrink-0 rounded-full ${w}`} />
          ))}
        </div>
      </PageHeader>
      <section className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <div className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
          <RowSkeleton wide />
          <RowSkeleton wide />
          <RowSkeleton wide />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <div className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
          {Array.from({ length: 8 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
