// Puro de ventana.ts — cuánto se mira hacia atrás (`ventanaAdmisible`) y
// cuánta historia hay de verdad (`historiaDe`). Aritmética pura sobre números
// y fechas ISO, sin base de datos.

import { describe, expect, test } from 'vitest';
import {
  historiaDe,
  ventanaAdmisible,
  MAX_VENTANA_SEMANAS,
  VENTANA_POR_DEFECTO_SEMANAS,
} from '@fahybrid/shared/domain/analytics/ventana';

// ---------------------------------------------------------------------------
// ventanaAdmisible
// ---------------------------------------------------------------------------

describe('ventanaAdmisible', () => {
  test.each<[string, number | null | undefined]>([
    ['null', null],
    ['undefined', undefined],
  ])('%s → el defecto', (_label, valor) => {
    expect(ventanaAdmisible(valor)).toBe(VENTANA_POR_DEFECTO_SEMANAS);
  });

  test.each<[string, number]>([
    ['cero', 0],
    ['negativo', -5],
  ])('%s → se recorta a 1, nunca a 0', (_label, valor) => {
    expect(ventanaAdmisible(valor)).toBe(1);
  });

  test('exactamente 1 → se queda en 1 (borde inferior)', () => {
    expect(ventanaAdmisible(1)).toBe(1);
  });

  // Elegidos para que redondear y truncar discreparían (13.9 redondeado sería
  // 14, no 13; 7.99 redondeado sería 8, no 7): si el código truncara mal,
  // estos dos lo delatarían y los enteros no.
  test.each<[number, number]>([
    [13.9, 13],
    [7.99, 7],
  ])('fraccionario %s → se trunca a %s, no se redondea', (entrada, esperado) => {
    expect(ventanaAdmisible(entrada)).toBe(esperado);
  });

  test('un valor normal dentro de rango pasa sin tocar', () => {
    expect(ventanaAdmisible(26)).toBe(26);
  });

  test('por encima del máximo → se recorta al máximo', () => {
    expect(ventanaAdmisible(MAX_VENTANA_SEMANAS + 1000)).toBe(MAX_VENTANA_SEMANAS);
  });

  test('exactamente el máximo → se queda en el máximo (borde superior)', () => {
    expect(ventanaAdmisible(MAX_VENTANA_SEMANAS)).toBe(MAX_VENTANA_SEMANAS);
  });

  test.each<[string, number]>([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('%s → el defecto, JAMÁS 0 y JAMÁS el máximo', (_label, valor) => {
    const resultado = ventanaAdmisible(valor);
    expect(resultado).toBe(VENTANA_POR_DEFECTO_SEMANAS);
    expect(resultado).not.toBe(0);
    expect(resultado).not.toBe(MAX_VENTANA_SEMANAS);
  });
});

// ---------------------------------------------------------------------------
// historiaDe
// ---------------------------------------------------------------------------

describe('historiaDe', () => {
  test('dias_de_historia null → {semanas: null, desde: null, cubre_todo: false}, ignora primera_sesion_iso', () => {
    const h = historiaDe({ dias_de_historia: null, primera_sesion_iso: '2026-01-01', ventana_dias: 700 });
    expect(h).toEqual({ semanas: null, desde: null, cubre_todo: false });
  });

  test.each<number>([0, 1, 700])(
    'sin historia, cubre_todo es SIEMPRE false — también con ventana_dias=%i',
    (ventana_dias) => {
      const h = historiaDe({ dias_de_historia: null, primera_sesion_iso: null, ventana_dias });
      expect(h.cubre_todo).toBe(false);
    },
  );

  test('cubre_todo true en el borde EXACTO: ventana_dias === dias_de_historia', () => {
    const h = historiaDe({ dias_de_historia: 84, primera_sesion_iso: '2026-01-01', ventana_dias: 84 });
    expect(h.cubre_todo).toBe(true);
  });

  test('cubre_todo true cuando la ventana rebasa la historia', () => {
    const h = historiaDe({ dias_de_historia: 84, primera_sesion_iso: '2026-01-01', ventana_dias: 200 });
    expect(h.cubre_todo).toBe(true);
  });

  test('cubre_todo false cuando la ventana se queda corta', () => {
    const h = historiaDe({ dias_de_historia: 84, primera_sesion_iso: '2026-01-01', ventana_dias: 83 });
    expect(h.cubre_todo).toBe(false);
  });

  test.each<[number, number]>([
    [13, 1],
    [14, 2],
  ])('semanas se trunca hacia abajo: %i días de historia → %i semanas', (diasDeHistoria, semanasEsperadas) => {
    const h = historiaDe({ dias_de_historia: diasDeHistoria, primera_sesion_iso: '2026-01-01', ventana_dias: 84 });
    expect(h.semanas).toBe(semanasEsperadas);
  });

  test('dias_de_historia: 0 (empezó hoy) → semanas 0 y cubre_todo true, sin lanzar', () => {
    expect(() =>
      historiaDe({ dias_de_historia: 0, primera_sesion_iso: '2026-08-13', ventana_dias: 84 }),
    ).not.toThrow();

    const h = historiaDe({ dias_de_historia: 0, primera_sesion_iso: '2026-08-13', ventana_dias: 84 });
    expect(h).toEqual({ semanas: 0, desde: '2026-08-13', cubre_todo: true });
  });

  test('desde pasa tal cual la primera_sesion_iso recibida, cuando hay historia', () => {
    const h = historiaDe({ dias_de_historia: 40, primera_sesion_iso: '2025-12-01', ventana_dias: 84 });
    expect(h.desde).toBe('2025-12-01');
  });
});
