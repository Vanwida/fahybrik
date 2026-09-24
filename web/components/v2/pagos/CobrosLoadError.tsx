'use client';

import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/v2/ui';

/** Los cobros no se han podido leer (distinto de «no cobras a nadie»). */
export function CobrosLoadError() {
  const router = useRouter();
  return <ErrorState variant="page" title="No se han podido cargar tus cobros" onRetry={() => router.refresh()} />;
}
