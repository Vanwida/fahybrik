'use client';

// Hoy no ha podido cargar la bandeja: error honesto con «Reintentar», distinto
// del «Todo al día» (una bandeja vacía NO es un fallo, y un fallo no se pinta
// como una bandeja vacía).

import { useRouter } from '@/i18n/navigation';
import { ErrorState, PageHeader } from '@/components/v2/ui';

export default function HoyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
      <PageHeader title="Hoy" />
      <ErrorState
        variant="page"
        title="No se ha podido cargar Hoy"
        description="Tus atletas y sus datos están bien: es la bandeja la que no ha llegado."
        onRetry={() => {
          router.refresh();
          reset();
        }}
      />
    </div>
  );
}
