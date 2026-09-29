// ¿Mejoro en los tests? (shared/domain/analytics/progreso-tests.ts): un test
// dirigido se juzga contra el ANTERIOR (caiga donde caiga la ventana); un
// umbral de pulso no tiene «mejor»; los peldaños de correr/ergo no duplican
// récord aquí.

import { describe, expect, test } from 'vitest';
import { progresoTests, unidadDeTest, type EntradaTests, type ResultadoTest } from '@fahybrid/shared/domain/analytics/progreso-tests';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function entrada(resultados: ResultadoTest[]): EntradaTests {
  return { ventana, resultados, metodo: defaultCoachAnalyticsMethod() };
}

describe('progresoTests — un umbral de pulso no tiene «mejor»', () => {
  test('lthr_bpm: veredicto null siempre, y no produce candidato a récord', () => {
    const resultados: ResultadoTest[] = [
      { dia: '2026-08-10', slug: 'lthr_bpm', valor: 165, unidad_bd: 'bpm' },
      { dia: '2026-09-10', slug: 'lthr_bpm', valor: 170, unidad_bd: 'bpm' },
    ];
    const { lecturas, candidatos } = progresoTests(entrada(resultados));
    const l = lecturas.find((x) => x.id === 'test.lthr_bpm')!;
    expect(l.dato!.unidad).toBe('bpm');
    expect(l.veredicto).toBeNull();
    expect(candidatos.some((c) => c.prueba === 'test.lthr_bpm')).toBe(false);
  });
});

describe('progresoTests — un test dirigido se juzga contra el test ANTERIOR', () => {
  test('back_squat_1rm: 180 → 185 kg (2,8 %) es «mejor», con la referencia al test anterior', () => {
    const resultados: ResultadoTest[] = [
      { dia: '2026-08-10', slug: 'back_squat_1rm', valor: 180, unidad_bd: 'kg' },
      { dia: '2026-09-10', slug: 'back_squat_1rm', valor: 185, unidad_bd: 'kg' },
    ];
    const { lecturas, candidatos } = progresoTests(entrada(resultados));
    const l = lecturas.find((x) => x.id === 'test.back_squat_1rm')!;
    expect(l.familia).toBe('fuerza');
    expect(l.dato!.valor).toBe(185);
    expect(l.dato!.referencia).toEqual({ valor: 180, delta: 5, de: 'test_anterior' });
    expect(l.veredicto).toMatchObject({ code: 'mejor' });
    expect(candidatos.filter((c) => c.prueba === 'test.back_squat_1rm')).toHaveLength(2);
  });

  test('run_5k produce su lectura (familia correr) pero NINGÚN candidato: compite en la escalera de correr', () => {
    const resultados: ResultadoTest[] = [{ dia: '2026-09-10', slug: 'run_5k', valor: 1200, unidad_bd: 'seconds' }];
    const { lecturas, candidatos } = progresoTests(entrada(resultados));
    const l = lecturas.find((x) => x.id === 'test.run_5k')!;
    expect(l.familia).toBe('correr');
    expect(candidatos.some((c) => c.prueba === 'test.run_5k')).toBe(false);
  });
});

describe('unidadDeTest', () => {
  test('los umbrales de ritmo llevan su propia unidad, pase lo que pase en la base', () => {
    expect(unidadDeTest('run_threshold_s_per_km', 'seconds')).toBe('s_km');
    expect(unidadDeTest('row_threshold_s_per_500m', 'seconds')).toBe('s_500m');
  });

  test('el resto sale de la unidad de la base', () => {
    expect(unidadDeTest('cmj', 'cm')).toBe('cm');
  });

  test('una unidad de base desconocida → null', () => {
    expect(unidadDeTest('algo_raro', 'furlongs')).toBeNull();
  });
});

describe('progresoTests — hyrox_open se ignora: es de la carrera, no un test', () => {
  test('sin lectura ni candidato', () => {
    const { lecturas, candidatos } = progresoTests(entrada([{ dia: '2026-09-05', slug: 'hyrox_open', valor: 3600, unidad_bd: 'seconds' }]));
    expect(lecturas).toHaveLength(0);
    expect(candidatos).toHaveLength(0);
  });
});
