// LOS PLANES DE LA GRAMÁTICA — lo mínimo para enseñar la carcasa en una
// carrera, en una serie de fuerza y en una estación. Cada uno sale de una
// sesión real o de un ejemplo literal del modelo (se dice cuál).

import {
  REGLAS_AVISO_DEFECTO,
  type FilaEstructura,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type Simulador,
  type ZonasCoach,
} from '../../kit-reloj';

/** Umbral 170 ppm, 5 zonas del coach (Z1 ≤ 138 · Z2 ≤ 150 · Z3 ≤ 160 · Z4 ≤ 173 · Z5 ≤ 192). */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

const base = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

const estado = (i: number, desde: number, hasta: number): FilaEstructura['estado'] =>
  i > hasta ? 'hecho' : i >= desde ? 'ahora' : 'pendiente';

const ruido = (t: number, a: number) => Math.sin(t * 1.3) * a * 0.6 + Math.sin(t * 0.37 + 1) * a * 0.4;

// ---------------------------------------------------------------------------
// Carrera · 6 × 1000 m @3:45–3:55 r 90″ trote (el caso ilustrativo del modelo)
// ---------------------------------------------------------------------------

const ritmoSerie: Objetivo = { eje: 'ritmo', min: 225, max: 235, papel: 'principal' };

export function planSeries(): { plan: PlanSesion; estructura: (i: number) => FilaEstructura[] } {
  const cal: PasoBase = { id: 'cal', clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: { tipo: 'tiempo', prescrito: 900, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque: 0 };
  const pasos: PasoBase[] = [cal];
  for (let k = 1; k <= 6; k++) {
    pasos.push({ id: `s${k}`, clase: 'series', rol: 'trabajo', fase: 'principal', medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' }, objetivos: [ritmoSerie], posicion: { serie: { n: k, de: 6 } }, cierre: 'medida', bloque: 1 });
    if (k < 6) pasos.push({ id: `r${k}`, clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 90, mide: 'reloj' }, objetivos: [], modoRecupera: 'trote', cierre: 'medida', bloque: 1 });
  }
  const vuelta: PasoBase = { id: 'vc', clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: { tipo: 'tiempo', prescrito: 600, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque: 2 };
  pasos.push(vuelta);
  return {
    plan: base(pasos),
    estructura: (i) => [
      { fase: 'calentamiento', trabajo: cal, estado: estado(i, 0, 0) },
      { fase: 'principal', veces: 6, trabajo: pasos[1]!, recupera: pasos[2]!, estado: estado(i, 1, 11) },
      { fase: 'vuelta', trabajo: vuelta, estado: estado(i, 12, 12) },
    ],
  };
}

/** El corredor de la serie 3: dentro de la banda, pulso asentado en Z4. */
export const cuerpoSeries: Simulador = (p, _i, t) => {
  if (p.rol === 'recuperacion') return { ritmo: 370 + ruido(t, 6), ppm: Math.round(130 + 42 * Math.exp(-t / 32)), ppmTendencia: 'baja', gps: 'listo' };
  if (p.fase !== 'principal') return { ritmo: 330 + ruido(t, 3), ppm: 140, gps: 'listo' };
  return { ritmo: Math.round(230 + ruido(t, 1.6)), ppm: Math.round(171 + ruido(t + 3, 1.2)), gps: 'listo' };
};

export const INICIO_SERIE3 = {
  i: 5,
  t: 88,
  metros: 380,
  sesionT: 1627,
  sesionM: 5581,
  ppmMedio: 152,
  vueltas: [
    { n: 1, clase: 'serie' as const, segundos: 231, metros: 1000, ritmo: 231, ppm: 169, veredicto: 'dentro' as const, eje: 'ritmo' as const },
    { n: 2, clase: 'serie' as const, segundos: 228, metros: 1000, ritmo: 228, ppm: 171, veredicto: 'dentro' as const, eje: 'ritmo' as const },
  ],
};

// ---------------------------------------------------------------------------
// Fuerza · 529: A1 Back Squat 4 × 8 @65–70 % RM (121–131 kg) + A2 Box Jump 4 × 6, r 2′
// ---------------------------------------------------------------------------

export function planFuerza(): { plan: PlanSesion; estructura: (i: number) => FilaEstructura[] } {
  const pasos: PasoBase[] = [];
  for (let k = 1; k <= 4; k++) {
    pasos.push({
      id: `sq${k}`,
      clase: 'fuerza',
      rol: 'trabajo',
      fase: 'principal',
      nombre: 'Back Squat',
      medida: { tipo: 'reps', prescrito: 8, mide: 'atleta' },
      objetivos: [
        { eje: 'pctRM', min: 65, max: 70, papel: 'principal' },
        { eje: 'kg', min: 121, max: 131, papel: 'secundario' },
      ],
      posicion: { serie: { n: k, de: 4 }, slot: 'A1' },
      cierre: 'atleta',
      bloque: 0,
    });
    pasos.push({ id: `bj${k}`, clase: 'fuerza', rol: 'trabajo', fase: 'principal', nombre: 'Box Jump', medida: { tipo: 'reps', prescrito: 6, mide: 'atleta' }, objetivos: [], posicion: { serie: { n: k, de: 4 }, slot: 'A2' }, cierre: 'atleta', bloque: 0 });
    if (k < 4) pasos.push({ id: `d${k}`, clase: 'descanso', rol: 'descanso', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' }, objetivos: [], cierre: 'medida', bloque: 0 });
  }
  return {
    plan: base(pasos),
    estructura: (i) => [
      { fase: 'principal', veces: 4, trabajo: pasos[0]!, estado: estado(i, 0, 10) },
      { fase: 'principal', veces: 4, trabajo: pasos[1]!, recupera: pasos[2]!, estado: estado(i, 0, 10) },
    ],
  };
}

export const cuerpoFuerza: Simulador = (_p, _i, t) => ({ ritmo: null, ppm: Math.round(128 + t * 0.4 + ruido(t, 1)), gps: 'no-aplica' });

// ---------------------------------------------------------------------------
// Estación · el ejemplo del modelo (P10): «Sled Push · 50 m · 152 kg», «Ronda 2/5 · Estación 3/4»
// ---------------------------------------------------------------------------

export function planEstacion(): { plan: PlanSesion; estructura: (i: number) => FilaEstructura[] } {
  const sled: PasoBase = {
    id: 'sled',
    clase: 'estacion',
    rol: 'trabajo',
    fase: 'principal',
    nombre: 'Sled Push',
    medida: { tipo: 'distancia', prescrito: 50, mide: 'atleta' },
    objetivos: [],
    carga: { kg: 152 },
    posicion: { ronda: { n: 2, de: 5 }, estacion: { n: 3, de: 4 } },
    cierre: 'atleta',
    bloque: 0,
  };
  const run: PasoBase = {
    id: 'run',
    clase: 'carrera',
    rol: 'trabajo',
    fase: 'principal',
    medida: { tipo: 'distancia', prescrito: 1000, mide: 'gps' },
    objetivos: [{ eje: 'rpe', min: 8, max: 8, papel: 'principal' }],
    posicion: { ronda: { n: 2, de: 5 } },
    cierre: 'medida',
    bloque: 0,
  };
  return {
    plan: base([sled, run]),
    estructura: (i) => [
      { fase: 'principal', trabajo: sled, estado: estado(i, 0, 0) },
      { fase: 'principal', trabajo: run, estado: estado(i, 1, 1) },
    ],
  };
}

export const cuerpoEstacion: Simulador = (p, _i, t) =>
  p.clase === 'estacion'
    ? { ritmo: null, ppm: Math.round(166 + ruido(t, 1.5)), gps: 'listo' }
    : { ritmo: Math.round(262 + ruido(t, 2)), ppm: Math.round(170 + ruido(t, 1.5)), gps: 'listo' };

// ---------------------------------------------------------------------------
// Espejo sin enlace · 535 en cinta: 2′ @Z4 al 1 %, los metros de la cinta llegan por el móvil
// ---------------------------------------------------------------------------

export function planCintaEspejo(): { plan: PlanSesion; estructura: (i: number) => FilaEstructura[] } {
  const rep: PasoBase = {
    id: 'c2',
    clase: 'series',
    rol: 'trabajo',
    fase: 'principal',
    medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' },
    objetivos: [
      { eje: 'zona', min: 4, max: 4, papel: 'principal' },
      { eje: 'inclinacion', min: 1, max: 1, papel: 'secundario' },
    ],
    entorno: 'cinta',
    posicion: { tanda: { n: 1, de: 2 }, serie: { n: 2, de: 4 } },
    cierre: 'medida',
    bloque: 1,
  };
  const rec: PasoBase = { id: 'r2', clase: 'recuperacion', rol: 'recuperacion', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 120, mide: 'reloj' }, objetivos: [], modoRecupera: 'trote', entorno: 'cinta', cierre: 'medida', bloque: 1 };
  return {
    plan: base([rep, rec]),
    estructura: (i) => [{ fase: 'principal', veces: 4, trabajo: rep, recupera: rec, estado: estado(i, 0, 1) }],
  };
}

/** El escenario arranca a los 48 s de la serie. */
export const INICIO_CINTA = { i: 0, t: 48, metros: 192, sesionT: 288, sesionM: 1005, ppmMedio: 152 };

/**
 * A los 3 s de escenario el móvil deja de llegar: la cinta (metros y ritmo,
 * que el móvil lee por BLE) se queda sin enlace; el pulso y el reloj son de
 * la muñeca y siguen.
 */
export const cuerpoCintaEspejo: Simulador = (_p, _i, t) => ({
  ritmo: Math.round(250 + ruido(t, 1)),
  ppm: Math.round(168 + ruido(t + 3, 1.2)),
  gps: 'no-aplica',
  viejos: t >= INICIO_CINTA.t + 3 ? ['hecho', 'ritmo'] : undefined,
});
