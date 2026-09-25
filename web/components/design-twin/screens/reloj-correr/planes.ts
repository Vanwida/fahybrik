// LOS PLANES DE CORRER — las sesiones reales (y el caso ilustrativo del
// modelo) escritas como pasos del kit, sin una línea de texto libre salvo el
// cue del coach. Fuente: la lente 6 de la auditoría (get_plan / get_session de
// los atletas 63, 64 y 65) y docs/reloj-muneca/modelo.md.
//
// Donde el detalle de una sesión no trae un dato que el plan necesita para
// DIBUJARSE (las bandas de los tramos intermedios del progresivo 538), se
// interpola y se dice aquí; esas cifras no salen en ninguna pantalla que se
// juzgue.

import {
  REGLAS_AVISO_DEFECTO,
  type FilaEstructura,
  type Medida,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type QuienMide,
  type ZonasCoach,
} from '../../kit-reloj';

/**
 * Las zonas del atleta con las bandas del coach: 5 zonas sobre un umbral de
 * 170 ppm (Z1 ≤ 138 · Z2 139–150 · Z3 151–160 · Z4 161–173 · Z5 174–192).
 */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

const porTiempo = (s: number): Medida => ({ tipo: 'tiempo', prescrito: s, mide: 'reloj' });
const porMetros = (m: number, mide: QuienMide = 'gps'): Medida => ({ tipo: 'distancia', prescrito: m, mide });
const ritmo = (min: number, max: number): Objetivo => ({ eje: 'ritmo', min, max, papel: 'principal' });
const zona = (z: number, avisa?: Objetivo['avisa']): Objetivo => ({ eje: 'zona', min: z, max: z, papel: 'principal', avisa });
const rpe = (n: number): Objetivo => ({ eje: 'rpe', min: n, max: n, papel: 'principal' });

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

type Parcial = Omit<PasoBase, 'id' | 'cierre' | 'objetivos'> & { objetivos?: Objetivo[]; cierre?: PasoBase['cierre'] };
const paso = (p: Parcial): PasoBase => ({ id: id(p.clase), cierre: 'medida', objetivos: [], ...p });

/** Estado de una fila de la estructura según el paso en curso. */
function filas(defs: Array<Omit<FilaEstructura, 'estado'> & { desde: number; hasta: number }>, i: number): FilaEstructura[] {
  return defs.map(({ desde, hasta, ...f }) => ({
    ...f,
    estado: i > hasta ? 'hecho' : i >= desde ? 'ahora' : 'pendiente',
  }));
}

export interface PlanCorrer {
  plan: PlanSesion;
  estructura: (i: number) => FilaEstructura[];
  /** El control contextual: «Siguiente paso» en una sesión con pasos, «Vuelta» en un rodaje. */
  control: 'siguiente' | 'vuelta';
}

const base = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

// ---------------------------------------------------------------------------
// 6 × 1000 m @3:45–3:55 · r 90″ trote — el caso ilustrativo del modelo
// ---------------------------------------------------------------------------

export function seisPorMil(): PlanCorrer {
  const cal = paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(900), bloque: 0 });
  const pasos: PasoBase[] = [cal];
  for (let k = 1; k <= 6; k++) {
    pasos.push(
      paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porMetros(1000), objetivos: [ritmo(225, 235)], posicion: { serie: { n: k, de: 6 } }, bloque: 1 }),
    );
    if (k < 6) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(90), modoRecupera: 'trote', bloque: 1 }));
  }
  const vuelta = paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(600), bloque: 2 });
  pasos.push(vuelta);
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas(
        [
          { fase: 'calentamiento', trabajo: cal, desde: 0, hasta: 0 },
          { fase: 'principal', veces: 6, trabajo: pasos[1]!, recupera: pasos[2]!, desde: 1, hasta: 11 },
          { fase: 'vuelta', trabajo: vuelta, desde: 12, hasta: 12 },
        ],
        i,
      ),
  };
}

// ---------------------------------------------------------------------------
// 479 · Run 5′ Z2 · 6 × (800 m @Z5 / 2′30″ trote) · WB 5 × 12 @9 kg r 1′ · Run 3′ Z1
// ---------------------------------------------------------------------------

export function sesion479(): PlanCorrer {
  const cal = paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(300), objetivos: [zona(2, 'solo-arriba')], bloque: 0 });
  const pasos: PasoBase[] = [cal];
  for (let k = 1; k <= 6; k++) {
    pasos.push(paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porMetros(800), objetivos: [zona(5)], posicion: { serie: { n: k, de: 6 } }, bloque: 1 }));
    if (k < 6) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(150), modoRecupera: 'trote', bloque: 1 }));
  }
  const wb: PasoBase[] = [];
  for (let k = 1; k <= 5; k++) {
    wb.push(
      paso({ clase: 'estacion', rol: 'trabajo', fase: 'principal', nombre: 'Wall Ball', medida: { tipo: 'reps', prescrito: 12, mide: 'atleta' }, carga: { kg: 9 }, posicion: { serie: { n: k, de: 5 } }, cierre: 'atleta', bloque: 2 }),
    );
    if (k < 5) wb.push(paso({ clase: 'descanso', rol: 'descanso', fase: 'principal', medida: porTiempo(60), bloque: 2 }));
  }
  const vuelta = paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(180), objetivos: [zona(1, 'solo-arriba')], bloque: 3 });
  pasos.push(...wb, vuelta);
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas(
        [
          { fase: 'calentamiento', trabajo: cal, desde: 0, hasta: 0 },
          { fase: 'principal', veces: 6, trabajo: pasos[1]!, recupera: pasos[2]!, desde: 1, hasta: 11 },
          { fase: 'principal', veces: 5, trabajo: wb[0]!, desde: 12, hasta: 20 },
          { fase: 'vuelta', trabajo: vuelta, desde: 21, hasta: 21 },
        ],
        i,
      ),
  };
}

// ---------------------------------------------------------------------------
// 491 · Run 50′ @Z2 · Movilidad 15′        494 · Run 80′ @Z2 («mirar el pulso»)
// ---------------------------------------------------------------------------

export function sesion491(): PlanCorrer {
  const rodaje = paso({ clase: 'rodaje', rol: 'trabajo', fase: 'principal', medida: porTiempo(3000), objetivos: [zona(2, 'solo-arriba')], vueltaAutoM: 1000, bloque: 0 });
  const movilidad = paso({ clase: 'movilidad', rol: 'trabajo', fase: 'vuelta', medida: porTiempo(900), cierre: 'atleta', bloque: 1 });
  return {
    plan: base([rodaje, movilidad]),
    control: 'vuelta',
    estructura: (i) =>
      filas(
        [
          { fase: 'principal', trabajo: rodaje, desde: 0, hasta: 0 },
          { fase: 'vuelta', trabajo: movilidad, desde: 1, hasta: 1 },
        ],
        i,
      ),
  };
}

export function sesion494(): PlanCorrer {
  const tirada = paso({ clase: 'tirada', rol: 'trabajo', fase: 'principal', medida: porTiempo(4800), objetivos: [zona(2, 'solo-arriba')], cue: 'mirar el pulso', vueltaAutoM: 1000, bloque: 0 });
  return {
    plan: base([tirada]),
    control: 'vuelta',
    estructura: (i) => filas([{ fase: 'principal', trabajo: tirada, desde: 0, hasta: 0 }], i),
  };
}

// ---------------------------------------------------------------------------
// 573 · tempo 3950 m @Z4 (sesión montada por el atleta)
// ---------------------------------------------------------------------------

export function sesion573(): PlanCorrer {
  const tempo = paso({ clase: 'tempo', rol: 'trabajo', fase: 'principal', medida: porMetros(3950), objetivos: [zona(4)], bloque: 0 });
  return {
    plan: base([tempo]),
    control: 'siguiente',
    estructura: (i) => filas([{ fase: 'principal', trabajo: tempo, desde: 0, hasta: 0 }], i),
  };
}

// ---------------------------------------------------------------------------
// 551 · Run 6000 m @Z2 · 6 × (20″ @RPE 7 / r 1′ caminando)
// ---------------------------------------------------------------------------

export function sesion551(): PlanCorrer {
  const rodaje = paso({ clase: 'rodaje', rol: 'trabajo', fase: 'principal', medida: porMetros(6000), objetivos: [zona(2, 'solo-arriba')], bloque: 0 });
  const pasos: PasoBase[] = [rodaje];
  for (let k = 1; k <= 6; k++) {
    pasos.push(paso({ clase: 'strides', rol: 'trabajo', fase: 'principal', medida: porTiempo(20), objetivos: [rpe(7)], posicion: { serie: { n: k, de: 6 } }, bloque: 1 }));
    if (k < 6) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(60), modoRecupera: 'andar', bloque: 1 }));
  }
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas(
        [
          { fase: 'principal', trabajo: rodaje, desde: 0, hasta: 0 },
          { fase: 'principal', veces: 6, trabajo: pasos[1]!, recupera: pasos[2]!, desde: 1, hasta: 11 },
        ],
        i,
      ),
  };
}

// ---------------------------------------------------------------------------
// 538 · progresivo de 8 tramos (10′ @5:20 → … → 1′ @4:02–4:10) + series
// ---------------------------------------------------------------------------

/** Tramos 2–8 del progresivo: el 3 a 4:27–4:46 y el 8 a 4:02–4:10; los demás, interpolados para el dibujo. */
const TRAMOS_538: Array<[number, number]> = [
  [320, 320],
  [272, 291],
  [267, 286],
  [261, 278],
  [255, 270],
  [250, 264],
  [246, 258],
  [242, 250],
];

export function sesion538(): PlanCorrer {
  const tramos = TRAMOS_538.map(([a, b], k) =>
    paso({
      clase: 'progresivo',
      rol: 'trabajo',
      fase: 'principal',
      medida: porTiempo(k === 0 ? 600 : 60),
      objetivos: [ritmo(a, b)],
      posicion: { tramo: { n: k + 1, de: 8 } },
      bloque: 0,
    }),
  );
  const seis: PasoBase[] = [];
  for (let k = 1; k <= 4; k++) {
    seis.push(paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porMetros(600), objetivos: [ritmo(218, 229)], posicion: { serie: { n: k, de: 4 } }, bloque: 1 }));
    seis.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(120), modoRecupera: 'trote', objetivos: [ritmo(400, 436)], bloque: 1 }));
  }
  const ocho: PasoBase[] = [];
  for (let k = 1; k <= 3; k++) {
    ocho.push(paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porMetros(800), objetivos: [ritmo(229, 235)], posicion: { serie: { n: k, de: 3 } }, bloque: 2 }));
    if (k < 3) ocho.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(180), modoRecupera: 'andar', bloque: 2 }));
  }
  const pasos = [...tramos, ...seis, ...ocho];
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas(
        [
          { fase: 'principal', trabajo: tramos[0]!, desde: 0, hasta: 0 },
          { fase: 'principal', trabajo: tramos[Math.min(6, Math.max(1, i))]!, desde: 1, hasta: 6 },
          { fase: 'principal', trabajo: tramos[7]!, desde: 7, hasta: 7 },
          { fase: 'principal', veces: 4, trabajo: seis[0]!, recupera: seis[1]!, desde: 8, hasta: 15 },
          { fase: 'principal', veces: 3, trabajo: ocho[0]!, recupera: ocho[1]!, desde: 16, hasta: 20 },
        ],
        i,
      ),
  };
}

// ---------------------------------------------------------------------------
// 509 · cinta: Drills 8′ · 3 × (6 × (1′ / 1′ caminando)) r 5′ — sin objetivo
// ---------------------------------------------------------------------------

export function sesion509(): PlanCorrer {
  const drills = paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: porTiempo(480), entorno: 'cinta', bloque: 0 });
  const pasos: PasoBase[] = [drills];
  for (let r = 1; r <= 3; r++) {
    for (let k = 1; k <= 6; k++) {
      pasos.push(paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porTiempo(60), entorno: 'cinta', posicion: { tanda: { n: r, de: 3 }, serie: { n: k, de: 6 } }, bloque: 1 }));
      if (k < 6) pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(60), modoRecupera: 'andar', entorno: 'cinta', bloque: 1 }));
    }
    if (r < 3) pasos.push(paso({ clase: 'descanso-tandas', rol: 'descanso', fase: 'principal', medida: porTiempo(300), entorno: 'cinta', bloque: 1 }));
  }
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas(
        [
          { fase: 'calentamiento', trabajo: drills, desde: 0, hasta: 0 },
          { fase: 'principal', veces: 6, trabajo: pasos[1]!, recupera: pasos[2]!, tandas: { veces: 3, descanso: pasos[12]! }, desde: 1, hasta: pasos.length - 1 },
        ],
        i,
      ),
  };
}

/** Índice del paso «tanda r, serie k» de 509 (12 pasos por tanda: 6 series, 5 recuperaciones y el descanso). */
export const indice509 = (r: number, k: number) => 1 + (r - 1) * 12 + (k - 1) * 2;

// ---------------------------------------------------------------------------
// 535 · cinta: 2 × (4 × (2′ @Z4 al 1 % / 2′ trote Z2) / 5′ Z1)
// ---------------------------------------------------------------------------

export function sesion535(): PlanCorrer {
  const pasos: PasoBase[] = [];
  const incl: Objetivo = { eje: 'inclinacion', min: 1, max: 1, papel: 'secundario' };
  for (let r = 1; r <= 2; r++) {
    for (let k = 1; k <= 4; k++) {
      pasos.push(
        paso({ clase: 'series', rol: 'trabajo', fase: 'principal', medida: porTiempo(120), objetivos: [zona(4), incl], entorno: 'cinta', posicion: { tanda: { n: r, de: 2 }, serie: { n: k, de: 4 } }, bloque: r }),
      );
      pasos.push(paso({ clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: porTiempo(120), modoRecupera: 'trote', objetivos: [zona(2, 'solo-arriba')], entorno: 'cinta', bloque: r }));
    }
    pasos.push(paso({ clase: 'descanso-tandas', rol: 'recuperacion', fase: 'principal', medida: porTiempo(300), modoRecupera: 'trote', objetivos: [zona(1, 'solo-arriba')], entorno: 'cinta', bloque: r }));
  }
  return {
    plan: base(pasos),
    control: 'siguiente',
    estructura: (i) =>
      filas([{ fase: 'principal', veces: 4, trabajo: pasos[0]!, recupera: pasos[1]!, tandas: { veces: 2, descanso: pasos[8]! }, desde: 0, hasta: pasos.length - 1 }], i),
  };
}
