'use client';

// «Guardado» discreto. Guardando → ruleta; fallo → el motivo y «Reintentar»
// (lo pendiente sigue en la cola; no se pierde nada).

import { Check, LoaderCircle } from 'lucide-react';
import { Button, StatusBadge } from '@/components/v2/ui';
import type { SaveStatus } from './use-program-grid';

export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  if (status === 'idle') return null;
  if (status === 'error') {
    return (
      <span className="flex items-center gap-2" role="alert">
        <StatusBadge tone="danger" label="No se ha guardado" />
        <span className="hidden t-meta text-v2-muted xl:inline">{error}</span>
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </span>
    );
  }
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5 t-meta text-v2-faint">
      {status === 'saving' ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <Check aria-hidden className="size-3.5 text-v2-ok" strokeWidth={2} />
      )}
      {status === 'saving' ? 'Guardando…' : 'Guardado'}
    </span>
  );
}
