import { resolveAtletaUrl, type TimelineKind } from '@/lib/dashboard/v2/atleta-detalle-types';

/** El mismo resolutor que el servidor, aplicado a la URL actual del cliente. */
export function historialKind(search: Pick<URLSearchParams, 'get'>): TimelineKind | null {
  return resolveAtletaUrl({ tab: search.get('tab'), historial: search.get('historial') }).historial;
}

/** El filtro manual queda enlazable sin cambiar la sección ni el contexto de la ficha. */
export function historialFilterHref(pathname: string, search: string, kind: TimelineKind | null, hash = ''): string {
  const next = new URLSearchParams(search);
  if (kind) next.set('historial', kind);
  else next.delete('historial');
  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}
