// Mientras carga un panel de Ajustes: su forma (título + secciones con filas).

import { Skeleton } from '@/components/v2/ui';

export default function AjustesLoading() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      {[3, 2].map((rows, s) => (
        <div key={s} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <div className="divide-y divide-v2-border rounded-panel border border-v2-border bg-v2-surface">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 px-4 py-3.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
