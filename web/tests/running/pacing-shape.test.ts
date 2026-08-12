// Pure unit tests for shared/domain/running/pacing-shape.ts (#71) — port fiel
// de aguanteDe/ritmoDe (web/components/design-twin/tramos.ts). Los números
// de estos tests están construidos para poder verificarse a mano: no hay
// truco, sólo tiempo/distancia por tramo.

import { describe, expect, test } from 'vitest';
import {
  MIN_LEGS_FOR_PACING_SHAPE,
  PACING_SHAPE_MARGIN,
  sessionPacingShape,
  summarizePacingShape,
  type PacingShapeLeg,
} from '@fahybrid/shared/domain/running/pacing-shape';

// 800 m a un ritmo dado (s/km) → duración exacta.
function leg(rep_ordinal: number, pace_s_per_km: number, distance_m = 800): PacingShapeLeg {
  return { rep_ordinal, distance_m, duration_s: (pace_s_per_km * distance_m) / 1000 };
}

describe('sessionPacingShape — disciplina de muestra', () => {
  test('menos de MIN_LEGS_FOR_PACING_SHAPE (4): null, nunca un veredicto sobre una anécdota', () => {
    expect(sessionPacingShape([leg(1, 240), leg(2, 240), leg(3, 240)])).toBeNull();
  });

  test('MIN_LEGS_FOR_PACING_SHAPE es 4 y el margen es 2%, tal cual tramos.ts — no se tocan aquí', () => {
    expect(MIN_LEGS_FOR_PACING_SHAPE).toBe(4);
    expect(PACING_SHAPE_MARGIN).toBe(0.02);
  });

  test('tramos con distancia o duración a cero se descartan antes de contar el mínimo', () => {
    const legs = [leg(1, 240), leg(2, 240), leg(3, 240), { rep_ordinal: 4, distance_m: 0, duration_s: 0 }];
    expect(sessionPacingShape(legs)).toBeNull(); // sólo 3 válidos, por debajo del mínimo
  });
});

describe('sessionPacingShape — el veredicto', () => {
  test('se le va: la segunda mitad más de 2% más lenta que la primera', () => {
    // Primera mitad a 4:00/km (240 s/km), segunda a 4:20 (260 s/km): deriva
    // +20 s/km sobre un margen de 240*0.02=4.8 s/km → se_te_fue.
    const legs = [leg(1, 240), leg(2, 240), leg(3, 260), leg(4, 260)];
    expect(sessionPacingShape(legs)).toBe('se_te_fue');
  });

  test('de menos a más: la segunda mitad más de 2% más rápida', () => {
    const legs = [leg(1, 260), leg(2, 260), leg(3, 240), leg(4, 240)];
    expect(sessionPacingShape(legs)).toBe('de_menos_a_mas');
  });

  test('aguantaste: la deriva no llega al margen', () => {
    // 240 → 242 s/km es un 0.83% de deriva, por debajo del 2%.
    const legs = [leg(1, 240), leg(2, 240), leg(3, 242), leg(4, 242)];
    expect(sessionPacingShape(legs)).toBe('aguantaste');
  });

  test('justo por debajo del margen: aguantaste — la comparación es estricta, no ≥', () => {
    // Margen = 240*0.02 = 4.8 s/km. Segunda mitad a 244.5 s/km: deriva 4.5,
    // claramente por debajo — evita el filo exacto, donde dos formas
    // distintas de llegar a "4.8" en coma flotante (resta vs. multiplicación)
    // pueden no ser bit-idénticas y el test dejaría de probar el algoritmo
    // para probar redondeo de IEEE 754.
    const legs = [leg(1, 240), leg(2, 240), leg(3, 244.5), leg(4, 244.5)];
    expect(sessionPacingShape(legs)).toBe('aguantaste');
  });

  test('con número impar de tramos, el del medio queda fuera de las dos mitades', () => {
    // 5 tramos: corte=floor(5/2)=2. Primera mitad = tramos 1-2 (240 s/km).
    // Segunda mitad = ÚLTIMOS 2 = tramos 4-5 (260 s/km). El 3.º (a cualquier
    // ritmo, aquí disparatado) no debe afectar el veredicto si de verdad
    // queda excluido.
    const legs = [leg(1, 240), leg(2, 240), leg(3, 999), leg(4, 260), leg(5, 260)];
    expect(sessionPacingShape(legs)).toBe('se_te_fue');
  });

  test('el orden de entrada no importa — se reordena por rep_ordinal', () => {
    const legs = [leg(4, 260), leg(1, 240), leg(3, 260), leg(2, 240)];
    expect(sessionPacingShape(legs)).toBe('se_te_fue');
  });

  test('el ritmo medio de una mitad es tiempo total / distancia total, no la media de los ritmos', () => {
    // Primera mitad: un tramo largo a 200 s/km (2000 m) y uno corto a 400
    // s/km (200 m). Media aritmética de ritmos = 300. Media correcta =
    // (2000*0.2 + 200*0.4) / (2000+200) *1000 = (400+80)/2200*1000 = 218.18.
    // Segunda mitad plana a 240 s/km: con la aritmética (300) leería "de
    // menos a más" (240 < 300); con la correcta (218) lee "se le va".
    const legs: PacingShapeLeg[] = [
      { rep_ordinal: 1, distance_m: 2000, duration_s: 2000 * 0.2 },
      { rep_ordinal: 2, distance_m: 200, duration_s: 200 * 0.4 },
      leg(3, 240),
      leg(4, 240),
    ];
    expect(sessionPacingShape(legs)).toBe('se_te_fue');
  });
});

describe('summarizePacingShape', () => {
  test('cuenta los tres cubos — coincide con el ejemplo del mockup (6/2/1 de 9)', () => {
    const verdicts = [
      ...Array<'se_te_fue'>(6).fill('se_te_fue'),
      ...Array<'aguantaste'>(2).fill('aguantaste'),
      ...Array<'de_menos_a_mas'>(1).fill('de_menos_a_mas'),
    ];
    const res = summarizePacingShape(verdicts);
    expect(res).toEqual({ total: 9, se_te_fue: 6, aguantaste: 2, de_menos_a_mas: 1 });
  });

  test('lista vacía: total 0, nunca un error — "si no hubiera patrón, di que no lo hay"', () => {
    expect(summarizePacingShape([])).toEqual({ total: 0, se_te_fue: 0, aguantaste: 0, de_menos_a_mas: 0 });
  });
});
