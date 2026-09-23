'use client';

// Un panel de Ajustes que no ha podido leer sus datos: lo dice y ofrece
// reintentar (recarga los datos del servidor). Distinto de un vacío.

import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/v2/ui';

export function AjustesLoadError({ what }: { what: string }) {
  const router = useRouter();
  return (
    <ErrorState
      title={`No se ha podido cargar ${what}`}
      description="Tus datos siguen guardados."
      onRetry={() => router.refresh()}
    />
  );
}
