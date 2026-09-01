import { describe, expect, it } from 'vitest';
import {
  distanciaTotalDeSesion,
  resultadoDeSesion,
  ritmoMedioDeCorrer,
  tipoDeSesion,
  type Bloque,
  type Sesion,
} from '@/components/design-twin/screens/lectura-sesion/modelo';

// Card 124: la regla que no se puede saltar es que la distancia de los
// totales NUNCA mezcla modalidades — ni siquiera dos máquinas de ergómetro
// entre sí. Estos tests rompen el modelo contra los cinco casos del dominio
// (0 cubetas, 1, 2, misma modalidad repetida, dos máquinas de ergómetro
// distintas) y no solo contra los cuatro escenarios que se ven en pantalla.

function sesionBase(bloques: Bloque[], overrides: Partial<Sesion> = {}): Sesion {
  return {
    titulo: 'Test',
    cuando: 'Hoy',
    horaInicio: '07:00',
    completitud: { completa: true },
    formato: { clase: 'libre' },
    duracionTotalS: 1000,
    bloques,
    fcMediaPpm: null,
    fcMaxPpm: null,
    kcal: null,
    ruta: [],
    procedencia: 'test',
    ...overrides,
  };
}

describe('lectura-sesion · distanciaTotalDeSesion', () => {
  it('sin ninguna modalidad que mida distancia, no hay total', () => {
    const s = sesionBase([
      { modalidad: 'fuerza', etiqueta: 'Sentadilla', duracionS: 300, fcMediaPpm: null, grupos: null },
      { modalidad: 'funcional', etiqueta: 'Wall balls', duracionS: 60, fcMediaPpm: null, reps: 20, metros: null },
    ]);
    expect(distanciaTotalDeSesion(s)).toBeNull();
  });

  it('una sola modalidad con distancia conocida: sí hay total, con su modo y su ritmo', () => {
    const s = sesionBase([
      { modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 1200, distanciaM: 4000, fcMediaPpm: 140 },
    ]);
    const total = distanciaTotalDeSesion(s);
    expect(total).not.toBeNull();
    expect(total?.metros).toBe(4000);
    expect(total?.modo).toBe('corriendo');
    expect(total?.ritmoSkm).toBeCloseTo(300, 5); // 1200s / 4km = 300 s/km
  });

  it('correr + ergómetro (dos modalidades): el total desaparece, aunque cada una por separado tenga dato', () => {
    const s = sesionBase([
      { modalidad: 'correr', etiqueta: 'Correr', duracionS: 260, distanciaM: 1000, fcMediaPpm: 150 },
      { modalidad: 'ergometro', etiqueta: 'Ski erg', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158 },
    ]);
    expect(distanciaTotalDeSesion(s)).toBeNull();
  });

  it('remo + ski (misma "modalidad" ergómetro, dos máquinas distintas): también desaparece — es la trampa que la card 124 avisa', () => {
    const s = sesionBase([
      { modalidad: 'ergometro', etiqueta: 'Ski erg', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158 },
      { modalidad: 'ergometro', etiqueta: 'Remo', maquina: 'remo', duracionS: 118, distanciaM: 500, fcMediaPpm: 170 },
    ]);
    expect(distanciaTotalDeSesion(s)).toBeNull();
  });

  it('dos bloques de la MISMA máquina sí se suman entre sí (no es mezcla, es la misma modalidad)', () => {
    const s = sesionBase([
      { modalidad: 'ergometro', etiqueta: 'Remo 1', maquina: 'remo', duracionS: 118, distanciaM: 500, fcMediaPpm: 170 },
      { modalidad: 'ergometro', etiqueta: 'Remo 2', maquina: 'remo', duracionS: 120, distanciaM: 500, fcMediaPpm: 172 },
    ]);
    const total = distanciaTotalDeSesion(s);
    expect(total?.metros).toBe(1000);
    expect(total?.modo).toBe('remando');
  });

  it('un tramo sin su propio cronómetro dentro de la única modalidad: hay distancia, pero SIN ritmo (no se inventa una duración)', () => {
    const s = sesionBase([
      { modalidad: 'correr', etiqueta: 'Tramo 1', duracionS: 200, distanciaM: 1000, fcMediaPpm: 150 },
      { modalidad: 'correr', etiqueta: 'Tramo 2', duracionS: null, distanciaM: 1000, fcMediaPpm: 150 },
    ]);
    const total = distanciaTotalDeSesion(s);
    expect(total?.metros).toBe(2000);
    expect(total?.ritmoSkm).toBeNull();
  });

  it('funcional con metros (dosis de un movimiento) nunca cuenta como distancia recorrida', () => {
    const s = sesionBase([
      { modalidad: 'correr', etiqueta: 'Correr', duracionS: 300, distanciaM: 1000, fcMediaPpm: 150 },
      { modalidad: 'funcional', etiqueta: 'Burpee Broad Jump', duracionS: 75, fcMediaPpm: 168, reps: null, metros: 40 },
    ]);
    const total = distanciaTotalDeSesion(s);
    // Solo correr cuenta: si el funcional se colara, esto daría null (dos cubetas).
    expect(total?.metros).toBe(1000);
    expect(total?.modo).toBe('corriendo');
  });
});

describe('lectura-sesion · ritmoMedioDeCorrer', () => {
  it('sin ningún tramo de correr con distancia y duración, no hay ritmo', () => {
    const s = sesionBase([{ modalidad: 'fuerza', etiqueta: 'Sentadilla', duracionS: 300, fcMediaPpm: null, grupos: null }]);
    expect(ritmoMedioDeCorrer(s)).toBeNull();
  });

  it('promedia SOLO los tramos de correr, aunque la sesión mezcle otras modalidades (② del escenario real)', () => {
    const s = sesionBase([
      { modalidad: 'correr', etiqueta: 'Correr 1', duracionS: 260, distanciaM: 1000, fcMediaPpm: 152 },
      { modalidad: 'ergometro', etiqueta: 'Ski', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158 },
      { modalidad: 'correr', etiqueta: 'Correr 2', duracionS: 270, distanciaM: 1000, fcMediaPpm: 164 },
    ]);
    // 530 s / 2 km = 265 s/km — el ergómetro no puede colarse en esta media.
    expect(ritmoMedioDeCorrer(s)).toBeCloseTo(265, 5);
  });
});

describe('lectura-sesion · tipoDeSesion', () => {
  it('fuerza: el formato manda, aunque el desglose tenga un bloque suelto de otra modalidad', () => {
    const s = sesionBase([{ modalidad: 'fuerza', etiqueta: 'Sentadilla', duracionS: 300, fcMediaPpm: null, grupos: null }], {
      formato: { clase: 'fuerza' },
    });
    expect(tipoDeSesion(s)).toBe('fuerza');
  });

  it('correr + ergómetro/funcional + reloj/tanda estructurado: hyrox', () => {
    const s = sesionBase(
      [
        { modalidad: 'correr', etiqueta: 'Correr', duracionS: 260, distanciaM: 1000, fcMediaPpm: 150 },
        { modalidad: 'ergometro', etiqueta: 'Ski', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158 },
      ],
      { formato: { clase: 'for-time' } },
    );
    expect(tipoDeSesion(s)).toBe('hyrox');
  });

  it('varias modalidades SIN estructura de reloj/tanda: mixto (el caso de la card 118)', () => {
    const s = sesionBase(
      [
        { modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 300, distanciaM: null, fcMediaPpm: 130 },
        { modalidad: 'fuerza', etiqueta: 'Peso muerto', duracionS: 600, fcMediaPpm: 128, grupos: null },
      ],
      { formato: { clase: 'libre' } },
    );
    expect(tipoDeSesion(s)).toBe('mixto');
  });

  it('una sola modalidad, correr, sin estructura: correr', () => {
    const s = sesionBase([{ modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 1800, distanciaM: 6000, fcMediaPpm: 140 }], {
      formato: { clase: 'libre' },
    });
    expect(tipoDeSesion(s)).toBe('correr');
  });

  it('una sola modalidad funcional, en una tanda estructurada sin correr: funcional, no hyrox', () => {
    const s = sesionBase(
      [{ modalidad: 'funcional', etiqueta: 'Kettlebell swings', duracionS: 600, fcMediaPpm: 150, reps: 200, metros: null }],
      { formato: { clase: 'amrap', rondas: 8, repsExtra: 4 } },
    );
    expect(tipoDeSesion(s)).toBe('funcional');
  });
});

describe('lectura-sesion · resultadoDeSesion', () => {
  it('for-time y libre no llevan resultado propio: el tiempo ya es la respuesta', () => {
    const forTime = sesionBase([], { formato: { clase: 'for-time' } });
    const libre = sesionBase([], { formato: { clase: 'libre' } });
    expect(resultadoDeSesion(forTime)).toBeNull();
    expect(resultadoDeSesion(libre)).toBeNull();
  });

  it('fuerza: el volumen solo suma lo que llevó una carga medida, y guarda la serie más pesada', () => {
    const s = sesionBase(
      [
        { modalidad: 'fuerza', etiqueta: 'Sentadilla', duracionS: 780, fcMediaPpm: null, grupos: [{ sets: 5, reps: 5, kg: 100 }] },
        { modalidad: 'fuerza', etiqueta: 'Dominadas', duracionS: 480, fcMediaPpm: null, grupos: [{ sets: 4, reps: 8, kg: null }] },
      ],
      { formato: { clase: 'fuerza' } },
    );
    const r = resultadoDeSesion(s);
    expect(r?.clase).toBe('fuerza');
    if (r?.clase === 'fuerza') {
      expect(r.volumenKg).toBe(2500); // 5*5*100; las dominadas a peso corporal no suman
      expect(r.serieMasPesada).toEqual({ etiqueta: 'Sentadilla', kg: 100, reps: 5 });
    }
  });

  it('amrap y emom devuelven su propio resultado', () => {
    const amrap = sesionBase([], { formato: { clase: 'amrap', rondas: 6, repsExtra: 3 } });
    const emom = sesionBase([], { formato: { clase: 'emom', rondasCompletadas: 10, rondasPrescritas: 12 } });
    expect(resultadoDeSesion(amrap)).toEqual({ clase: 'amrap', rondas: 6, repsExtra: 3 });
    expect(resultadoDeSesion(emom)).toEqual({ clase: 'emom', rondasCompletadas: 10, rondasPrescritas: 12 });
  });
});
