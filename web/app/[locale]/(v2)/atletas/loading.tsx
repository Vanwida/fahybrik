// Cargando /atletas: la forma de la pantalla (cabecera, vistas, filtros, filas de
// 40 px), no una ruleta.

import { AtletasSkeleton } from '@/components/v2/atletas/AtletasSkeleton';

export default function AtletasLoading() {
  return <AtletasSkeleton />;
}
