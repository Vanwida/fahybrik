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

describe('hyroxStationLoad · HOY no hay ninguna carga con fuente', () => {
  // Este bloque fijaba números concretos (152/202 kg de trineo, 2×24 de
  // farmers, 6/9 de wall ball). Se han retirado del módulo: venían de un
  // documento que el usuario describió como «uno que me ha hecho la IA» y que
  // había pasado como plan de EJEMPLO. Un ejemplo sirve para romper el modelo,
  // nunca para poblarlo, y salida de un modelo de lenguaje no es una fuente por
  // mucho que el documento cite webs por dentro.
  //
  // Lo que se prueba ahora es lo único que es cierto: que el módulo NO adivina.
  // Cuando llegue el rulebook oficial se rellena la tabla y estos tests se
  // convierten otra vez en aserciones de valor — la FORMA ya está modelada y
  // probada abajo.
  test('ninguna estación devuelve carga, en ninguna división ni género', () => {
    for (const st of HYROX_STATIONS) {
      for (const division of ['open', 'pro', 'elite'] as const) {
        for (const gender of ['men', 'women', 'mixed'] as const) {
          expect(hyroxStationLoad(st.slug, division, gender), `${st.slug} ${division} ${gender}`).toBeNull();
        }
      }
    }
  });

  test('las estaciones CON eje de carga lo declaran vacío, no ausente', () => {
    // La diferencia importa y son tres estados distintos:
    //   `loads: [...]` → lleva carga y la sabemos
    //   `loads: []`    → lleva carga y NO la sabemos  ← hoy, todas
    //   sin campo      → no lleva carga (burpee broad jump: peso corporal)
    // Colapsar los dos últimos diría que un trineo no lleva peso, que es falso.
    const sinEjeDeCarga = new Set(['hyrox-burpee-broad-jump']);
    for (const st of HYROX_STATIONS) {
      if (sinEjeDeCarga.has(st.slug)) {
        expect(st.loads, st.slug).toBeUndefined();
        continue;
      }
      expect(Array.isArray(st.loads), st.slug).toBe(true);
      expect(st.loads!.length, st.slug).toBe(0);
    }
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
