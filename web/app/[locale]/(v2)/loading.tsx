// Estado CARGANDO de todo el dashboard. Al vivir en el grupo (v2) cubre las 20
// rutas de dentro, así que ninguna sección puede volver a quedarse sin señal.
//
// Antes de esto, al navegar de una sección a otra la pantalla ANTERIOR se
// quedaba congelada hasta que llegaba el servidor: nada decía que algo estaba
// pasando. §5 del contrato.
//
// Una ruta con una forma muy distinta puede poner su propio `loading.tsx` en su
// carpeta y este deja de aplicarle — pero ya no puede no tener ninguno.

import { ScreenSkeleton } from '@/components/v2/ScreenState';

export default function V2Loading() {
  return <ScreenSkeleton />;
}
