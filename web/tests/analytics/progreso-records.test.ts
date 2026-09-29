// Récords (shared/domain/analytics/records.ts): un récord es una progresión
// de mejoras ESTRICTAS, nunca un máximo suelto; lo nuevo se marca por fecha
// dentro de la ventana; el orden de la lista es nuevo-primero, luego por familia.

import { describe, expect, test } from 'vitest';
import {
  lecturasRecords,
  recordsPorPrueba,
  VEREDICTO_NUEVO,
  type CandidatoRecord,
} from '@fahybrid/shared/domain/analytics/records';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Familia } from '@fahybrid/shared/domain/analytics/lectura';

const PROC = { de: 'test', explica_es: 'test', medida: true, ancla: null, proveedor: null };

function candidato(overrides: Partial<CandidatoRecord> & Pick<CandidatoRecord, 'prueba' | 'dia' | 'valor'>): CandidatoRecord {
  return {
    familia: 'correr' as Familia,
    titulo_es: overrides.prueba,
    unidad: 'segundos',
    sentido: 'menor',
    procedencia: PROC,
    ...overrides,
  };
}

// Hoy 2026-09-29; ventana 4s → 2026-09-02..2026-09-29.
const ventana = resolverVentana({ clave: '4s', hoy_local: '2026-09-29', primera_sesion_iso: '2026-01-01' });

describe('recordsPorPrueba', () => {
  test('la progresión guarda solo mejoras ESTRICTAS: un empate posterior no es récord nuevo', () => {
    const candidatos = [
      candidato({ prueba: 'x', dia: '2026-01-01', valor: 100 }),
      candidato({ prueba: 'x', dia: '2026-01-05', valor: 92 }), // peor intento del mismo día
      candidato({ prueba: 'x', dia: '2026-01-05', valor: 90 }), // el bueno del mismo día
      candidato({ prueba: 'x', dia: '2026-01-10', valor: 80 }),
      candidato({ prueba: 'x', dia: '2026-01-15', valor: 80 }), // empate: NO es una marca nueva
    ];
    const r = recordsPorPrueba(candidatos).get('x')!;
    expect(r.progresion.map((c) => [c.dia, c.valor])).toEqual([
      ['2026-01-01', 100],
      ['2026-01-05', 90],
      ['2026-01-10', 80],
    ]);
    expect(r.record).toEqual(r.progresion[2]);
    expect(r.record.dia).toBe('2026-01-10');
    expect(r.anterior).toEqual(r.progresion[1]);
    expect(r.anterior!.dia).toBe('2026-01-05');
    // Dos intentos el mismo día: se queda el mejor, pero los intentos cuentan todos.
    expect(r.intentos).toBe(5);
    expect(r.dias_intentos).toEqual(['2026-01-01', '2026-01-05', '2026-01-10', '2026-01-15']);
  });

  test('sin progresión anterior (la primera marca): `anterior` es null', () => {
    const r = recordsPorPrueba([candidato({ prueba: 'x', dia: '2026-01-01', valor: 100 })]).get('x')!;
    expect(r.progresion).toHaveLength(1);
    expect(r.anterior).toBeNull();
  });

  test('los candidatos con valor <= 0 se ignoran, incluso al decidir la progresión', () => {
    const candidatos = [
      candidato({ prueba: 'x', dia: '2026-01-01', valor: -5 }),
      candidato({ prueba: 'x', dia: '2026-01-02', valor: 0 }),
      candidato({ prueba: 'x', dia: '2026-01-03', valor: 100 }),
    ];
    const r = recordsPorPrueba(candidatos).get('x')!;
    expect(r.progresion).toEqual([candidatos[2]]);
    expect(r.intentos).toBe(1);
  });

  test('una prueba con SOLO candidatos inválidos no aparece en el mapa', () => {
    const mapa = recordsPorPrueba([candidato({ prueba: 'y', dia: '2026-01-01', valor: -1 })]);
    expect(mapa.has('y')).toBe(false);
  });
});

describe('lecturasRecords', () => {
  test('id, grupo, referencia al récord anterior, serie de la progresión y veredicto solo si es nuevo', () => {
    // Dos intentos (para tener `anterior`), el segundo (el récord) dentro de la ventana → nuevo.
    const candidatos = [
      candidato({ prueba: 'estaciones.a', familia: 'estaciones', dia: '2026-08-01', valor: 200 }),
      candidato({ prueba: 'estaciones.a', familia: 'estaciones', dia: '2026-09-10', valor: 180 }),
    ];
    const [l] = lecturasRecords(candidatos, ventana);
    expect(l!.id).toBe('records.estaciones.a');
    expect(l!.grupo).toBe('records');
    expect(l!.dato!.valor).toBe(180);
    expect(l!.dato!.referencia).toEqual({ valor: 200, delta: -20, de: 'record_anterior' });
    expect(l!.serie!.paso).toBe('dia');
    expect(l!.serie!.puntos).toEqual([
      { t: '2026-08-01', v: 200 },
      { t: '2026-09-10', v: 180 },
    ]);
    expect(l!.veredicto).toEqual(VEREDICTO_NUEVO);
  });

  test('una sola marca de siempre: sin récord anterior, `dato.referencia` es null', () => {
    const candidatos = [candidato({ prueba: 'correr.a', dia: '2026-01-02', valor: 1000 })];
    const [l] = lecturasRecords(candidatos, ventana);
    expect(l!.dato!.referencia).toBeNull();
    expect(l!.veredicto).toBeNull(); // el día '2026-01-02' cae fuera de la ventana
  });

  test('orden: lo nuevo primero (más reciente arriba), luego el resto por el orden de FAMILIAS', () => {
    const candidatos = [
      // Récords ANTIGUOS (fuera de ventana), en orden de inserción fuerza→correr a propósito.
      candidato({ prueba: 'fuerza.a', familia: 'fuerza', dia: '2026-01-01', valor: 100 }),
      candidato({ prueba: 'correr.a', familia: 'correr', dia: '2026-01-02', valor: 1000 }),
      // Récords NUEVOS (dentro de la ventana), wod más reciente que estaciones.
      candidato({ prueba: 'estaciones.a', familia: 'estaciones', dia: '2026-09-05', valor: 200 }),
      candidato({ prueba: 'estaciones.a', familia: 'estaciones', dia: '2026-09-10', valor: 180 }),
      candidato({ prueba: 'wod.a', familia: 'wod', dia: '2026-09-20', valor: 500, sentido: 'mayor' }),
    ];
    const ls = lecturasRecords(candidatos, ventana);
    expect(ls.map((l) => l.id)).toEqual(['records.wod.a', 'records.estaciones.a', 'records.correr.a', 'records.fuerza.a']);
    expect(ls[0]!.veredicto).toEqual(VEREDICTO_NUEVO);
    expect(ls[1]!.veredicto).toEqual(VEREDICTO_NUEVO);
    expect(ls[2]!.veredicto).toBeNull();
    expect(ls[3]!.veredicto).toBeNull();
  });
});
