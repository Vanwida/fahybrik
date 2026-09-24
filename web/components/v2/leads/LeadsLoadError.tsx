'use client';

import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/v2/ui';

/** La lista de leads no se ha podido leer (distinto de «no hay leads»). */
export function LeadsLoadError() {
  const router = useRouter();
  return <ErrorState variant="page" title="No se han podido cargar tus leads" onRetry={() => router.refresh()} />;
}
