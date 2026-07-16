// suggestModality — la sugerencia que PRE-SELECCIONA el formulario de crear.
//
// POR QUÉ SE TESTEA UNA HEURÍSTICA QUE "SÓLO SUGIERE": porque una modalidad mal
// puesta no da error. Las analíticas enrutan por ella, así que un "Remo 500m" que
// entra como `other` no rompe nada visible — sale un gráfico vacío semanas después y
// nadie sabe por qué. Es exactamente el fallo que se llevó por delante la regla
// vieja (mig 0053: regex sobre el nombre en INGLÉS, `like '%row%'`), y es un fallo
// mudo: no lo caza ni el typecheck ni un 500.
//
// Los casos NO son inventados: son los nombres y categorías REALES del catálogo Base
// (infra/scripts/seed_exercises.ts). La sugerencia se mide contra lo que el coach va
// a escribir de verdad, no contra ejemplos cómodos.

import { describe, expect, it } from 'vitest';
import { suggestModality } from '@/lib/dashboard/exercises/catalog-ui';

describe('suggestModality — el nombre desempata QUÉ cardio es', () => {
  // El caso que motivó todo el cambio: el coach escribe en español y la regla vieja
  // sólo miraba inglés, así que esto entraba como `other`.
  it.each([
    ['Remo 500m', 'row'],
    ['Remo 2000m', 'row'],
    ['Bici 20 min', 'bike'],
    ['Carrera continua 40 min', 'run'],
    ['Cinta 5k', 'run'],
    ['Rodaje suave', 'run'],
    ['Tirada larga', 'run'],
  ] as const)('«%s» (cardio) → %s', (name, expected) => {
    expect(suggestModality(name, 'cardio')).toBe(expected);
  });

  // Los nombres REALES del catálogo Base, que están en inglés.
  it.each([
    ['Run — Z2 long (aerobic base)', 'run'],
    ['Run — HYROX race-pace intervals (400 m reps)', 'run'],
    ['Row — Z2 long (aerobic base)', 'row'],
    ['Row — Sprint intervals (Z5)', 'row'],
    ['SkiErg — Tempo (Z3 continuous)', 'ski'],
    ['SkiErg — Recovery (Z1 active)', 'ski'],
    ['Bike — Z2 endurance', 'bike'],
    ['Bike — VO2max intervals (Z5)', 'bike'],
    ['Test — 2K row time trial', 'row'],
    ['Test — 1K SkiErg time trial', 'ski'],
  ] as const)('«%s» (cardio) → %s', (name, expected) => {
    expect(suggestModality(name, 'cardio')).toBe(expected);
  });

  it('un cardio sin máquina en el nombre cae en carrera, que es el cardio por defecto', () => {
    // "Test — 5K time trial" es una carrera y no lo dice: lo dice la categoría.
    expect(suggestModality('Test — 5K time trial', 'cardio')).toBe('run');
  });
});

describe('suggestModality — la categoría manda cuando ELLA es la disciplina', () => {
  // EL FALSO POSITIVO CLÁSICO, y con nombres reales del catálogo: "Pendlay row" y
  // "Remo con barra" son FUERZA. La regla vieja (`like '%row%'`) los mandaba al
  // ergómetro y contaminaba las analíticas de remo con series de espalda.
  it.each([
    ['Pendlay row', 'strength'],
    ['Remo con barra', 'strength'],
    ['Remo renegado con mancuerna', 'strength'],
    ['Sled drag (backwards)', 'strength'],
    ['Single-leg Romanian deadlift', 'strength'],
    ['Atlas stone shoulder', 'strength'],
  ] as const)('«%s» (strength) → %s', (name, expected) => {
    expect(suggestModality(name, 'strength')).toBe(expected);
  });

  it.each([
    ['Foam roll — Lower body 15 min', 'mobility'],
    ['Mobility — Hip flow 15 min', 'mobility'],
    ['Prehab — Banded shoulder 15 min', 'mobility'],
  ] as const)('«%s» (mobility) → %s', (name, expected) => {
    expect(suggestModality(name, 'mobility')).toBe(expected);
  });

  it('un core que se llama "Bicicleta" sigue siendo core, no BikeErg', () => {
    // El clásico abdominal "bicicleta". La categoría ya es la disciplina.
    expect(suggestModality('Bicicleta abdominal', 'core')).toBe('core');
  });
});

describe('suggestModality — las estaciones HYROX reales', () => {
  it.each([
    ['HYROX SkiErg', 'ski'],
    ['HYROX Rowing', 'row'],
    ['HYROX Sled Push', 'functional'],
    ['HYROX Sled Pull', 'functional'],
    ['HYROX Burpee Broad Jump', 'functional'],
    ['HYROX Farmers Carry', 'functional'],
    ['HYROX Sandbag Lunges', 'functional'],
    ['HYROX Wall Balls', 'functional'],
  ] as const)('«%s» (hyrox_station) → %s', (name, expected) => {
    expect(suggestModality(name, 'hyrox_station')).toBe(expected);
  });
});

describe('suggestModality — detalles que la harían mentir', () => {
  it('ignora acentos y mayúsculas: el coach escribe como escribe', () => {
    expect(suggestModality('BICI 20 MIN', 'cardio')).toBe('bike');
    expect(suggestModality('Bíci 20 min', 'cardio')).toBe('bike');
  });

  it('un nombre vacío no revienta: contesta lo que diga la categoría', () => {
    // El formulario pide la sugerencia en cada tecla, incluida la primera.
    expect(suggestModality('', 'cardio')).toBe('run');
    expect(suggestModality('', 'strength')).toBe('strength');
  });

  it('siempre devuelve una modalidad del enum — nunca undefined', () => {
    // El valor va directo al POST, que lo valida contra `modalitySchema`: un hueco
    // aquí sería un 400 en la cara del coach al pulsar "Crear".
    const categories = [
      'cardio',
      'strength',
      'hyrox_station',
      'core',
      'mobility',
      'plyometric',
      'skill',
    ] as const;
    for (const c of categories) {
      expect(typeof suggestModality('Movimiento raro sin pistas', c)).toBe('string');
    }
  });
});
