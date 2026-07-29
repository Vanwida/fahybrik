// `plan-bloque` es la PORTADA DIARIA, y no afirma nada del futuro que no sepa.
//
// Guarda dos retiradas del 29-jul:
//
//  1. La rampa de volumen previsto por semana — `previstas: [165, 195, 207,
//     240, 260, 114]` para un bloque de 6 semanas. Ninguno de esos números
//     existía: en producción no hay ni un bloque de seis semanas (los reales son
//     de 1, 2 y 4). Dibujaba cuánto iba a entrenar el atleta dentro de tres
//     semanas, que es medir el futuro.
//  2. Los minutos previstos por sesión, que salían de las EJECUCIONES: la 442
//     ponía «50 min» porque la ejecución 103 duró 52:00, y la 441 —que es
//     `for_time` de punta a punta— ponía «95 min» a ojo.

import { describe, expect, test } from 'vitest';
import {
  SESION_CIRCUITO,
  SESION_HYROX,
  SESION_REMO,
  SESION_SQUAT,
  planDeEscenario,
  type SesionPlan,
} from '@/components/design-twin/screens/plan-bloque/data';
import * as data from '@/components/design-twin/screens/plan-bloque/data';

describe('el bloque no dibuja volumen previsto', () => {
  test('ni el bloque ni sus escenarios llevan una rampa de minutos', () => {
    for (const escenario of ['semana-carga', 'descarga', 'descanso']) {
      const { bloque } = planDeEscenario(escenario);
      expect(bloque).not.toHaveProperty('previstas');
      // Lo que SÍ se sabe del bloque: cómo lo llamó el coach y cuántas semanas.
      expect(bloque.nombre.length).toBeGreaterThan(0);
      expect(bloque.totalSemanas).toBeGreaterThan(0);
    }
  });

  test('las funciones que sostenían la rampa ya no existen', () => {
    for (const nombre of [
      'minutosPrevistosSemana',
      'rampaDelBloque',
      'esDescarga',
      'lecturaRampa',
      'horasPrevistas',
    ]) {
      expect(data).not.toHaveProperty(nombre);
    }
  });
});

describe('la duración de una sesión, o su razón', () => {
  const casos: Array<[string, SesionPlan, string]> = [
    ['la simulación HYROX (441) es for_time', SESION_HYROX, 'scored_by_time'],
    ['el back squat no trae tempo', SESION_SQUAT, 'work_not_timed'],
    ['el circuito (442) llega sin dosis', SESION_CIRCUITO, 'undosed'],
  ];

  test.each(casos)('%s → sin número, con razón', (_nombre, sesion, razon) => {
    expect(sesion.duracion).toEqual({ razon });
  });

  test('el remo SÍ se sabe: 500 m contra un ritmo prescrito', () => {
    // 500 m a 1:52/500m = 112 s. Aritmética del plan, no una estimación.
    expect(SESION_REMO.duracion).toEqual({ minutos: 2 });
  });

  test('ninguna duración con número sale de una ejecución', () => {
    // Las tres sesiones cuyos minutos venían de `workout_executions` ya no
    // llevan número. Si alguien vuelve a poner uno, este test lo caza.
    for (const s of [SESION_HYROX, SESION_SQUAT, SESION_CIRCUITO]) {
      expect('minutos' in s.duracion).toBe(false);
    }
  });
});
