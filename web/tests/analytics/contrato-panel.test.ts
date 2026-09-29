// El contrato ampliado (shared/domain/analytics/lectura.ts + panel.ts + familia.ts):
// la comparación en la unidad del umbral, la familia de un tramo, el sobre del
// panel sin ids repetidos, y el estado de hoy.

import { describe, expect, test } from 'vitest';
import {
  anclaCuenta,
  comparacionDe,
  lecturaMedida,
  lecturaSinDato,
  serieDe,
  type Lectura,
} from '@fahybrid/shared/domain/analytics/lectura';
import { familiaDe } from '@fahybrid/shared/domain/analytics/familia';
import { BLOQUES_PANEL, bloquesVacios, idsRepetidos, lecturasDelPanel } from '@fahybrid/shared/domain/analytics/panel';
import { lecturasEstado } from '@fahybrid/shared/domain/analytics/estado';
import { salidaDe, seCalla } from '@fahybrid/shared/domain/running/progress';

const PROC = { de: 'test', explica_es: 'test', medida: true, ancla: null, proveedor: null } as const;
const COB = { muestras: 1, dias_ventana: 7, dias_con_dato: 1, pct: 14.3 };

describe('comparacionDe', () => {
  const periodo = { desde: '2026-05-04', hasta: '2026-05-31' };
  test('en porcentaje: relativo al anterior; de cero a algo no es un porcentaje', () => {
    expect(comparacionDe({ valor: 120, anterior: 100, unidad: 'pct', periodo, cambio_minimo: 10 })).toMatchObject({ delta: 20, significativo: true });
    expect(comparacionDe({ valor: 105, anterior: 100, unidad: 'pct', periodo, cambio_minimo: 10 })).toMatchObject({ delta: 5, significativo: false });
    expect(comparacionDe({ valor: 50, anterior: 0, unidad: 'pct', periodo, cambio_minimo: 10 })).toMatchObject({ delta: null, significativo: null });
  });
  test('en la unidad del dato: la resta; sin umbral no hay «significativo»', () => {
    expect(comparacionDe({ valor: 70, anterior: 62, unidad: 'tss', periodo, cambio_minimo: 5 })).toMatchObject({ delta: 8, significativo: true });
    expect(comparacionDe({ valor: 70, anterior: 62, unidad: 'tss', periodo, cambio_minimo: null })).toMatchObject({ delta: 8, significativo: null });
    expect(comparacionDe({ valor: 70, anterior: null, unidad: 'tss', periodo, cambio_minimo: 5 })).toMatchObject({ anterior: null, delta: null, significativo: null });
  });
});

describe('los constructores', () => {
  test('una lectura medida nace con los campos nuevos a null si no se dan; una sin dato, siempre sin veredicto', () => {
    const l = lecturaMedida({ id: 'x', grupo: 'forma', titulo_es: 'X', dato: { valor: 1, unidad: 'tss', referencia: null }, cobertura: COB, procedencia: PROC });
    expect(l).toMatchObject({ familia: null, comparacion: null, veredicto: null, serie: null, reparto: null });
    const s = lecturaSinDato({ id: 'y', grupo: 'forma', titulo_es: 'Y', falta: { por: 'objetivo' }, procedencia: PROC });
    expect(s).toMatchObject({ estado: 'sin_dato', dato: null, veredicto: null, comparacion: null });
    expect(serieDe({ unidad: 'tss', paso: 'dia', puntos: [] })).toEqual({ unidad: 'tss', paso: 'dia', puntos: [], plan: null, referencias: null });
  });

  test('anclaCuenta: las tres primeras sí, la poblacional no, null tampoco', () => {
    expect(anclaCuenta('medida')).toBe(true);
    expect(anclaCuenta('estimada')).toBe(true);
    expect(anclaCuenta('poblacional')).toBe(false);
    expect(anclaCuenta(null)).toBe(false);
  });
});

describe('las faltas nuevas', () => {
  test('objetivo y esfuerzo tienen salida y no se callan; plan no tiene salida y tampoco se calla', () => {
    expect(salidaDe({ por: 'objetivo' })).toBe('Elegir tu carrera objetivo');
    expect(salidaDe({ por: 'esfuerzo', sesiones: 3 })).toBe('Puntuar el esfuerzo al terminar');
    expect(salidaDe({ por: 'plan' })).toBeNull();
    expect(seCalla({ por: 'objetivo' })).toBe(false);
    expect(seCalla({ por: 'plan' })).toBe(false);
  });
});

describe('familiaDe', () => {
  test('la estación por su ejercicio; el aparato manda; luego el ejercicio; luego el formato', () => {
    expect(familiaDe({ modalidad: 'other', exercise_modality: 'functional', exercise_category: 'hyrox_station', formato: 'for_time' })).toBe('estaciones');
    expect(familiaDe({ modalidad: 'run', exercise_modality: null, exercise_category: null, formato: null })).toBe('correr');
    expect(familiaDe({ modalidad: 'other', exercise_modality: 'strength', exercise_category: 'strength', formato: 'sets' })).toBe('fuerza');
    expect(familiaDe({ modalidad: 'other', exercise_modality: 'functional', exercise_category: 'skill', formato: 'amrap' })).toBe('wod');
    expect(familiaDe({ modalidad: 'other', exercise_modality: null, exercise_category: null, formato: 'hyrox_sim' })).toBe('estaciones');
    expect(familiaDe({ modalidad: 'other', exercise_modality: 'mobility', exercise_category: 'mobility', formato: 'warmup' })).toBe('otro');
    expect(familiaDe({ modalidad: null, exercise_modality: null, exercise_category: null, formato: null })).toBe('otro');
  });
});

describe('el sobre del panel', () => {
  test('ocho bloques vacíos, y un id repetido se detecta', () => {
    const b = bloquesVacios();
    expect(Object.keys(b).sort()).toEqual([...BLOQUES_PANEL].sort());
    const l = (id: string): Lectura => lecturaSinDato({ id, grupo: 'forma', titulo_es: id, falta: { por: 'plan' }, procedencia: PROC });
    b.forma = [l('a'), l('b')];
    b.estado = [l('a')];
    expect(lecturasDelPanel(b)).toHaveLength(3);
    expect(idsRepetidos(b)).toEqual(['a']);
  });
});

describe('lecturasEstado', () => {
  const forma = [
    lecturaMedida({ id: 'carga.fondo', grupo: 'forma', titulo_es: 'Forma', dato: { valor: 60, unidad: 'tss', referencia: null }, serie: serieDe({ unidad: 'tss', paso: 'dia', puntos: [{ t: '2026-06-01', v: 60 }] }), cobertura: COB, procedencia: PROC }),
    lecturaMedida({ id: 'carga.frescura', grupo: 'forma', titulo_es: 'Frescura', dato: { valor: -5, unidad: 'tss', referencia: null }, veredicto: { code: 'mantener', etiqueta_es: 'Manteniendo', frase_es: null, tono: 'neutro' }, cobertura: COB, procedencia: PROC }),
  ];

  test('readiness de hoy con su delta, y las copias de forma sin serie pero con veredicto', () => {
    const ls = lecturasEstado({ readiness: { score: 72, recorded_for: '2026-06-01', delta_7d: 4 }, hoy: '2026-06-01', forma });
    expect(ls.map((l) => l.id)).toEqual(['estado.readiness', 'estado.forma', 'estado.frescura']);
    expect(ls[0]!.dato).toEqual({ valor: 72, unidad: 'puntos', referencia: { valor: 68, delta: 4, de: 'hace_7d' } });
    expect(ls[0]!.procedencia.medida).toBe(true);
    expect(ls[1]).toMatchObject({ grupo: 'estado', serie: null, dato: { valor: 60 } });
    expect(ls[2]!.veredicto!.code).toBe('mantener');
  });

  test('un readiness viejo se enseña como lo que es; sin ninguno, falta el dispositivo', () => {
    const viejo = lecturasEstado({ readiness: { score: 70, recorded_for: '2026-05-28', delta_7d: null }, hoy: '2026-06-01', forma: [] });
    expect(viejo[0]!.procedencia.medida).toBe(false);
    expect(viejo[0]!.procedencia.explica_es).toMatch(/2026-05-28/);
    const nada = lecturasEstado({ readiness: null, hoy: '2026-06-01', forma: [] });
    expect(nada[0]!.cobertura.falta).toEqual({ por: 'dispositivo' });
  });
});
