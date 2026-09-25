// UN VEREDICTO POR PASO (modelo de la muñeca, P1 y §4).
//
// Lo que vibra, lo que pinta la banda y lo que canta la serie al cerrarse salen
// de la misma regla. Estos casos son los que la construcción de las propuestas
// encontró rotos: un techo del coach ignorado (avisaba a 141 con «máx 142»), una
// banda más estricta que el motor, y una serie a zona juzgada por la media del
// pulso (que castiga el retraso al arrancar).

import { describe, expect, it } from 'vitest';
import {
  REGLAS_AVISO_DEFECTO,
  type Lecturas,
  type Objetivo,
  type Paso,
  type PasoBase,
  type ZonasCoach,
} from '@/components/design-twin/kit-reloj/paso';
import { fmtObjetivo, veredictoDelPaso, veredictoPrincipal } from '@/components/design-twin/kit-reloj/reglas';
import { laminaDelPaso, lineaPulso } from '@/components/design-twin/kit-reloj/lamina';
import { avanzar, cerrar, estadoInicial, type PlanSesion, type Simulador } from '@/components/design-twin/kit-reloj/secuencia';
import { avisoDeCierre } from '@/components/design-twin/kit-reloj/vivo';

const ZONAS: ZonasCoach = { techos: [138, 152, 165, 178, 195] };
const R = REGLAS_AVISO_DEFECTO; // holgura ritmo 3 s, ppm 2

function paso(parcial: Partial<PasoBase> & { objetivos: Objetivo[] }): PasoBase {
  return {
    id: 'p',
    clase: 'rodaje',
    rol: 'trabajo',
    fase: 'principal',
    medida: { tipo: 'tiempo', prescrito: 2400, mide: 'reloj' },
    cierre: 'medida',
    ...parcial,
  };
}

const lect = (x: Partial<Lecturas>): Lecturas => ({ t: 60, hecho: 60, ritmo: null, ppm: null, gps: 'listo', ...x });

describe('un techo del coach pone el borde alto', () => {
  // «Rodaje · Z1, máx 142 ppm»: Z1 acaba en 138, pero el coach deja subir a 142.
  const rodaje = paso({
    objetivos: [
      { eje: 'zona', min: 1, max: 1, papel: 'principal' },
      { eje: 'ppm', min: null, max: 142, papel: 'techo' },
    ],
  });

  it('a 141 ppm no avisa, ni la banda dice «alto»', () => {
    const l = lect({ ppm: 141 });
    expect(veredictoDelPaso(rodaje, l, ZONAS, R)).toBe('dentro');
    expect(laminaDelPaso(rodaje, l, ZONAS, R).banda?.veredicto).toBe('dentro');
  });

  it('pasado el techo con su holgura (145), avisa y la banda lo dice', () => {
    const l = lect({ ppm: 145 });
    expect(veredictoDelPaso(rodaje, l, ZONAS, R)).toBe('por-encima');
    const banda = laminaDelPaso(rodaje, l, ZONAS, R).banda;
    expect(banda?.veredicto).toBe('por-encima');
    expect(banda?.palabra?.marca).toBe('▲');
  });

  it('por debajo sigue avisando el principal', () => {
    expect(veredictoPrincipal(rodaje, lect({ ppm: 100 }), ZONAS, R)).toBe('dentro'); // Z1 no tiene suelo
  });
});

describe('un techo en otra magnitud avisa por su cuenta', () => {
  // «Tempo a 4:10–4:20, máx 170 ppm»: el ritmo va dentro, el pulso se pasa.
  const tempo = paso({
    clase: 'tempo',
    objetivos: [
      { eje: 'ritmo', min: 250, max: 260, papel: 'principal' },
      { eje: 'ppm', min: null, max: 170, papel: 'techo' },
    ],
  });

  it('vibra «afloja» por el pulso; la banda del ritmo sigue diciendo dentro', () => {
    const l = lect({ ritmo: 255, ppm: 175 });
    expect(veredictoDelPaso(tempo, l, ZONAS, R)).toBe('por-encima');
    expect(veredictoPrincipal(tempo, l, ZONAS, R)).toBe('dentro');
    const lam = laminaDelPaso(tempo, l, ZONAS, R);
    expect(lam.banda?.veredicto).toBe('dentro');
  });

  it('el «▲ alto» del pulso sale cuando vibra, no antes', () => {
    expect(lineaPulso(tempo, lect({ ppm: 171 }), ZONAS, R).aviso).toBeUndefined();
    expect(lineaPulso(tempo, lect({ ppm: 173 }), ZONAS, R).aviso?.texto).toBe('alto');
  });
});

describe('la banda juzga con la holgura del motor', () => {
  const serie = paso({
    clase: 'series',
    medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' },
    objetivos: [{ eje: 'ritmo', min: 245, max: 255, papel: 'principal' }],
    posicion: { serie: { n: 3, de: 6 } },
  });

  it('4:03 en una serie a 4:05–4:15 no es «rápido» (holgura 3 s)', () => {
    const l = lect({ ritmo: 243 });
    expect(veredictoDelPaso(serie, l, ZONAS, R)).toBe('dentro');
    expect(laminaDelPaso(serie, l, ZONAS, R).banda?.veredicto).toBe('dentro');
  });

  it('4:01 sí', () => {
    const l = lect({ ritmo: 241 });
    expect(veredictoDelPaso(serie, l, ZONAS, R)).toBe('por-encima');
    expect(laminaDelPaso(serie, l, ZONAS, R).banda?.veredicto).toBe('por-encima');
  });
});

function plan(pasos: PasoBase[]): PlanSesion {
  return { pasos, zonas: ZONAS, reglas: R };
}

function correr(p: PlanSesion, sim: Simulador, segundos: number) {
  let s = estadoInicial(p, sim, { i: 0 });
  for (let k = 0; k < segundos; k++) s = avanzar(s, p, sim).estado;
  return s;
}

const recupera: PasoBase = paso({
  id: 'r',
  clase: 'recuperacion',
  rol: 'recuperacion',
  medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' },
  objetivos: [],
});

describe('la serie cerrada canta lo mismo que dijo la banda', () => {
  it('una serie @5:20 corrida a 5:22 es «dentro» (la holgura, también al cerrar)', () => {
    const s1 = paso({
      clase: 'series',
      medida: { tipo: 'tiempo', prescrito: 600, mide: 'reloj' },
      objetivos: [{ eje: 'ritmo', min: 320, max: 320, papel: 'principal' }],
      posicion: { serie: { n: 1, de: 2 } },
    });
    const p = plan([s1, recupera]);
    const s = correr(p, () => ({ ritmo: 322, ppm: 150 }), 120);
    const v = cerrar(s, p, 'atleta').estado.vueltas.at(-1);
    expect(v?.veredicto).toBe('dentro');
  });
});

describe('una serie a zona se juzga por el tiempo en zona tras la gracia', () => {
  const z4 = paso({
    clase: 'series',
    medida: { tipo: 'tiempo', prescrito: 240, mide: 'reloj' },
    objetivos: [{ eje: 'zona', min: 4, max: 4, papel: 'principal' }],
    posicion: { serie: { n: 1, de: 4 } },
  });

  it('el pulso tarda en subir, pero pasó la serie en Z4: dentro (la media diría «bajo»)', () => {
    // 0–90 s subiendo desde 120; luego en Z4 (170). Media ≈ 157 → Z3.
    const sim: Simulador = (_p, _i, t) => ({ ritmo: 230, ppm: t < 90 ? 120 + Math.round((t / 90) * 45) : 170 });
    const p = plan([z4, recupera]);
    const s = correr(p, sim, 180);
    const v = cerrar(s, p, 'atleta').estado.vueltas.at(-1);
    expect(v?.ppm).toBeLessThan(166);
    expect(v?.veredicto).toBe('dentro');
  });

  it('más corta que la gracia: no se juzga', () => {
    const p = plan([z4, recupera]);
    const s = correr(p, () => ({ ritmo: 230, ppm: 170 }), 30);
    expect(cerrar(s, p, 'atleta').estado.vueltas.at(-1)?.veredicto).toBeNull();
  });
});

describe('las palabras', () => {
  it('«% RM» dice RM', () => {
    expect(fmtObjetivo({ eje: 'pctRM', min: 65, max: 70, papel: 'principal' })).toBe('65–70 % RM');
  });

  it('una serie de fuerza se cierra «cerrada»; un tramo, «cerrado»', () => {
    const fuerza: Paso = {
      ...paso({ clase: 'fuerza', objetivos: [], posicion: { serie: { n: 2, de: 4 } } }),
      siguiente: null,
    };
    expect(avisoDeCierre(fuerza)).toBe('Serie 2 cerrada');
    const tempo: Paso = {
      ...paso({ clase: 'tempo', objetivos: [], posicion: { serie: { n: 1, de: 3 } } }),
      siguiente: null,
    };
    expect(avisoDeCierre(tempo)).toBe('Tempo 1 cerrado');
  });
});
