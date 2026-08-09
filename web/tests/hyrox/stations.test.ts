// Unit tests for the HYROX stations module — the single source of truth for
// the 8 official race stations (order, slug, canonical measure, load by
// division/gender). Pure, no DB.
//
// Covers exactly what a badly-modelled catalog would break silently: a real
// slug that doesn't resolve, a free-text token the import grammar actually
// sends that the resolver misses, or — worse — a load the module INVENTS for
// a cell nobody sourced (the one failure mode that puts an athlete under the
// wrong bar).

import { describe, expect, test } from 'vitest';
import {
  HYROX_STATIONS,
  HYROX_STATION_COUNT,
  hyroxStationLoad,
  resolveHyroxStation,
  resolveHyroxStationBySlug,
  resolveHyroxStationByToken,
  type HyroxStationSlug,
} from '@fahybrid/shared/domain/hyrox/stations';

describe('HYROX_STATIONS · estructura', () => {
  test('las 8, en orden oficial 1..8, sin huecos', () => {
    expect(HYROX_STATIONS).toHaveLength(HYROX_STATION_COUNT);
    expect(HYROX_STATIONS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('SkiErg abre la carrera, Wall Balls la cierra', () => {
    expect(HYROX_STATIONS[0]?.slug).toBe('ski-erg');
    expect(HYROX_STATIONS[HYROX_STATIONS.length - 1]?.slug).toBe('hyrox-wall-balls');
  });
});

describe('resolveHyroxStationBySlug', () => {
  test('resuelve los 8 slugs reales del catálogo (exercises.slug)', () => {
    const slugs: HyroxStationSlug[] = [
      'ski-erg',
      'hyrox-sled-push',
      'hyrox-sled-pull',
      'hyrox-burpee-broad-jump',
      'row',
      'hyrox-farmer-carry',
      'hyrox-sandbag-lunges',
      'hyrox-wall-balls',
    ];
    for (const slug of slugs) {
      expect(resolveHyroxStationBySlug(slug)?.slug, slug).toBe(slug);
    }
  });

  test('un slug que no existe en el catálogo real no resuelve — null, nunca el más parecido', () => {
    expect(resolveHyroxStationBySlug('sled-push')).toBeNull(); // el genérico, no el real (hyrox-sled-push)
    expect(resolveHyroxStationBySlug('wall-balls')).toBeNull(); // idem (hyrox-wall-balls)
    expect(resolveHyroxStationBySlug('')).toBeNull();
  });
});

describe('resolveHyroxStationByToken · tolerante a texto sucio', () => {
  test.each([
    ['sled push', 'hyrox-sled-push'],
    ['SledPush', 'hyrox-sled-push'],
    ['wall balls', 'hyrox-wall-balls'],
    ['WB', 'hyrox-wall-balls'],
    ['Burpee BJ', 'hyrox-burpee-broad-jump'],
    ['Lunges', 'hyrox-sandbag-lunges'],
    ['Farmers', 'hyrox-farmer-carry'],
    ['  ski erg  ', 'ski-erg'],
    ['SKIERG', 'ski-erg'],
    ['Rowing', 'row'],
    ['remo', 'row'],
    ['Sled-Pull', 'hyrox-sled-pull'],
  ] as const)('%s → %s', (token, expectedSlug) => {
    expect(resolveHyroxStationByToken(token)?.slug).toBe(expectedSlug);
  });

  test('texto que no es ninguna de las 8 estaciones → null', () => {
    expect(resolveHyroxStationByToken('sentadilla')).toBeNull();
    expect(resolveHyroxStationByToken('')).toBeNull();
    expect(resolveHyroxStationByToken('   ')).toBeNull();
  });
});

describe('resolveHyroxStation · acepta slug real o token suelto', () => {
  test('un slug real', () => {
    expect(resolveHyroxStation('hyrox-wall-balls')?.slug).toBe('hyrox-wall-balls');
  });

  test('texto libre', () => {
    expect(resolveHyroxStation('Wall Balls')?.slug).toBe('hyrox-wall-balls');
  });
});

describe('hyroxStationLoad · Open vs Pro, hombres (la única fuente que tenemos)', () => {
  test('sled push: 152 kg Open · 202 kg Pro — TOTAL, no por implemento', () => {
    expect(hyroxStationLoad('hyrox-sled-push', 'open', 'men')).toEqual({ kind: 'sled', kg: 152 });
    expect(hyroxStationLoad('hyrox-sled-push', 'pro', 'men')).toEqual({ kind: 'sled', kg: 202 });
  });

  test('sled pull: 103 kg Open · 153 kg Pro', () => {
    expect(hyroxStationLoad('hyrox-sled-pull', 'open', 'men')).toEqual({ kind: 'sled', kg: 103 });
    expect(hyroxStationLoad('hyrox-sled-pull', 'pro', 'men')).toEqual({ kind: 'sled', kg: 153 });
  });

  test('farmers carry: POR implemento — 2×24 kg Open, jamás "48 kg"', () => {
    expect(hyroxStationLoad('hyrox-farmer-carry', 'open', 'men')).toEqual({
      kind: 'per_implement',
      kg: 24,
      implements: 2,
    });
    expect(hyroxStationLoad('hyrox-farmer-carry', 'pro', 'men')).toEqual({
      kind: 'per_implement',
      kg: 32,
      implements: 2,
    });
  });

  test('sandbag lunges: 20 kg Open · 30 kg Pro', () => {
    expect(hyroxStationLoad('hyrox-sandbag-lunges', 'open', 'men')).toEqual({ kind: 'single', kg: 20 });
    expect(hyroxStationLoad('hyrox-sandbag-lunges', 'pro', 'men')).toEqual({ kind: 'single', kg: 30 });
  });

  test('wall balls: 6 kg Open · 9 kg Pro', () => {
    expect(hyroxStationLoad('hyrox-wall-balls', 'open', 'men')).toEqual({ kind: 'single', kg: 6 });
    expect(hyroxStationLoad('hyrox-wall-balls', 'pro', 'men')).toEqual({ kind: 'single', kg: 9 });
  });

  test('ergos: damper 6 Open · damper 7 Pro, en ski Y en row', () => {
    expect(hyroxStationLoad('ski-erg', 'open', 'men')).toEqual({ kind: 'damper', setting: 6 });
    expect(hyroxStationLoad('ski-erg', 'pro', 'men')).toEqual({ kind: 'damper', setting: 7 });
    expect(hyroxStationLoad('row', 'open', 'men')).toEqual({ kind: 'damper', setting: 6 });
    expect(hyroxStationLoad('row', 'pro', 'men')).toEqual({ kind: 'damper', setting: 7 });
  });

  test('el damper no varía por género — la fuente no lo separa, así que responde igual en vez de esconderlo', () => {
    expect(hyroxStationLoad('ski-erg', 'open', 'women')).toEqual({ kind: 'damper', setting: 6 });
    expect(hyroxStationLoad('row', 'pro', 'women')).toEqual({ kind: 'damper', setting: 7 });
  });
});

describe('hyroxStationLoad · lo que NO sabemos es null, nunca un valor inventado', () => {
  const cargadas: HyroxStationSlug[] = [
    'hyrox-sled-push',
    'hyrox-sled-pull',
    'hyrox-farmer-carry',
    'hyrox-sandbag-lunges',
    'hyrox-wall-balls',
  ];

  test('mujeres: sin fuente en ninguna estación con carga por peso — null, JAMÁS el número de hombres', () => {
    for (const slug of cargadas) {
      expect(hyroxStationLoad(slug, 'open', 'women'), slug).toBeNull();
      expect(hyroxStationLoad(slug, 'pro', 'women'), slug).toBeNull();
    }
  });

  test('división elite: sin fuente en ninguna estación', () => {
    for (const slug of cargadas) {
      expect(hyroxStationLoad(slug, 'elite', 'men'), slug).toBeNull();
    }
    expect(hyroxStationLoad('ski-erg', 'elite', 'men')).toBeNull();
  });

  test('burpee broad jump: sin eje de carga — peso corporal, null pase lo que pase', () => {
    expect(hyroxStationLoad('hyrox-burpee-broad-jump', 'open', 'men')).toBeNull();
    expect(hyroxStationLoad('hyrox-burpee-broad-jump', 'pro', 'women')).toBeNull();
    expect(hyroxStationLoad('hyrox-burpee-broad-jump', 'elite', 'men')).toBeNull();
  });
});
