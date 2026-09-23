'use client';

// Estado ERROR de todo el dashboard: cubre cualquier excepción no capturada de
// las rutas de (v2). Sin esto, un fallo del servidor tiraba de la pantalla de
// error por defecto de Next — fuera del shell y sin tema.
//
// Dos salidas, porque un error tiene dos formas de resolverse: `reset()`
// reintenta el render sin recargar la app (lo más rápido si fue transitorio), y
// el enlace a Hoy saca de aquí si el reintento tampoco funciona.

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { ErrorState, buttonVariants } from '@/components/v2/ui';

export default function V2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El `digest` es lo único que permite atar esto con el log del servidor.
    console.error('[v2] error de pantalla', error.digest ?? '', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center pb-16">
      <ErrorState
        variant="page"
        title="Algo ha fallado"
        description="Esta sección no se ha podido pintar. Tus datos están a salvo."
        onRetry={reset}
        className="pb-3"
      />
      <Link href="/hoy" className={buttonVariants({ variant: 'ghost', size: 'md' })}>
        Ir a Hoy
      </Link>
    </div>
  );
}
