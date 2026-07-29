'use client';

// Estado ERROR de todo el dashboard: cubre cualquier excepción no capturada de
// las 20 rutas de (v2). Sin esto, un fallo del servidor tiraba de la pantalla
// de error por defecto de Next — fuera del shell y sin tema.
//
// Dos salidas, porque un error tiene dos formas de resolverse: `reset()`
// reintenta el render sin recargar la app (lo más rápido si fue transitorio), y
// el enlace a Hoy saca de aquí si el reintento tampoco funciona.

import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import {
  ScreenNotice,
  screenNoticeActionClass,
  screenNoticeActionSecondaryClass,
} from '@/components/v2/ScreenState';
import { MIcon } from '@/components/ui/MIcon';

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
    <ScreenNotice
      tone="danger"
      icon="error"
      title="Algo ha fallado"
      description="No hemos podido cargar esta sección. Vuelve a intentarlo — si sigue fallando, tus datos están a salvo: es esta pantalla la que no se pinta."
      action={
        <>
          <button type="button" onClick={reset} className={screenNoticeActionClass}>
            <MIcon name="refresh" size={18} /> Reintentar
          </button>
          <Link href="/hoy" className={screenNoticeActionSecondaryClass}>
            Ir a Hoy
          </Link>
        </>
      }
    />
  );
}
