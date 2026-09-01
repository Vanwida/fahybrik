// LOS CUATRO ATLETAS — cada uno rompe la pantalla por un sitio distinto.
//
//   ① SERIES-MEJORANDO   12 series en 4 meses, progresión clara, sesgo rápido
//                        en la adherencia (el atleta ya bate el ritmo pedido).
//   ② RODAJES            el chip que abre es uno SIN banda: progresión por
//                        ritmo al mismo pulso, sin bloque de adherencia.
//   ③ TIPO-ESCASO         Cuestas con 2 sesiones: sin línea (y sin poder
//                        juzgar el % en banda — 7 reps no llegan al mínimo),
//                        pero las 2 sesiones se listan igual.
//   ④ VACÍO               nadie tiene un tipo detectado todavía.
//
// Datos inventados y realistas — nunca del seed. `HOY` es el mismo 13-ago-2026
// que usa `correr-historial/datos.ts`, para que las fechas de esta familia no
// se contradigan entre pantallas.

import { MIN_REPS_JUZGABLE, type Adherencia, type EstadoTipo, type SesionTipo, type TipoPorEntreno } from './modelo';

export const HOY = '2026-08-13';

interface Spec {
  fecha: string;
  dosis: string;
  ritmo: number;
  alPulso?: number;
  fc?: number;
  pct?: number;
}

function sesiones(specs: Spec[]): SesionTipo[] {
  return specs.map((s) => ({
    fecha: s.fecha,
    dosis: s.dosis,
    ritmo_s_km: s.ritmo,
    ritmo_al_pulso_s_km: s.alPulso ?? null,
    fc_media_ppm: s.fc ?? null,
    pct_en_banda: s.pct ?? null,
  }));
}

function adherencia(dentro: number, lento: number, rapido: number): Adherencia {
  const evaluadas = dentro + lento + rapido;
  return {
    evaluadas,
    dentro,
    fuera_lento: lento,
    fuera_rapido: rapido,
    pct_en_banda: Math.round((dentro / evaluadas) * 100),
    juzgable: evaluadas >= MIN_REPS_JUZGABLE,
  };
}

function vacioTipo(tipo: TipoPorEntreno): EstadoTipo {
  return { tipo, sesiones: [], adherencia: null };
}

export interface Escenario {
  /** El chip que abre la pantalla. Null solo en el vacío total (no hay chips). */
  tipoInicial: TipoPorEntreno | null;
  porTipo: Record<TipoPorEntreno, EstadoTipo>;
}

// ---------------------------------------------------------------------------
// ① El que mejora en series — doce 6×800 (y variantes) en cuatro meses
// ---------------------------------------------------------------------------

const SERIES_1: EstadoTipo = {
  tipo: 'series',
  sesiones: sesiones([
    { fecha: '2026-04-20', dosis: '6×800', ritmo: 215, fc: 168, pct: 78 },
    { fecha: '2026-04-30', dosis: '6×800', ritmo: 213, fc: 169, pct: 83 },
    { fecha: '2026-05-11', dosis: '5×1000', ritmo: 212, fc: 170, pct: 70 },
    { fecha: '2026-05-21', dosis: '6×800', ritmo: 209, fc: 169, pct: 75 },
    { fecha: '2026-06-01', dosis: '4×1200', ritmo: 210, fc: 172, pct: 60 },
    { fecha: '2026-06-11', dosis: '6×800', ritmo: 206, fc: 171, pct: 65 },
    { fecha: '2026-06-19', dosis: '8×400', ritmo: 205, fc: 173, pct: 55 },
    { fecha: '2026-06-29', dosis: '6×800', ritmo: 203, fc: 172, pct: 50 },
    { fecha: '2026-07-09', dosis: '5×1000', ritmo: 201, fc: 174, pct: 45 },
    { fecha: '2026-07-20', dosis: '6×800', ritmo: 200, fc: 173, pct: 50 },
    { fecha: '2026-07-30', dosis: '6×800', ritmo: 199, fc: 175, pct: 40 },
    { fecha: '2026-08-09', dosis: '4×1200', ritmo: 197, fc: 174, pct: 33 },
  ]),
  // Sesgo rápido: cada vez menos reps «dentro» porque el atleta ya corre más
  // rápido que la banda que le pusieron hace cuatro meses — la banda quedó
  // vieja, no el atleta. 68 reps evaluadas (6+6+5+6+4+6+8+6+5+6+6+4).
  adherencia: adherencia(38, 6, 24),
};

const RODAJE_1: EstadoTipo = {
  tipo: 'rodaje',
  sesiones: sesiones([
    { fecha: '2026-04-25', dosis: '45 min suave', ritmo: 338, alPulso: 335, fc: 151 },
    { fecha: '2026-05-09', dosis: '8 km suave', ritmo: 330, alPulso: 332, fc: 149 },
    { fecha: '2026-05-23', dosis: '50 min suave', ritmo: 333, alPulso: 329, fc: 150 },
    { fecha: '2026-06-06', dosis: '9 km suave', ritmo: 325, alPulso: 327, fc: 148 },
    { fecha: '2026-06-20', dosis: '50 min suave', ritmo: 328, alPulso: 324, fc: 151 },
    { fecha: '2026-07-04', dosis: '10 km suave', ritmo: 319, alPulso: 322, fc: 149 },
    { fecha: '2026-07-18', dosis: '55 min suave', ritmo: 323, alPulso: 320, fc: 150 },
    { fecha: '2026-08-05', dosis: '10 km suave', ritmo: 316, alPulso: 318, fc: 148 },
  ]),
  adherencia: null,
};

const LARGO_1: EstadoTipo = {
  tipo: 'largo',
  sesiones: sesiones([
    { fecha: '2026-05-03', dosis: '14 km', ritmo: 355, alPulso: 352, fc: 147 },
    { fecha: '2026-06-07', dosis: '16 km', ritmo: 344, alPulso: 347, fc: 146 },
    { fecha: '2026-07-05', dosis: '17 km', ritmo: 347, alPulso: 344, fc: 148 },
    { fecha: '2026-08-02', dosis: '18 km', ritmo: 335, alPulso: 339, fc: 145 },
  ]),
  adherencia: null,
};

const SERIES_MEJORANDO: Escenario = {
  tipoInicial: 'series',
  porTipo: {
    series: SERIES_1,
    rodaje: RODAJE_1,
    largo: LARGO_1,
    fartlek: vacioTipo('fartlek'),
    cuesta: vacioTipo('cuesta'),
    tempo: vacioTipo('tempo'),
  },
};

// ---------------------------------------------------------------------------
// ② El de los rodajes — progresión por ritmo al mismo pulso, sin banda
// ---------------------------------------------------------------------------

const RODAJE_2: EstadoTipo = {
  tipo: 'rodaje',
  sesiones: sesiones([
    { fecha: '2026-06-08', dosis: '40 min suave', ritmo: 343, alPulso: 340, fc: 150 },
    { fecha: '2026-06-15', dosis: '45 min suave', ritmo: 331, alPulso: 337, fc: 147 },
    { fecha: '2026-06-22', dosis: '6 km suave', ritmo: 338, alPulso: 334, fc: 149 },
    { fecha: '2026-06-29', dosis: '50 min suave', ritmo: 325, alPulso: 332, fc: 146 },
    { fecha: '2026-07-06', dosis: '7 km suave', ritmo: 333, alPulso: 330, fc: 150 },
    { fecha: '2026-07-13', dosis: '45 min suave', ritmo: 320, alPulso: 328, fc: 147 },
    { fecha: '2026-07-20', dosis: '8 km suave', ritmo: 330, alPulso: 326, fc: 149 },
    { fecha: '2026-07-27', dosis: '50 min suave', ritmo: 318, alPulso: 325, fc: 146 },
    { fecha: '2026-08-03', dosis: '9 km suave', ritmo: 325, alPulso: 323, fc: 148 },
    { fecha: '2026-08-10', dosis: '50 min rodaje', ritmo: 317, alPulso: 322, fc: 147 },
  ]),
  adherencia: null,
};

const SERIES_2: EstadoTipo = {
  tipo: 'series',
  sesiones: sesiones([
    { fecha: '2026-06-12', dosis: '5×600', ritmo: 208, fc: 170, pct: 55 },
    { fecha: '2026-06-26', dosis: '4×800', ritmo: 206, fc: 171, pct: 60 },
    { fecha: '2026-07-10', dosis: '5×600', ritmo: 204, fc: 169, pct: 58 },
    { fecha: '2026-07-24', dosis: '4×800', ritmo: 203, fc: 172, pct: 65 },
    { fecha: '2026-08-07', dosis: '5×600', ritmo: 201, fc: 170, pct: 68 },
  ]),
  // 5+4+5+4+5 = 23 reps evaluadas.
  adherencia: adherencia(14, 5, 4),
};

const LARGO_2: EstadoTipo = {
  tipo: 'largo',
  sesiones: sesiones([
    { fecha: '2026-06-20', dosis: '12 km', ritmo: 353, alPulso: 350, fc: 146 },
    { fecha: '2026-07-18', dosis: '14 km', ritmo: 344, alPulso: 347, fc: 148 },
    { fecha: '2026-08-08', dosis: '15 km', ritmo: 340, alPulso: 344, fc: 145 },
  ]),
  adherencia: null,
};

const RODAJES: Escenario = {
  tipoInicial: 'rodaje',
  porTipo: {
    rodaje: RODAJE_2,
    series: SERIES_2,
    largo: LARGO_2,
    fartlek: vacioTipo('fartlek'),
    cuesta: vacioTipo('cuesta'),
    tempo: vacioTipo('tempo'),
  },
};

// ---------------------------------------------------------------------------
// ③ Tipo escaso — Cuestas con 2 sesiones: sin línea, sin poder juzgar la
//    adherencia (7 reps < MIN_REPS_JUZGABLE), pero las 2 sesiones se listan
// ---------------------------------------------------------------------------

const CUESTA_3: EstadoTipo = {
  tipo: 'cuesta',
  sesiones: sesiones([
    { fecha: '2026-07-28', dosis: '3×200 cuesta', ritmo: 260, fc: 174, pct: 67 },
    { fecha: '2026-08-08', dosis: '4×150 cuesta', ritmo: 255, fc: 176, pct: 50 },
  ]),
  // 3+4 = 7 reps: por debajo del mínimo para juzgar (MIN_REPS_JUZGABLE = 8).
  // Se enseña el % igual, pero sin color — la cifra existe, no concluye.
  adherencia: adherencia(4, 1, 2),
};

const SERIES_3: EstadoTipo = {
  tipo: 'series',
  sesiones: sesiones([
    { fecha: '2026-06-07', dosis: '6×800', ritmo: 219, fc: 168, pct: 65 },
    { fecha: '2026-06-21', dosis: '5×1000', ritmo: 216, fc: 169, pct: 72 },
    { fecha: '2026-07-05', dosis: '6×800', ritmo: 214, fc: 170, pct: 70 },
    { fecha: '2026-07-19', dosis: '4×1200', ritmo: 212, fc: 171, pct: 78 },
    { fecha: '2026-08-02', dosis: '6×800', ritmo: 210, fc: 172, pct: 74 },
    { fecha: '2026-08-09', dosis: '6×800', ritmo: 208, fc: 171, pct: 80 },
  ]),
  // 6+5+6+4+6+6 = 33 reps evaluadas.
  adherencia: adherencia(24, 5, 4),
};

const RODAJE_3: EstadoTipo = {
  tipo: 'rodaje',
  sesiones: sesiones([
    { fecha: '2026-05-25', dosis: '45 min suave', ritmo: 335, alPulso: 332, fc: 151 },
    { fecha: '2026-06-08', dosis: '8 km suave', ritmo: 325, alPulso: 330, fc: 148 },
    { fecha: '2026-06-15', dosis: '45 min suave', ritmo: 330, alPulso: 327, fc: 150 },
    { fecha: '2026-06-22', dosis: '8 km suave', ritmo: 320, alPulso: 326, fc: 147 },
    { fecha: '2026-07-06', dosis: '50 min suave', ritmo: 327, alPulso: 324, fc: 151 },
    { fecha: '2026-07-13', dosis: '9 km suave', ritmo: 315, alPulso: 322, fc: 148 },
    { fecha: '2026-07-20', dosis: '50 min suave', ritmo: 324, alPulso: 321, fc: 150 },
    { fecha: '2026-07-27', dosis: '9 km suave', ritmo: 313, alPulso: 320, fc: 147 },
    { fecha: '2026-08-03', dosis: '50 min suave', ritmo: 321, alPulso: 318, fc: 149 },
    { fecha: '2026-08-10', dosis: '10 km suave', ritmo: 312, alPulso: 317, fc: 148 },
  ]),
  adherencia: null,
};

const LARGO_3: EstadoTipo = {
  tipo: 'largo',
  sesiones: sesiones([
    { fecha: '2026-06-14', dosis: '13 km', ritmo: 358, alPulso: 355, fc: 146 },
    { fecha: '2026-07-12', dosis: '15 km', ritmo: 346, alPulso: 349, fc: 147 },
    { fecha: '2026-08-09', dosis: '16 km', ritmo: 342, alPulso: 345, fc: 145 },
  ]),
  adherencia: null,
};

const TIPO_ESCASO: Escenario = {
  tipoInicial: 'cuesta',
  porTipo: {
    cuesta: CUESTA_3,
    series: SERIES_3,
    rodaje: RODAJE_3,
    largo: LARGO_3,
    fartlek: vacioTipo('fartlek'),
    tempo: vacioTipo('tempo'),
  },
};

// ---------------------------------------------------------------------------
// ④ Vacío — nadie tiene un tipo detectado todavía
// ---------------------------------------------------------------------------

const VACIO: Escenario = {
  tipoInicial: null,
  porTipo: {
    series: vacioTipo('series'),
    rodaje: vacioTipo('rodaje'),
    largo: vacioTipo('largo'),
    fartlek: vacioTipo('fartlek'),
    cuesta: vacioTipo('cuesta'),
    tempo: vacioTipo('tempo'),
  },
};

export const ESCENAS: Record<string, Escenario> = {
  'series-mejorando': SERIES_MEJORANDO,
  rodajes: RODAJES,
  'tipo-escaso': TIPO_ESCASO,
  vacio: VACIO,
};
