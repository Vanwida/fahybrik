// La URL de Atletas: la gramática de filtros, orden y búsqueda, y cómo se
// aplica a las filas del roster. PURO (sin React ni base de datos): lo usan la
// lista, las vistas guardadas (sus `query` son esta cadena) y la ficha del
// atleta para su K/J (`?desde=<esta cadena>` → mismo orden, mismo filtro).
//
//   estado=accion,vigilar | estado=todos     estado del atleta (§4.1)
//   nivel=3,4 | nivel=sin                     id de athlete_levels del coach
//   grupo=7 | grupo=sin                        id del grupo (program_sequences)
//   semana=visible,oculta,sin_plan,terminado  su semana en curso (§4.4)
//   carrera=30                                 carrera objetivo en ≤ N días
//   q=ber                                      búsqueda (nombre, email, grupo, nivel)
//   orden=readiness&dir=asc                    columna y sentido (sin él: peor primero)
//   densidad=tarjetas                          presentación (no forma parte de la vista)
//
// Sin NINGÚN filtro en la URL se aplica la vista por defecto (Necesitan algo).
// Con algún filtro, lo que falta no filtra: `semana=oculta` son todos los que no
// ven su semana, estén como estén. Las vistas de serie viven en
// shared/schema/saved-views.ts con esta misma gramática.

import type { AthleteStatusKey } from '@fahybrid/shared/domain/coach/athlete-state';
import { BUILTIN_SAVED_VIEWS } from '@fahybrid/shared/schema/saved-views';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { sortRows, type SortState, type SortValue } from '@/components/v2/ui/table-logic';

export type WeekVisibility = RosterRow['week_visibility'];
export type Density = 'tabla' | 'tarjetas';

export const STATUS_KEYS: readonly AthleteStatusKey[] = ['accion', 'vigilar', 'nuevo', 'sin_plan', 'al_dia', 'pausado'];
export const WEEK_KEYS: readonly WeekVisibility[] = ['visible', 'oculta', 'sin_plan', 'terminado'];
/** Opciones del filtro «Carrera en menos de…». Rejilla de la interfaz, no método. */
export const RACE_WINDOWS: readonly number[] = [14, 30, 60, 90];
export const NONE = 'sin';

export const STATUS_LABEL: Record<AthleteStatusKey, string> = {
  accion: 'Acción',
  vigilar: 'Vigilar',
  nuevo: 'Alta pendiente',
  sin_plan: 'Sin plan',
  al_dia: 'Al día',
  pausado: 'En pausa',
};

export const WEEK_LABEL: Record<WeekVisibility, string> = {
  visible: 'Visible',
  oculta: 'Oculta',
  sin_plan: 'Sin plan',
  terminado: 'Terminado',
};

export interface RosterFilter {
  /** null = cualquier estado. */
  estado: AthleteStatusKey[] | null;
  nivel: string[] | null;
  grupo: string[] | null;
  semana: WeekVisibility[] | null;
  carrera: number | null;
}

export interface RosterQuery extends RosterFilter {
  q: string;
  orden: SortState | null;
  densidad: Density;
}

const FILTER_KEYS = ['estado', 'nivel', 'grupo', 'semana', 'carrera'] as const;

const DEFAULT_QUERY = BUILTIN_SAVED_VIEWS.find((v) => v.key === 'necesitan')?.query ?? 'estado=accion,vigilar';

function list<T extends string>(raw: string | null, allowed?: readonly T[]): T[] | null {
  if (raw == null) return null;
  const items = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  const kept = allowed ? items.filter((s): s is T => (allowed as readonly string[]).includes(s)) : (items as T[]);
  return kept.length > 0 ? kept : null;
}

function idList(raw: string | null): string[] | null {
  const items = list<string>(raw);
  if (!items) return null;
  const kept = items.filter((s) => s === NONE || /^\d{1,18}$/.test(s));
  return kept.length > 0 ? kept : null;
}

function toParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.replace(/^\?/, '')) : search;
}

function hasFilter(p: URLSearchParams): boolean {
  return FILTER_KEYS.some((k) => p.has(k));
}

function parseFilter(p: URLSearchParams): RosterFilter {
  const estadoRaw = p.get('estado');
  const carrera = Number.parseInt(p.get('carrera') ?? '', 10);
  return {
    estado: estadoRaw === 'todos' ? null : list(estadoRaw, STATUS_KEYS),
    nivel: idList(p.get('nivel')),
    grupo: idList(p.get('grupo')),
    semana: list(p.get('semana'), WEEK_KEYS),
    carrera: Number.isFinite(carrera) && carrera > 0 && carrera <= 999 ? carrera : null,
  };
}

/** La URL (o una `query` de vista guardada) → estado de la lista. */
export function parseRosterQuery(search: string | URLSearchParams): RosterQuery {
  const p = toParams(search);
  const filter = hasFilter(p) ? parseFilter(p) : parseFilter(new URLSearchParams(DEFAULT_QUERY));
  const orden = p.get('orden');
  const dir = p.get('dir');
  return {
    ...filter,
    q: (p.get('q') ?? '').trim().slice(0, 80),
    orden: orden && /^[a-z_]{1,24}$/.test(orden) ? { id: orden, dir: dir === 'desc' ? 'desc' : 'asc' } : null,
    densidad: p.get('densidad') === 'tarjetas' ? 'tarjetas' : 'tabla',
  };
}

/** Solo los filtros, en orden canónico: la identidad de una vista. */
export function filterString(f: RosterFilter): string {
  const parts: string[] = [];
  const any = f.nivel || f.grupo || f.semana || f.carrera != null;
  if (f.estado) parts.push(`estado=${STATUS_KEYS.filter((k) => f.estado!.includes(k)).join(',')}`);
  else if (!any) parts.push('estado=todos');
  if (f.nivel) parts.push(`nivel=${[...f.nivel].sort().join(',')}`);
  if (f.grupo) parts.push(`grupo=${[...f.grupo].sort().join(',')}`);
  if (f.semana) parts.push(`semana=${WEEK_KEYS.filter((k) => f.semana!.includes(k)).join(',')}`);
  if (f.carrera != null) parts.push(`carrera=${f.carrera}`);
  return parts.join('&');
}

/** Lo que se guarda en una vista: filtros + orden (sin búsqueda ni densidad). */
export function viewQueryString(q: RosterQuery): string {
  const parts = [filterString(q)];
  if (q.orden) parts.push(`orden=${q.orden.id}&dir=${q.orden.dir}`);
  return parts.filter(Boolean).join('&');
}

/** La URL entera. La vista por defecto sin nada más = cadena vacía. */
export function serializeRosterQuery(q: RosterQuery): string {
  const view = viewQueryString(q);
  const parts = view === DEFAULT_QUERY ? [] : [view];
  if (q.q) parts.push(`q=${encodeURIComponent(q.q)}`);
  if (q.densidad === 'tarjetas') parts.push('densidad=tarjetas');
  return parts.filter(Boolean).join('&');
}

/** ¿Es esta la vista de `query`? Compara filtros canónicos (el orden y la búsqueda no cuentan). */
export function sameView(current: RosterFilter, query: string): boolean {
  return filterString(current) === filterString(parseRosterQuery(query));
}

// ── Aplicar ───────────────────────────────────────────────────────────────────

/** Sin mayúsculas ni acentos. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesSearch(r: RosterRow, q: string): boolean {
  const hay = fold([r.name, r.email ?? '', r.group?.name ?? '', r.level?.label ?? ''].join(' '));
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function matchesFilter(r: RosterRow, f: RosterFilter): boolean {
  if (f.estado && !f.estado.includes(r.status.key)) return false;
  if (f.nivel && !f.nivel.includes(r.level?.id ?? NONE)) return false;
  if (f.grupo && !f.grupo.includes(r.group?.id ?? NONE)) return false;
  if (f.semana && !f.semana.includes(r.week_visibility)) return false;
  if (f.carrera != null && !(r.race && r.race.days >= 0 && r.race.days <= f.carrera)) return false;
  return true;
}

/** Orden de estado «peor primero» (mismo que compareRosterRows del loader). */
const STATUS_RANK: Record<AthleteStatusKey, number> = {
  accion: 0,
  vigilar: 1,
  sin_plan: 2,
  nuevo: 3,
  al_dia: 4,
  pausado: 5,
};

const WEEK_RANK: Record<WeekVisibility, number> = { oculta: 0, sin_plan: 1, terminado: 2, visible: 3 };

/** Qué valor ordena cada columna. Las columnas de la tabla usan ESTE mapa. */
export const SORT_VALUES: Record<string, (r: RosterRow) => SortValue> = {
  atleta: (r) => r.name,
  estado: (r) => STATUS_RANK[r.status.key],
  semana: (r) => WEEK_RANK[r.week_visibility],
  readiness: (r) => r.readiness?.value,
  adherencia: (r) => r.adherence_14d?.pct,
  ultimo: (r) => (r.last_session_at ? Date.parse(r.last_session_at) : null),
  proximo: (r) => r.next_session?.date,
  carrera: (r) => r.race?.days,
  // Por responder: quien más lleva esperando, primero en «desc».
  responder: (r) => {
    if (!r.awaiting_reply) return null;
    const since = r.status.signals.find((s) => s.kind === 'message_unanswered')?.observed_at;
    return since ? -Date.parse(since) : -Number.MAX_SAFE_INTEGER;
  },
};

/**
 * Filtra, busca y ordena. Las filas llegan ya en «peor primero» (loadRoster);
 * sin `orden` se respeta ese orden.
 */
export function applyRosterQuery(rows: readonly RosterRow[], q: RosterQuery): RosterRow[] {
  const kept = rows.filter((r) => matchesFilter(r, q) && (!q.q || matchesSearch(r, q.q)));
  const value = q.orden ? SORT_VALUES[q.orden.id] : undefined;
  return value && q.orden ? sortRows(kept, value, q.orden.dir) : kept;
}

/** Cuántas filas entran en la vista `query` (sin búsqueda). */
export function countForQuery(rows: readonly RosterRow[], query: string): number {
  const f = parseRosterQuery(query);
  let n = 0;
  for (const r of rows) if (matchesFilter(r, f)) n += 1;
  return n;
}

/**
 * Anterior y siguiente de `athleteId` en la lista `desde` (la ficha: K/J).
 * `position` es 1-based; null si el atleta ya no entra en ese filtro.
 */
export function neighbours(
  rows: readonly RosterRow[],
  desde: string,
  athleteId: string,
): { prev: string | null; next: string | null; position: number | null; total: number } {
  const ordered = applyRosterQuery(rows, parseRosterQuery(desde));
  const i = ordered.findIndex((r) => r.athlete_id === athleteId);
  return {
    prev: i > 0 ? ordered[i - 1]!.athlete_id : null,
    next: i >= 0 && i < ordered.length - 1 ? ordered[i + 1]!.athlete_id : null,
    position: i >= 0 ? i + 1 : null,
    total: ordered.length,
  };
}

/**
 * Enlace a la ficha que conserva la lista (para su K/J): `?desde=` lleva la
 * consulta de la lista (filtros, orden y búsqueda; nunca vacía).
 */
export function fichaHref(athleteId: string, q: RosterQuery): string {
  const desde = serializeRosterQuery({ ...q, densidad: 'tabla' }) || DEFAULT_QUERY;
  return `/atletas/${athleteId}?desde=${encodeURIComponent(desde)}`;
}
