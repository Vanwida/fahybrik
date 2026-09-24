'use client';

// La ficha no ha podido cargarse: un error con «Reintentar», distinto de «sin datos».

import { ErrorState } from '@/components/v2/ui';

export default function FichaError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      variant="page"
      title="No se ha podido abrir la ficha"
      description="Puede ser la conexión o un fallo nuestro. Vuelve a probar."
      onRetry={reset}
    />
  );
}
