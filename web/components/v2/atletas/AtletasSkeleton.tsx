// Esqueleto de /atletas: la forma de lo que viene — cabecera, fila de vistas,
// búsqueda y filtros, y filas de 40 px — para que nada salte al llegar.

import { Skeleton, SkeletonRows } from '@/components/v2/ui';
import { PageContainer } from '@/components/v2/PageFrame';

export function AtletasSkeleton() {
  return (
    <PageContainer>
      <div role="status" aria-label="Cargando tus atletas" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="ml-auto h-8 w-32" />
          <Skeleton className="hidden h-8 w-36 sm:block" />
        </div>
        <div className="flex gap-1.5">
          {['w-28', 'w-16', 'w-20', 'w-32', 'w-24'].map((w, i) => (
            <Skeleton key={i} className={`h-7 rounded-full ${w}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="hidden h-8 w-20 md:block" />
          <Skeleton className="hidden h-8 w-20 md:block" />
          <Skeleton className="hidden h-8 w-20 md:block" />
        </div>
        <div className="overflow-hidden rounded-panel border border-v2-border bg-v2-surface">
          <div className="h-8 border-b border-v2-border" />
          <SkeletonRows rows={14} />
        </div>
      </div>
    </PageContainer>
  );
}
