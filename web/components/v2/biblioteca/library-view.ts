export const LIBRARY_VIEWS = ['entrenos', 'bloques', 'ejercicios', 'comunicados'] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

/** La categoría explícita, incluyendo enlaces anteriores, precede a la recordada. */
export function libraryView(params: URLSearchParams, remembered: LibraryView = 'entrenos'): LibraryView {
  const value = params.get('ver');
  if (LIBRARY_VIEWS.includes(value as LibraryView)) return value as LibraryView;
  const legacy: Record<string, LibraryView> = { sesiones: 'entrenos', entrenos: 'entrenos', bloques: 'bloques', ejercicios: 'ejercicios', comunicados: 'comunicados' };
  return legacy[params.get('tab') ?? ''] ?? remembered;
}

/** Cambiar de categoría conserva el contexto de la URL y retira su filtro anterior. */
export function libraryViewParams(params: URLSearchParams, view: LibraryView): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('ver', view);
  next.delete('tab');
  next.delete('filtro');
  return next;
}
