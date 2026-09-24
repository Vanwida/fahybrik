'use client';

// Error de /atletas: qué ha fallado y «Reintentar». Distinto de una lista vacía.

import { ErrorState, PageHeader } from '@/components/v2/ui';
import { PageContainer } from '@/components/v2/PageFrame';

export default function AtletasError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <PageHeader title="Atletas" />
      <ErrorState
        variant="page"
        title="No se ha podido cargar tu lista de atletas"
        description="Tus datos están bien; es esta pantalla la que no ha cargado."
        onRetry={reset}
      />
    </PageContainer>
  );
}
