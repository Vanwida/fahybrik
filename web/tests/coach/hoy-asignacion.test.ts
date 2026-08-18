// Hoy no mezcla receta de nivel con bloque del atleta.
// Recorrido 18-ago, Coach Demo 1: Marc (bloque de biblioteca 13–26 jul) y
// Guillem (nunca tuvo) salían los dos con «No hay secuencia para N3·5d».
// Periodización 0/4. Cómo entrenas 2/34. No se afirma el método.
//
// No se bloquea la ficha a 34. No se cablea escuela. No se asigna el mes.

import { describe, expect, test } from 'vitest';
import {
  estadoProgramaAtleta,
  puertasAsignacion,
  recetaDesdeFallo,
  textoAsignacion,
  tieneHueco,
  type EstadoProgramaAtleta,
  type EstadoRecetaNivel,
} from '@fahybrid/shared/domain/coach/hoy-asignacion';
import {
  INTERVIEW_QUESTION_COUNT,
  puedeAfirmarMetodo,
} from '@fahybrid/shared/domain/coach/method-interview';

const HOY = '2026-08-18';
const N3_5D = 'N3 · 5 días';
const SIN_RECETA_N3: EstadoRecetaNivel = { kind: 'sin_receta', celda: N3_5D };

const MARC_RECIBO = { end_date: '2026-07-26', month_name: 'Acumulación' };
const MARC = estadoProgramaAtleta(MARC_RECIBO, HOY);
const GUILLEM = estadoProgramaAtleta(null, HOY);

describe('estadoProgramaAtleta — eje A, independiente de la receta', () => {
  test('Marc: bloque de biblioteca que acabó el 26 jul → bloque_terminado', () => {
    expect(MARC).toEqual({
      kind: 'bloque_terminado',
      nombre: 'Acumulación',
      fin: '2026-07-26',
      hueco_dias: 23,
    });
    expect(tieneHueco(MARC)).toBe(true);
  });

  test('Guillem: cero recibos → nunca_asignado', () => {
    expect(GUILLEM).toEqual({ kind: 'nunca_asignado' });
    expect(tieneHueco(GUILLEM)).toBe(true);
  });

  test('bloque que termina hoy o después no es hueco de Hoy', () => {
    const enCurso: EstadoProgramaAtleta = estadoProgramaAtleta(
      { end_date: '2026-08-18', month_name: 'En marcha' },
      HOY,
    );
    expect(enCurso.kind).toBe('bloque_en_curso');
    expect(tieneHueco(enCurso)).toBe(false);
  });

  test('plantilla borrada: el fin sigue siendo un hecho', () => {
    const sinNombre = estadoProgramaAtleta({ end_date: '2026-07-26', month_name: null }, HOY);
    expect(sinNombre).toMatchObject({ kind: 'bloque_terminado', nombre: null, fin: '2026-07-26' });
  });
});

describe('textoAsignacion — el titular es el atleta, el motivo es la receta', () => {
  test('Marc: titular del bloque que acabó; motivo de la receta vacía, aparte', () => {
    const t = textoAsignacion({ programa: MARC, receta: SIN_RECETA_N3 });
    expect(t.titular).toBe('Terminó «Acumulación» el 26 de julio.');
    expect(t.hueco).toBe('Lleva 3 semanas sin bloque.');
    expect(t.motivo).toMatch(/N3 · 5 días/);
    expect(t.motivo).toMatch(/no tiene secuencia/);
    expect(t.titular.toLowerCase()).not.toMatch(/secuencia|receta|n3/);
  });

  test('Guillem: titular de nunca tuvo; el mismo motivo de receta no habla por él', () => {
    const t = textoAsignacion({ programa: GUILLEM, receta: SIN_RECETA_N3 });
    expect(t.titular).toBe('Todavía no tiene ningún bloque.');
    expect(t.hueco).toBeNull();
    expect(t.motivo).toBe(textoAsignacion({ programa: MARC, receta: SIN_RECETA_N3 }).motivo);
    expect(t.titular).not.toBe(textoAsignacion({ programa: MARC, receta: SIN_RECETA_N3 }).titular);
  });

  test('receta lista: hay titular del atleta y ningún motivo de método', () => {
    const t = textoAsignacion({ programa: GUILLEM, receta: { kind: 'lista' } });
    expect(t.titular).toBe('Todavía no tiene ningún bloque.');
    expect(t.motivo).toBeNull();
  });
});

describe('puertasAsignacion — reponer el bloque y crear la receta son dos salidas', () => {
  test('Marc y Guillem: Reponer bloque + Crear receta, nunca una sola', () => {
    for (const programa of [MARC, GUILLEM]) {
      const puertas = puertasAsignacion({ programa, receta: SIN_RECETA_N3 });
      expect(puertas.map((p) => p.accion)).toEqual(['reponer_bloque', 'crear_receta']);
      expect(puertas[0]).toMatchObject({ eje: 'atleta', etiqueta: 'Reponer bloque' });
      expect(puertas[1]).toMatchObject({ eje: 'metodo', etiqueta: 'Crear receta' });
    }
  });

  test('receta lista: solo reponer — no se empuja a periodización', () => {
    const puertas = puertasAsignacion({ programa: MARC, receta: { kind: 'lista' } });
    expect(puertas.map((p) => p.accion)).toEqual(['reponer_bloque']);
  });

  test('faltan días: editar días + reponer; no crear receta', () => {
    const puertas = puertasAsignacion({
      programa: GUILLEM,
      receta: { kind: 'faltan_dias' },
    });
    expect(puertas.map((p) => p.accion)).toEqual(['editar_dias', 'reponer_bloque']);
  });

  test('bloque en curso: ninguna puerta — no es caso de Hoy', () => {
    const enCurso = estadoProgramaAtleta(
      { end_date: '2026-09-01', month_name: 'Vivo' },
      HOY,
    );
    expect(puertasAsignacion({ programa: enCurso, receta: SIN_RECETA_N3 })).toEqual([]);
  });
});

describe('recetaDesdeFallo — traducción del resolver, no una segunda resolución', () => {
  test('no_sequence_for_cell y empty_sequence son receta, no del atleta', () => {
    expect(recetaDesdeFallo({ reason: 'no_sequence_for_cell', celda: N3_5D, dias: 5, min: 3, max: 6 })).toEqual({
      kind: 'sin_receta',
      celda: N3_5D,
    });
    expect(recetaDesdeFallo({ reason: 'empty_sequence', celda: N3_5D, dias: 5, min: 3, max: 6 })).toEqual({
      kind: 'receta_vacia',
      celda: N3_5D,
    });
  });

  test('días son del atleta', () => {
    expect(recetaDesdeFallo({ reason: 'no_training_days', celda: 'N3', dias: null, min: 3, max: 6 })).toEqual({
      kind: 'faltan_dias',
    });
    expect(recetaDesdeFallo({ reason: 'days_out_of_band', celda: 'N3', dias: 2, min: 3, max: 6 })).toEqual({
      kind: 'dias_fuera_de_banda',
      dias: 2,
      min: 3,
      max: 6,
    });
  });
});

describe('puedeAfirmarMetodo — 2 de 34 no es un método', () => {
  test('el recorrido no autoriza la frase', () => {
    expect(INTERVIEW_QUESTION_COUNT).toBe(34);
    expect(puedeAfirmarMetodo(2, 34)).toBe(false);
    expect(puedeAfirmarMetodo(0, 34)).toBe(false);
    expect(puedeAfirmarMetodo(33, 34)).toBe(false);
  });

  test('solo la entrevista completa autoriza', () => {
    expect(puedeAfirmarMetodo(34, 34)).toBe(true);
  });

  test('total 0 no afirma (defensivo)', () => {
    expect(puedeAfirmarMetodo(0, 0)).toBe(false);
  });
});
