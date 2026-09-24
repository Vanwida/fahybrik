// Cargando un programa: la rejilla (semanas × 7 días) en gris, con su forma.

import { Skeleton } from '@/components/v2/ui';

export default function ProgramaLoading() {
  return (
    <div role="status" aria-label="Cargando el programa" className="flex flex-col gap-4">
      <Skeleton className="h-3 w-20" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-8 w-96" />
      </div>
      <div className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
        <Skeleton className="h-9 w-full rounded-none" />
        {Array.from({ length: 4 }, (_, r) => (
          <div key={r} className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))_104px] border-t border-v2-border">
            {Array.from({ length: 9 }, (_, c) => (
              <div key={c} className="flex h-24 flex-col gap-1.5 border-l border-v2-border p-2.5 first:border-l-0">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
