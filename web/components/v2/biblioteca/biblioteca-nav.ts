// Biblioteca — rutas y layout compartidos por el shell y sus paneles. Fuente
// única: la escalera Ejercicio › Bloque › Sesión › Microciclo tiene una ruta por
// peldaño, y cada peldaño edita SU tabla.
//
// OJO al cambio de significado: `/biblioteca/sesion/[id]` antes recibía un
// `blocks.id` (editaba un bloque llamándolo sesión). Ahora recibe un
// `templates.id` y los bloques viven en `/biblioteca/bloque/[id]`.

export type BibliotecaTab = 'ejercicios' | 'bloques' | 'sesiones' | 'microciclos';

export const BIBLIOTECA_TABS: readonly BibliotecaTab[] = [
  'ejercicios',
  'bloques',
  'sesiones',
  'microciclos',
];

/** Nuevo BLOQUE (pieza reutilizable) — editor de bloque, desde cero. */
export const NUEVO_BLOQUE_HREF = '/biblioteca/bloque/nuevo';

/** Nueva SESIÓN (un entreno completo) — editor de sesión, desde cero. */
export const NUEVA_SESION_HREF = '/biblioteca/sesion/nueva';

export const GRID_CLS = 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3';

export function resolveBibliotecaTab(raw: string | undefined): BibliotecaTab {
  return BIBLIOTECA_TABS.includes(raw as BibliotecaTab) ? (raw as BibliotecaTab) : 'bloques';
}
