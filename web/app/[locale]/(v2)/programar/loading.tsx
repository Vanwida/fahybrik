// Cargando una vista de Programar: la cabecera y una tabla de filas de 40 px
// (la forma que va a tener), no una ruleta.

import { Skeleton, SkeletonRows } from '@/components/v2/ui';

export default function ProgramarLoading() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-8 w-72" />
      <div className="rounded-panel border border-v2-border bg-v2-surface">
        <SkeletonRows rows={8} />
      </div>
    </div>
  );
}
