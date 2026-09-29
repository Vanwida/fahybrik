// Progreso y récords de un atleta, juntos (shared/domain/analytics/progreso-atleta.ts):
// UN cálculo, tres vistas — el panel, los récords y el detalle por familia
// comparten el mismo objeto de fila (A1).

import { describe, expect, test } from 'vitest';
import { progresoAtleta, type EntradaProgresoAtleta } from '@fahybrid/shared/domain/analytics/progreso-atleta';
import type { EntradaErgo, Maquina } from '@fahybrid/shared/domain/analytics/progreso-ergo';
import { anclasVacias } from '@fahybrid/shared/domain/analytics/anclas';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function entradaVacia(sin_historia: boolean): EntradaProgresoAtleta {
  const metodo = defaultCoachAnalyticsMethod();
  const umbrales = defaultCoachRunningThresholds();
  const ergoVacia = (maquina: Maquina): EntradaErgo => ({
    maquina,
    ventana,
    tramos: [],
    marcas: [],
    anclas: anclasVacias(),
    fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
    umbrales,
    metodo,
    sin_historia,
  });
  return {
    ventana,
    correr: {
      ventana,
      tramos: [],
      trazas: [],
      marcas: [],
      desacoples: [],
      anclas: anclasVacias(),
      fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
      umbrales,
      metodo,
      semanas_historia: sin_historia ? 0 : 20,
      sin_historia,
    },
    ergo: { row: ergoVacia('row'), ski: ergoVacia('ski'), bike: ergoVacia('bike') },
    fuerza: { ventana, series: [], formula: 'Epley', metodo, sin_historia },
    estaciones: { ventana, tramos: [], puntuaciones: [], metodo, sin_historia },
    tests: { ventana, resultados: [], metodo },
  };
}

describe('progresoAtleta — con entradas vacías (sin_historia = true)', () => {
  const atleta = progresoAtleta(entradaVacia(true));

  test('7 filas, en el orden del panel, todas sin dato con falta de HISTORIA', () => {
    expect(atleta.progreso.map((l) => l.id)).toEqual([
      'progreso.correr',
      'progreso.remo',
      'progreso.ski',
      'progreso.bici',
      'progreso.fuerza',
      'progreso.estaciones',
      'progreso.wod',
    ]);
    for (const l of atleta.progreso) {
      expect(l.estado).toBe('sin_dato');
      expect(l.cobertura.falta).toMatchObject({ por: 'historia' });
    }
  });

  test('sin ningún candidato, la lista de récords está vacía', () => {
    expect(atleta.records).toEqual([]);
  });

  test('los detalles tienen las 6 familias (el WOD vive dentro de estaciones)', () => {
    expect(Object.keys(atleta.detalles)).toEqual(['correr', 'remo', 'ski', 'bici', 'fuerza', 'estaciones']);
  });

  test('la primera lectura de cada detalle es EL MISMO objeto que su fila del panel', () => {
    expect(atleta.detalles.correr[0]).toBe(atleta.progreso[0]);
    expect(atleta.detalles.remo[0]).toBe(atleta.progreso[1]);
    expect(atleta.detalles.ski[0]).toBe(atleta.progreso[2]);
    expect(atleta.detalles.bici[0]).toBe(atleta.progreso[3]);
    expect(atleta.detalles.fuerza[0]).toBe(atleta.progreso[4]);
    expect(atleta.detalles.estaciones[0]).toBe(atleta.progreso[5]);
  });

  test('ningún detalle repite un id', () => {
    for (const detalle of Object.values(atleta.detalles)) {
      const ids = detalle.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('progresoAtleta — sin_historia = false', () => {
  test('la falta de las filas vacías es de OCASIÓN, no de historia', () => {
    const atleta = progresoAtleta(entradaVacia(false));
    for (const l of atleta.progreso) {
      expect(l.cobertura.falta).toEqual({ por: 'ocasion' });
    }
  });
});
