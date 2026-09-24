// Adónde lleva cada cosa que se abre desde el shell (⌘K, «+ Nuevo»).
//
// CONTRATO con las pantallas (lo lee cada dueño de su ruta):
//   /atletas?invitar=1              → Atletas abre «Invitar atletas».
//   /programar/programas?nuevo=1    → Programas abre «Nuevo programa».
//   /programar/grupos?nuevo=1       → Grupos abre «Nuevo grupo».
//   /atletas/<id>?comunicado=nuevo  → la ficha abre el compositor de comunicado.
// Un parámetro que la pantalla aún no lea deja al coach en la pantalla correcta:
// nunca en un callejón.

import type { SearchLibraryItem } from '@/lib/coach/search';
import type { ShellAction } from './destinations';

/** Acciones que son navegar a una pantalla con su intención en la URL. */
export const ACTION_HREF: Partial<Record<ShellAction, string>> = {
  invitar_atleta: '/atletas?invitar=1',
  nuevo_entreno: '/programar/biblioteca/entreno/nuevo',
  nuevo_programa: '/programar/programas?nuevo=1',
  nuevo_grupo: '/programar/grupos?nuevo=1',
};

export const athleteHref = (id: string) => `/atletas/${id}`;
export const programHref = (id: string) => `/programar/programas/${id}`;
export const groupHref = (id: string) => `/programar/grupos/${id}`;
export const libraryHref = (item: Pick<SearchLibraryItem, 'id' | 'kind'>) =>
  item.kind === 'bloque' ? `/programar/biblioteca/bloque/${item.id}` : `/programar/biblioteca/entreno/${item.id}`;
export const comunicadoHref = (athleteId: string) => `/atletas/${athleteId}?comunicado=nuevo`;
