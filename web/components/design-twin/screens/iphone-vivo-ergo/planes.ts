// LOS PLANES DE ERGO DEL IPHONE — las sesiones escritas como pasos del kit
// (`kit-reloj`), sin texto libre. Un plan del coach y uno libre son el MISMO
// objeto (docs/vivo-iphone/modelo.md): nada en el vivo sabe de dónde vino.
//
// Lo que sale de una sesión real se reutiliza de las propuestas de la muñeca
// (`screens/reloj-wod/planes.ts`: 505 SkiErg 8 × 250 m) y de la gramática del
// iPhone (`planTestRemo`). Lo que NO sale de ninguna sesión asignada se dice
// aquí y es ilustrativo (lente 6 de la auditoría del 25-09: no hay series de
// remo a /500, ni ergo por calorías, ni BikeErg continuo, ni remo continuo a
// zona entre las 22 sesiones reales):
//   · Remo 5 × 500 m a 1:52–1:56 /500 · r 2′ parado — la serie de remo típica
//     de un bloque de umbral; el rango es lo que el coach prescribe (P3).
//   · SkiErg 5 × 25 cal · r 1′ parado — las calorías las cuenta la máquina
//     (`medida.tipo: 'cal'`, `mide: 'ergo'`); sin objetivo: manda lo que falta.
//   · BikeErg 20′ a 2:05–2:10 /1000 — continuo; la bici se lee por 1000 m.
//   · Remo 30′ a Z2 — continuo a zona: el pulso manda y tiñe el lienzo (I8).

import {
  REGLAS_AVISO_DEFECTO,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type ZonasCoach,
} from '../../kit-reloj';

/** Umbral 170 ppm, 5 zonas del coach (las mismas de las propuestas de la muñeca). */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

let cuenta = 0;
const id = (p: string) => `${p}-${++cuenta}`;

type Parcial = Omit<PasoBase, 'id' | 'cierre' | 'objetivos' | 'fase'> & Partial<Pick<PasoBase, 'cierre' | 'objetivos' | 'fase'>>;
const paso = (p: Parcial): PasoBase => ({ id: id(p.clase), cierre: 'medida', objetivos: [], fase: 'principal', ...p });
const plan = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

const parado = (s: number): PasoBase =>
  paso({ clase: 'recuperacion', rol: 'recuperacion', medida: { tipo: 'tiempo', prescrito: s, mide: 'reloj' }, modoRecupera: 'parado', bloque: 0 });

/**
 * El /500 del coach, en segundos por 500 m: `min` es el MÁS RÁPIDO (menos
 * segundos). En la bici el coach lo escribe por 1000 m y el dato viaja por
 * 500 (`fmtSplit` lo enseña por 1000): 2:05–2:10 /1000 → 62,5–65 s/500.
 */
const split = (min: number, max: number): Objetivo => ({ eje: 'split500', min, max, papel: 'principal' });
const zona = (z: number): Objetivo => ({ eje: 'zona', min: z, max: z, papel: 'principal' });

// ---------------------------------------------------------------------------
// Los planes
// ---------------------------------------------------------------------------

/**
 * Remo 5 × 500 m a 1:52–1:56 /500 · r 2′ parado (ilustrativo). Con el remo
 * enlazado, la máquina mide los metros y cierra la serie; sin él, los 500 m
 * los dices tú (`mide: 'atleta'`, `cierre: 'atleta'`).
 */
export function planRemoSeries(conRemo = true): PlanSesion {
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 5; k++) {
    pasos.push(
      paso({
        clase: 'ergo',
        rol: 'trabajo',
        maquina: { tipo: 'remo' },
        medida: { tipo: 'distancia', prescrito: 500, mide: conRemo ? 'ergo' : 'atleta' },
        cierre: conRemo ? 'medida' : 'atleta',
        objetivos: [split(112, 116)],
        posicion: { serie: { n: k, de: 5 } },
        bloque: 0,
      }),
    );
    if (k < 5) pasos.push(parado(120));
  }
  return plan(pasos);
}

/** SkiErg 5 × 25 cal · r 1′ parado (ilustrativo): las calorías las cuenta el ski; sin objetivo, manda lo que falta. */
export function planSkiCalorias(): PlanSesion {
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 5; k++) {
    pasos.push(
      paso({
        clase: 'ergo',
        rol: 'trabajo',
        nombre: 'SkiErg',
        maquina: { tipo: 'ski' },
        medida: { tipo: 'cal', prescrito: 25, mide: 'ergo' },
        posicion: { serie: { n: k, de: 5 } },
        bloque: 0,
      }),
    );
    if (k < 5) pasos.push(parado(60));
  }
  return plan(pasos);
}

/** BikeErg 20′ a 2:05–2:10 /1000 (ilustrativo): un continuo; la bici se lee por 1000 m y su cadencia son rpm. */
export function planBiciContinuo(): PlanSesion {
  return plan([
    paso({
      clase: 'ergo',
      rol: 'trabajo',
      nombre: 'BikeErg',
      maquina: { tipo: 'bici' },
      medida: { tipo: 'tiempo', prescrito: 1200, mide: 'ergo' },
      objetivos: [split(62.5, 65)],
      bloque: 0,
    }),
  ]);
}

/** Remo 30′ a Z2 (ilustrativo): un continuo a zona; el pulso manda (P3) y tiñe el lienzo (I8). */
export function planRemoZona(): PlanSesion {
  return plan([
    paso({
      clase: 'ergo',
      rol: 'trabajo',
      maquina: { tipo: 'remo' },
      medida: { tipo: 'tiempo', prescrito: 1800, mide: 'ergo' },
      objetivos: [zona(2)],
      bloque: 0,
    }),
  ]);
}
