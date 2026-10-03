export const LIBRARY_VIEWS = ['entrenos', 'bloques', 'ejercicios', 'comunicados'] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

type LibraryContent = { entrenos: readonly { archived: boolean }[]; bloques: readonly { archived: boolean }[] };

/** Primera visita sin elección: el archivo histórico no decide dónde empezar. */
export function firstLibraryView(content: LibraryContent | null | undefined): LibraryView {
  if (content?.entrenos.some((row) => !row.archived)) return 'entrenos';
  return content?.bloques.some((row) => !row.archived) ? 'bloques' : 'entrenos';
}

/** URL explícita (también antigua) > elección recordada > contenido activo disponible. */
export function libraryView(params: URLSearchParams, remembered?: LibraryView, content?: LibraryContent | null): LibraryView {
  const value = params.get('ver');
  if (LIBRARY_VIEWS.includes(value as LibraryView)) return value as LibraryView;
  const legacy: Record<string, LibraryView> = { sesiones: 'entrenos', entrenos: 'entrenos', bloques: 'bloques', ejercicios: 'ejercicios', comunicados: 'comunicados' };
  return legacy[params.get('tab') ?? ''] ?? remembered ?? firstLibraryView(content);
}

/** Cambiar de categoría conserva el contexto de la URL y retira su filtro anterior. */
export function libraryViewParams(params: URLSearchParams, view: LibraryView): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('ver', view);
  next.delete('tab');
  next.delete('filtro');
  return next;
}
