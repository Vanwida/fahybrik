// EL CATÁLOGO DE SESIONES DE EJEMPLO — todas INVENTADAS (ninguna sale de la base
// de producción, CONTRATO-UI §7). Cada plantilla lleva lo que la pestaña necesita
// para romper el modelo: una duración escrita o cada una de las cuatro razones por
// las que no la hay, sesiones de un bloque, de tres y de dieciséis ejercicios,
// partes estructurales (el marco) y una nota del coach cuando la hay.
//
// El desglose (partes, formato, nota) llega aparte de la semana en el cable, así
// que aquí también va aparte: `desglosesDe` lo monta por id de sesión.

import type {
  Desglose,
  DesgloseSesion,
  DuracionEscrita,
  Franja,
  ModalidadHoy,
  ParteDeSesion,
  SemanaDelPlan,
  SesionDelPlan,
} from './contrato';
import { estadoDeDia, diaSemanaDe, sumaDias } from './modelo';
import type { EstadoSesion, PosicionEnBloque } from './contrato';

export type Clave =
  | 'series-800'
  | 'series-400'
  | 'fuerza-inferior'
  | 'fuerza-superior'
  | 'remo-5x1000'
  | 'rodaje-8k'
  | 'rodaje-45'
  | 'tirada-larga'
  | 'hyrox-sim'
  | 'chipper'
  | 'muerte-burpees'
  | 'circuito-pierna'
  | 'emom-20'
  | 'movilidad-core'
  | 'test-1k'
  | 'libre-rodaje'
  | 'importada';

interface Plantilla {
  titulo: string;
  modalidad: ModalidadHoy;
  duracion: DuracionEscrita | null;
  resumen: string | null;
  libre?: boolean;
  test?: boolean;
  /** Sin desglose = el servidor no lo sirve (`sin-detalle`). */
  desglose?: Omit<DesgloseSesion, 'medidoMin'>;
  /** Lo que mide una ejecución típica, si se llegó a hacer. */
  medidoMin?: number;
}

const parte = (titulo: string, ejercicios: string[], modalidad: ModalidadHoy, estructural = false): ParteDeSesion => ({
  titulo,
  ejercicios,
  modalidad,
  estructural,
});

const MARCO_CALENTAMIENTO = (modalidad: ModalidadHoy) =>
  parte('Calentamiento', ['Trote suave 10 min', 'Movilidad de cadera', 'Skipping', 'Progresivos 4×80 m'], modalidad, true);
const MARCO_VUELTA = parte('Vuelta a la calma', ['Trote 5 min', 'Estiramientos'], 'support', true);

const ESTACIONES_HYROX = [
  '1 km carrera',
  'SkiErg 1.000 m',
  '1 km carrera',
  'Sled Push 50 m',
  '1 km carrera',
  'Sled Pull 50 m',
  '1 km carrera',
  'Burpee broad jump 80 m',
  '1 km carrera',
  'Remo 1.000 m',
  '1 km carrera',
  'Farmers carry 200 m',
  '1 km carrera',
  'Sandbag lunges 100 m',
  '1 km carrera',
  'Wall balls 100',
];

export const PLANTILLAS: Record<Clave, Plantilla> = {
  'series-800': {
    titulo: 'Series 6×800',
    modalidad: 'run',
    duracion: { minutos: 50 },
    resumen: 'Calentamiento · Series · Vuelta a la calma',
    medidoMin: 52,
    desglose: {
      partes: [
        MARCO_CALENTAMIENTO('run'),
        parte('Series', ['Series 800 m a ritmo de 5 km', 'Trote de recuperación 400 m'], 'run'),
        MARCO_VUELTA,
      ],
      formato: null,
      nota: 'Los dos primeros, controlados. Los cuatro últimos, a ritmo de 5 km.',
    },
  },
  'series-400': {
    titulo: 'Series 8×400',
    modalidad: 'run',
    duracion: { minutos: 45 },
    resumen: 'Calentamiento · Series · Vuelta a la calma',
    medidoMin: 47,
    desglose: {
      partes: [
        MARCO_CALENTAMIENTO('run'),
        parte('Series', ['Series 400 m a ritmo de 3 km', 'Trote de recuperación 200 m'], 'run'),
        MARCO_VUELTA,
      ],
      formato: null,
      nota: null,
    },
  },
  'fuerza-inferior': {
    titulo: 'Fuerza tren inferior',
    modalidad: 'strength',
    duracion: { razon: 'work_not_timed' },
    resumen: 'Fuerza A · Accesorios',
    medidoMin: 58,
    desglose: {
      partes: [
        parte('Fuerza A', ['Sentadilla trasera', 'Peso muerto rumano', 'Zancada búlgara', 'Hip thrust'], 'strength'),
        parte('Accesorios', ['Elevación de gemelos', 'Plancha lateral'], 'strength'),
      ],
      formato: null,
      nota: 'Sube la carga solo si las cinco series salen limpias.',
    },
  },
  'fuerza-superior': {
    titulo: 'Fuerza tren superior',
    modalidad: 'strength',
    duracion: { razon: 'work_not_timed' },
    resumen: 'Empuje · Tirón',
    medidoMin: 55,
    desglose: {
      partes: [
        parte('Empuje', ['Press banca', 'Press militar', 'Fondos'], 'strength'),
        parte('Tirón', ['Dominadas', 'Remo con barra', 'Face pull'], 'strength'),
      ],
      formato: null,
      nota: null,
    },
  },
  'remo-5x1000': {
    titulo: 'Remo 5×1000',
    modalidad: 'ergo',
    duracion: { minutos: 35 },
    resumen: 'Calentamiento · Remo',
    medidoMin: 36,
    desglose: {
      partes: [
        parte('Calentamiento', ['Remo suave 5 min', 'Aperturas de cadera'], 'ergo', true),
        parte('Remo 5×1000', ['Remo 1.000 m a ritmo de 2 km'], 'ergo'),
      ],
      formato: '5 rondas · descanso 2:00',
      nota: null,
    },
  },
  'rodaje-8k': {
    titulo: 'Rodaje suave 8 km',
    modalidad: 'run',
    duracion: { minutos: 45 },
    resumen: 'Rodaje continuo',
    medidoMin: 47,
    // Un solo bloque: su título repetiría el de la sesión, así que no se encabeza con él.
    desglose: { partes: [parte('Rodaje suave 8 km', ['Rodaje continuo a ritmo fácil'], 'run')], formato: null, nota: null },
  },
  'rodaje-45': {
    titulo: 'Rodaje 45 min',
    modalidad: 'run',
    duracion: { minutos: 45 },
    resumen: 'Rodaje continuo',
    medidoMin: 45,
    desglose: { partes: [parte('Rodaje 45 min', ['Rodaje continuo a ritmo fácil'], 'run')], formato: null, nota: null },
  },
  'tirada-larga': {
    titulo: 'Tirada larga 16 km',
    modalidad: 'run',
    duracion: { minutos: 90 },
    resumen: 'Tirada progresiva',
    medidoMin: 92,
    desglose: {
      partes: [parte('Tirada larga 16 km', ['Tirada progresiva: los últimos 4 km, más rápido'], 'run')],
      formato: null,
      nota: 'Sal con agua. Los primeros 10 km, sin mirar el reloj.',
    },
  },
  'hyrox-sim': {
    titulo: 'Simulación HYROX',
    modalidad: 'hyrox',
    duracion: { razon: 'scored_by_time' },
    resumen: 'Calentamiento · Simulación · Vuelta a la calma',
    medidoMin: 71,
    desglose: {
      partes: [
        parte('Calentamiento', ['Trote suave 10 min', 'Movilidad de hombro', 'Sentadilla con goma', 'Progresivos 4×80 m'], 'run', true),
        parte('Simulación HYROX', ESTACIONES_HYROX, 'hyrox'),
        parte('Vuelta a la calma', ['Trote 5 min', 'Estiramientos', 'Respiración'], 'support', true),
      ],
      formato: 'For Time · 16 estaciones',
      nota: 'Sal a ritmo de carrera, no de entreno. Apunta el tiempo de cada estación en cuanto la termines.',
    },
  },
  chipper: {
    titulo: 'Chipper de piernas',
    modalidad: 'functional',
    duracion: { razon: 'scored_by_time' },
    resumen: 'Chipper',
    medidoMin: 24,
    desglose: {
      partes: [
        parte('Chipper', ['Wall balls 50', 'Zancadas con salto 40', 'Burpees 30', 'Box jump 20', 'Kettlebell swing 10'], 'functional'),
      ],
      formato: 'For Time · 1 ronda',
      nota: null,
    },
  },
  'muerte-burpees': {
    titulo: 'Muerte por burpees',
    modalidad: 'functional',
    duracion: { razon: 'until_failure' },
    resumen: 'Cada minuto',
    medidoMin: 18,
    desglose: {
      partes: [parte('Muerte por burpees', ['Burpees, uno más cada minuto'], 'functional')],
      formato: 'Cada minuto · hasta fallar',
      nota: null,
    },
  },
  'circuito-pierna': {
    titulo: 'Circuito de pierna',
    modalidad: 'strength',
    duracion: { razon: 'undosed' },
    resumen: null,
    medidoMin: 52,
    // Tres de los cuatro ejercicios llegan sin dosis: el hueco es del coach y se dice en la duración.
    desglose: {
      partes: [parte('Circuito', ['Zancada con mancuernas', 'Puente de glúteo', 'Sentadilla goblet', 'Gemelos a una pierna'], 'strength')],
      formato: null,
      nota: null,
    },
  },
  'emom-20': {
    titulo: 'EMOM 20 min',
    modalidad: 'functional',
    duracion: { minutos: 20 },
    resumen: 'EMOM',
    medidoMin: 20,
    desglose: {
      partes: [parte('EMOM', ['Minuto impar: 12 cal en la bici', 'Minuto par: 10 thrusters'], 'functional')],
      formato: 'EMOM · 20:00',
      nota: null,
    },
  },
  'movilidad-core': {
    titulo: 'Movilidad y core',
    modalidad: 'support',
    duracion: { minutos: 25 },
    resumen: 'Movilidad · Core',
    medidoMin: 25,
    desglose: {
      partes: [
        parte('Movilidad', ['Cadera 90/90', 'Columna torácica', 'Tobillo'], 'support'),
        parte('Core', ['Dead bug', 'Plancha', 'Pallof press'], 'strength'),
      ],
      formato: null,
      nota: null,
    },
  },
  'test-1k': {
    titulo: 'Test 1 km',
    modalidad: 'run',
    duracion: { minutos: 15 },
    resumen: 'Calentamiento · Test',
    test: true,
    medidoMin: 16,
    desglose: {
      partes: [MARCO_CALENTAMIENTO('run'), parte('Test', ['1 km al máximo, en llano'], 'run')],
      formato: null,
      nota: 'Un solo intento. Descansa bien antes: este número fija tus ritmos.',
    },
  },
  'libre-rodaje': {
    titulo: 'Rodaje libre 40 min',
    modalidad: 'run',
    duracion: { minutos: 40 },
    resumen: null,
    libre: true,
    medidoMin: 41,
    desglose: { partes: [parte('Rodaje libre 40 min', ['Rodaje continuo'], 'run')], formato: null, nota: null },
  },
  importada: {
    titulo: 'Trainingpeaks · Semana 1 · Entrenamiento de fuerza y rodaje progresivo',
    modalidad: 'strength',
    duracion: { razon: 'undosed' },
    resumen: null,
    medidoMin: 63,
    desglose: {
      partes: [
        parte('Fuerza', ['Sentadilla frontal', 'Press de banca inclinado', 'Remo con mancuerna', 'Zancada caminando', 'Face pull'], 'strength'),
        parte('Rodaje progresivo', ['Trote 20 min', 'Ritmo medio 10 min', 'Trote suave 5 min'], 'run'),
        parte('Core', ['Plancha', 'Elevación de piernas', 'Rotación rusa'], 'strength'),
        parte('Movilidad', ['Cadera', 'Tobillo', 'Hombro'], 'support'),
        parte('Respiración', ['Respiración diafragmática'], 'support'),
      ],
      formato: null,
      nota: 'Esta semana viene importada de tu plan anterior. La reviso contigo el viernes y la ajustamos a lo que ya llevas hecho.',
    },
  },
};

/** El id lleva la clave de la plantilla y el día: único por sesión y legible en un `onLog`. */
const idDe = (clave: Clave, iso: string, franja?: Franja) => `${clave}@${iso}${franja ? `-${franja}` : ''}`;
export const claveDe = (id: string): Clave => id.split('@')[0] as Clave;

export interface ExtraSesion {
  franja?: Franja;
  libre?: boolean;
  test?: boolean;
  duracion?: DuracionEscrita | null;
}

export function ses(clave: Clave, iso: string, estado: EstadoSesion = 'pendiente', extra: ExtraSesion = {}): SesionDelPlan {
  const p = PLANTILLAS[clave];
  return {
    id: idDe(clave, iso, extra.franja),
    franja: extra.franja ?? 'AM',
    titulo: p.titulo,
    modalidad: p.modalidad,
    estado,
    libre: extra.libre ?? p.libre ?? false,
    test: extra.test ?? p.test ?? false,
    duracion: extra.duracion !== undefined ? extra.duracion : p.duracion,
    resumen: p.resumen,
  };
}

// ---------------------------------------------------------------------------
// Semanas
// ---------------------------------------------------------------------------

export interface DatosSemana {
  nombreBloque?: string | null;
  posicion?: PosicionEnBloque | null;
  intencion?: string | null;
  planStartsOn?: string | null;
  hayMasAdelante?: boolean;
  bloqueadaPorHorizonte?: boolean;
}

/**
 * Una semana de lunes a domingo. `dias` son las sesiones de cada día, EN ORDEN
 * (lunes primero). `hoyIso` decide el sello de cada día (una pendiente pasada es
 * «sin hacer») y dónde cae hoy.
 */
export type Spec = [clave: Clave, estado?: EstadoSesion, extra?: ExtraSesion];

export function semana(lunes: string, hoyIso: string, dias: Spec[][], datos: DatosSemana = {}): SemanaDelPlan {
  if (diaSemanaDe(lunes) !== 1) throw new Error(`La semana debe empezar en lunes: ${lunes}`);
  const resueltos = Array.from({ length: 7 }, (_, i) => {
    const iso = sumaDias(lunes, i);
    const sesiones = (dias[i] ?? []).map(([clave, estado, extra]) => ses(clave, iso, estado, extra));
    return {
      iso,
      diaSemana: i + 1,
      sesiones,
      estado: estadoDeDia(sesiones, iso, hoyIso),
      esHoy: iso === hoyIso,
    };
  });
  const indiceHoy = resueltos.findIndex((d) => d.esHoy);
  return {
    desde: lunes,
    hasta: sumaDias(lunes, 6),
    dias: resueltos,
    indiceHoy: indiceHoy >= 0 ? indiceHoy : null,
    intencion: datos.intencion ?? null,
    nombreBloque: datos.nombreBloque ?? null,
    posicion: datos.posicion ?? null,
    planStartsOn: datos.planStartsOn ?? null,
    hayMasAdelante: datos.hayMasAdelante ?? false,
    bloqueadaPorHorizonte: datos.bloqueadaPorHorizonte ?? false,
  };
}

/** Atajo legible: `d('rodaje-8k', 'hecha')` = una sesión de ese día (el ISO lo pone `semana`). */
export const d = (clave: Clave, estado: EstadoSesion = 'pendiente', extra: ExtraSesion = {}): Spec => [clave, estado, extra];

// ---------------------------------------------------------------------------
// Desgloses
// ---------------------------------------------------------------------------

/**
 * El desglose de cada sesión de las semanas dadas. Una sesión terminada trae los
 * minutos MEDIDOS de su ejecución; una pendiente no tiene medida. `sobrescribe`
 * fija el estado de carga o falla de una en concreto.
 */
export function desglosesDe(semanas: Array<SemanaDelPlan | null | 'falla'>, sobrescribe: Record<string, Desglose> = {}): Record<string, Desglose> {
  const salida: Record<string, Desglose> = {};
  for (const s of semanas) {
    if (!s || s === 'falla') continue;
    for (const dia of s.dias) {
      for (const sesion of dia.sesiones) {
        const p = PLANTILLAS[claveDe(sesion.id)];
        if (!p.desglose) continue;
        const terminada = sesion.estado === 'hecha' || sesion.estado === 'parcial';
        const medido = sesion.estado === 'parcial' ? Math.round((p.medidoMin ?? 0) * 0.5) : (p.medidoMin ?? null);
        salida[sesion.id] = { estado: 'listo', ...p.desglose, medidoMin: terminada ? medido : null };
      }
    }
  }
  return { ...salida, ...sobrescribe };
}
