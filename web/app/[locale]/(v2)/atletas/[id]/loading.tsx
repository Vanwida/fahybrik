// Cargando la ficha: la forma del cockpit (cabecera, estado, pestañas, calendario
// y columna de estado), no una ruleta.

import { Skeleton } from '@/components/v2/ui';

export default function FichaLoading() {
  return (
    <div role="status" aria-label="Cargando la ficha" className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="ml-auto hidden h-8 w-64 sm:block" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_328px]">
        <div className="hidden flex-col gap-3 md:flex">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-[280px] w-full" />
        </div>
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  );
}
