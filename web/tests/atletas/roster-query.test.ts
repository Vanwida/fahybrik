import { describe, expect, test } from 'vitest';
import type { AthleteStatusKey } from '@fahybrid/shared/domain/coach/athlete-state';
import { BUILTIN_SAVED_VIEWS } from '@fahybrid/shared/schema/saved-views';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import {
  applyRosterQuery,
  countForQuery,
  fichaHref,
  filterString,
  neighbours,
  parseRosterQuery,
  sameView,
  serializeRosterQuery,
  viewQueryString,
} from '@/components/v2/atletas/roster-query';

function row(id: string, over: Partial<RosterRow> & { key?: AthleteStatusKey } = {}): RosterRow {
  const { key = 'al_dia', ...rest } = over;
  return {
    athlete_id: id,
    name: `Atleta ${id}`,
    avatar_url: null,
    email: `a${id}@x.com`,
    level: null,
    group: null,
    lifecycle: 'activo',
    status: { key, tone: 'ok', label: key, reason: null, signals: [], snoozed_until: null, needs_you: key === 'accion' || key === 'vigilar' },
    week_visibility: 'visible',
    readiness: null,
    adherence_14d: null,
    last_session_at: null,
    next_session: null,
    race: null,
    program: null,
    unread: 0,
    awaiting_reply: false,
    ...rest,
  };
}

const rows: RosterRow[] = [
  row('1', { key: 'accion', name: 'Marta Costa', level: { id: '3', label: 'N3' } }),
  row('2', { key: 'vigilar', name: 'Joan Ortega', week_visibility: 'oculta', level: { id: '4', label: 'N4' } }),
  row('3', { key: 'sin_plan', name: 'Àlex Roig', week_visibility: 'sin_plan', group: { id: '7', name: 'Mañanas' } }),
  row('4', { key: 'al_dia', name: 'Berta García', race: { name: 'Carrera', date: '2026-10-10', days: 17 } }),
  row('5', { key: 'pausado', name: 'Pau Font', week_visibility: 'oculta' }),
];

describe('parseRosterQuery', () => {
  test('sin filtros → la vista por defecto (Necesitan algo)', () => {
    const q = parseRosterQuery('');
    expect(q.atencion).toBe(true);
    expect(q.estado).toBeNull();
    expect(applyRosterQuery(rows, q).map((r) => r.athlete_id)).toEqual(['1', '2']);
  });

  test('la búsqueda sola no quita la vista por defecto', () => {
    expect(parseRosterQuery('q=marta').atencion).toBe(true);
  });

  test('con un filtro, lo que falta no filtra', () => {
    const q = parseRosterQuery('semana=oculta');
    expect(q.estado).toBeNull();
    expect(applyRosterQuery(rows, q).map((r) => r.athlete_id)).toEqual(['2', '5']);
  });

  test('estado=todos = sin filtro de estado', () => {
    expect(applyRosterQuery(rows, parseRosterQuery('estado=todos'))).toHaveLength(5);
  });

  test('ignora valores que no son de la gramática', () => {
    const q = parseRosterQuery('estado=accion,foo&nivel=3,abc&semana=nada&carrera=-3&orden=DROP%20TABLE');
    expect(q.estado).toEqual(['accion']);
    expect(q.nivel).toEqual(['3']);
    expect(q.semana).toBeNull();
    expect(q.carrera).toBeNull();
    expect(q.orden).toBeNull();
  });

  test('nivel=sin y grupo=sin filtran a quien no tiene', () => {
    expect(applyRosterQuery(rows, parseRosterQuery('nivel=sin')).map((r) => r.athlete_id)).toEqual(['3', '4', '5']);
    expect(applyRosterQuery(rows, parseRosterQuery('grupo=7')).map((r) => r.athlete_id)).toEqual(['3']);
  });

  test('carrera en ≤ N días', () => {
    expect(applyRosterQuery(rows, parseRosterQuery('carrera=30')).map((r) => r.athlete_id)).toEqual(['4']);
    expect(applyRosterQuery(rows, parseRosterQuery('carrera=14'))).toHaveLength(0);
  });

  test('búsqueda sin acentos ni mayúsculas, por palabras', () => {
    expect(applyRosterQuery(rows, parseRosterQuery('estado=todos&q=alex')).map((r) => r.athlete_id)).toEqual(['3']);
    expect(applyRosterQuery(rows, parseRosterQuery('estado=todos&q=mañanas')).map((r) => r.athlete_id)).toEqual(['3']);
    expect(applyRosterQuery(rows, parseRosterQuery('estado=todos&q=garcia berta')).map((r) => r.athlete_id)).toEqual([
      '4',
    ]);
  });

  test('sin dir, cada columna usa su sentido (último entreno: el más reciente primero)', () => {
    const withLast = rows.map((r, i) => ({ ...r, last_session_at: i < 3 ? `2026-09-2${i}T10:00:00Z` : null }));
    const q = parseRosterQuery('estado=todos&orden=ultimo_entreno');
    expect(q.orden).toEqual({ id: 'ultimo_entreno', dir: 'desc' });
    expect(applyRosterQuery(withLast, q).map((r) => r.athlete_id)).toEqual(['3', '2', '1', '4', '5']);
  });

  test('orden por columna; los vacíos siempre al final', () => {
    const withR = rows.map((r, i) =>
      i < 3 ? { ...r, readiness: { value: [50, 30, 70][i]!, baseline: null, trend_14d: [], observed_at: '2026-09-22', band: 'ok' as const } } : r,
    );
    const q = parseRosterQuery('estado=todos&orden=readiness&dir=asc');
    expect(applyRosterQuery(withR, q).map((r) => r.athlete_id)).toEqual(['2', '1', '3', '4', '5']);
  });
});

describe('serializar y vistas', () => {
  test('ida y vuelta', () => {
    const s = 'estado=accion&nivel=3,4&semana=oculta&carrera=30&orden=readiness&dir=desc&q=ber&densidad=tarjetas';
    expect(serializeRosterQuery(parseRosterQuery(s))).toBe(s);
  });

  test('la vista por defecto se serializa vacía', () => {
    expect(serializeRosterQuery(parseRosterQuery(''))).toBe('');
    expect(serializeRosterQuery(parseRosterQuery('atencion=si'))).toBe('');
    // Una vista vieja por estados sigue siendo válida, pero ya no es la de serie.
    expect(serializeRosterQuery(parseRosterQuery('estado=vigilar,accion'))).toBe('estado=accion,vigilar');
  });

  test('«Todos» se distingue de la vista por defecto', () => {
    expect(serializeRosterQuery(parseRosterQuery('estado=todos'))).toBe('estado=todos');
  });

  test('cada vista de serie se reconoce a sí misma y no a las demás', () => {
    for (const v of BUILTIN_SAVED_VIEWS) {
      const current = parseRosterQuery(v.query);
      for (const w of BUILTIN_SAVED_VIEWS) expect(sameView(current, w.query)).toBe(v.key === w.key);
    }
  });

  test('la vista guardada lleva filtros y orden, no búsqueda ni densidad', () => {
    expect(viewQueryString(parseRosterQuery('semana=oculta&q=ber&densidad=tarjetas&orden=atleta'))).toBe(
      'semana=oculta&orden=atleta&dir=asc',
    );
  });

  test('filterString es canónico (el orden de los valores no importa)', () => {
    expect(filterString(parseRosterQuery('nivel=4,3&estado=vigilar,accion'))).toBe(
      filterString(parseRosterQuery('estado=accion,vigilar&nivel=3,4')),
    );
  });

  test('recuentos por vista', () => {
    expect(countForQuery(rows, 'estado=accion,vigilar')).toBe(2);
    expect(countForQuery(rows, 'estado=todos')).toBe(5);
    expect(countForQuery(rows, 'semana=sin_plan')).toBe(1);
  });
});

describe('ficha: K/J con ?desde=', () => {
  test('vecinos dentro del filtro y del orden de la lista', () => {
    expect(neighbours(rows, 'estado=todos', '3')).toEqual({ prev: '2', next: '4', position: 3, total: 5 });
    expect(neighbours(rows, '', '1')).toEqual({ prev: null, next: '2', position: 1, total: 2 });
    expect(neighbours(rows, '', '4').position).toBeNull();
  });

  test('el enlace nunca lleva un desde vacío', () => {
    expect(fichaHref('9', parseRosterQuery(''))).toBe('/atletas/9?desde=atencion%3Dsi');
    expect(fichaHref('9', parseRosterQuery('estado=todos&densidad=tarjetas'))).toBe('/atletas/9?desde=estado%3Dtodos');
  });
});
