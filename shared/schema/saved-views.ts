import { z } from 'zod';

// VISTAS GUARDADAS de Atletas (§4.8): un nombre + la cadena de consulta de la URL
// de Atletas. Las vistas de serie no se guardan: viven aquí, y sus nombres quedan
// reservados para que el coach no cree una «Todos» que no es la de todos.
//
// La gramática de filtros de la URL la define la pantalla de Atletas; las
// consultas de serie usan los valores de los contratos §4.1 (estado) y §4.4
// (semana). Si Atletas cambia un nombre de parámetro, se cambia AQUÍ, en un sitio.

export const SAVED_VIEW_NAME_MAX = 60;
export const SAVED_VIEW_QUERY_MAX = 2000;

export interface BuiltinSavedView {
  key: 'necesitan' | 'todos' | 'sin_plan' | 'no_ven_semana' | 'pausados';
  name: string;
  query: string;
}

export const BUILTIN_SAVED_VIEWS: readonly BuiltinSavedView[] = [
  { key: 'necesitan', name: 'Necesitan algo', query: 'estado=accion,vigilar' },
  { key: 'todos', name: 'Todos', query: '' },
  { key: 'sin_plan', name: 'Sin plan', query: 'semana=sin_plan' },
  { key: 'no_ven_semana', name: 'No ven su semana', query: 'semana=oculta' },
  { key: 'pausados', name: 'Pausados', query: 'estado=pausado' },
] as const;

/** Comparación de nombres: sin mayúsculas, sin acentos, sin espacios de los bordes. */
export function normalizeViewName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function isReservedViewName(name: string): boolean {
  const n = normalizeViewName(name);
  return BUILTIN_SAVED_VIEWS.some((v) => normalizeViewName(v.name) === n);
}

/** «?a=1&b=2» o «a=1&b=2» → «a=1&b=2». Sin fragmentos ni saltos de línea. */
export function normalizeViewQuery(raw: string): string {
  return raw.trim().replace(/^\?/, '');
}

const viewName = z
  .string()
  .trim()
  .min(1, 'Ponle un nombre a la vista.')
  .max(SAVED_VIEW_NAME_MAX, `El nombre no puede pasar de ${SAVED_VIEW_NAME_MAX} caracteres.`)
  .refine((n) => !isReservedViewName(n), {
    message: 'Ese nombre ya es una vista de serie. Elige otro (p. ej. «N3 sin plan»).',
  });

const viewQuery = z
  .string()
  .max(SAVED_VIEW_QUERY_MAX, 'El filtro es demasiado largo.')
  .transform(normalizeViewQuery)
  .refine((q) => !/[#\r\n]/.test(q), {
    message: 'El filtro tiene que ser la parte de la URL después de «?», sin «#».',
  });

export const savedViewCreateSchema = z
  .object({
    name: viewName,
    query: viewQuery.default(''),
    position: z.number().int().min(0).optional(),
  })
  .strict();
export type SavedViewCreateInput = z.infer<typeof savedViewCreateSchema>;

export const savedViewPatchSchema = z
  .object({
    name: viewName.optional(),
    query: viewQuery.optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay nada que cambiar.' });
export type SavedViewPatchInput = z.infer<typeof savedViewPatchSchema>;

export interface SavedView {
  id: string;
  name: string;
  query: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SavedViewsResponse {
  builtin: readonly BuiltinSavedView[];
  views: SavedView[];
}
