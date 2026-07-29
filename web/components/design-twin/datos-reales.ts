// Los casos de PRODUCCIÓN con los que se dirige la tanda de composición.
//
// Nada de aquí está inventado. Todo sale de la base el 29-jul-2026 y lleva su
// procedencia al lado, porque un mockup que enseña un número que la app no
// puede saber es un mockup que miente (CONTRATO-UI §7).
//
// Los tres hechos que MANDAN sobre el diseño:
//
//  1. El atleta de entreno libre (64) tiene 1 bloque / 1 ítem en 9 de sus 11
//     asignaciones. El caso corto no es la excepción: es la norma.
//  2. Las zonas casi nunca se pintan: 9 filas con `zone_seconds` de 206
//     `segment_executions`, y 8 son del mismo atleta. La FC sí: 181 de 206.
//  3. El bloque más largo de la base son los 16 ítems de la simulación HYROX
//     (plantillas 441/446, asignaciones 239/244). Es el único que desborda.
//
// Los nombres de ejercicio van TAL CUAL están en `exercises.name` — en inglés,
// porque así están guardados. No se traducen aquí: el hueco es del modelo de
// datos (no hay nombre en español que enseñar) y taparlo en un mockup lo
// escondería justo de quien tiene que decidir arreglarlo.

export type Modalidad = 'run' | 'row' | 'ski' | 'bike' | 'strength' | 'functional' | 'mobility';

/** Una línea de trabajo: qué se hace, cuánto, y contra qué. */
export interface ItemReal {
  /** `exercises.name`. */
  nombre: string;
  /** La MEDIDA — distancia, tiempo, reps o calorías. */
  dosis: string;
  /** El OBJETIVO — ritmo, zona, RPE, %RM o kg. Ausente = no lo hay. */
  objetivo?: string;
  /** Descanso entre series, en segundos. Ausente = la prescripción no lo lleva. */
  descansoS?: number;
  /** Series, cuando la prescripción las declara (`sets[]`). */
  series?: number;
  modalidad: Modalidad;
}

export interface BloqueReal {
  titulo: string;
  /** La línea de formato («EMOM · 10 rondas · cada 1:00»). Ausente = el título basta. */
  formato?: string;
  /** Calentamiento y vuelta a la calma se cierran de UNA, no ítem a ítem. */
  estructural?: boolean;
  items: ItemReal[];
}

export interface SesionReal {
  /** Qué fila de producción es. */
  procedencia: string;
  titulo: string;
  origen: 'coach' | 'libre';
  bloques: BloqueReal[];
}

// ---------------------------------------------------------------------------
// EL CASO MÍNIMO — atleta 64, entreno libre, 1 bloque / 1 ítem (9 de 11)
// ---------------------------------------------------------------------------

/** `templates` 500 · asignación 352 · `{"scheme":"steady","target":{"kind":"pace","unit":"per_500m","value_s":112}}`. */
export const REMO_500: SesionReal = {
  procedencia: 'plantilla 500 · asignación 352 · atleta 64',
  titulo: 'Remo 500 m',
  origen: 'libre',
  bloques: [
    {
      titulo: 'Remo 500 m',
      items: [{ nombre: 'Rowing', dosis: '500 m', objetivo: '1:52/500m', modalidad: 'row' }],
    },
  ],
};

/** `templates` 497 · asignación 349 · cuatro series iguales de 5 @ 100 kg, descanso 90 s. */
export const BACK_SQUAT: SesionReal = {
  procedencia: 'plantilla 497 · asignación 349 · atleta 64',
  titulo: 'Fuerza · Back Squat',
  origen: 'libre',
  bloques: [
    {
      titulo: 'Fuerza · Back Squat',
      items: [
        { nombre: 'Back Squat', dosis: '5 reps', objetivo: '100 kg', descansoS: 90, series: 4, modalidad: 'strength' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// EL CASO MÁXIMO — simulación HYROX: 3 bloques, 23 ítems, uno de ellos de 16
// ---------------------------------------------------------------------------

const RUN_1K: ItemReal = { nombre: 'Run', dosis: '1,00 km', modalidad: 'run' };

/** `template_segments` de la plantilla 441 · asignación 239 · atleta 67. */
export const HYROX: SesionReal = {
  procedencia: 'plantilla 441 · asignación 239 · atleta 67',
  titulo: 'Simulación HYROX',
  origen: 'coach',
  bloques: [
    {
      titulo: 'Calentamiento',
      estructural: true,
      items: [
        { nombre: 'BikeErg', dosis: '5:00', objetivo: 'RPE 3', modalidad: 'bike' },
        { nombre: 'Leg Swings', dosis: '10 reps', series: 2, modalidad: 'mobility' },
        { nombre: 'Thoracic Rotation', dosis: '10 reps', series: 2, modalidad: 'mobility' },
        { nombre: 'Air Squat', dosis: '15 reps', objetivo: 'peso corporal', series: 2, modalidad: 'functional' },
      ],
    },
    {
      titulo: 'Simulación HYROX',
      formato: 'For Time · 16 estaciones',
      items: [
        RUN_1K,
        { nombre: 'SkiErg', dosis: '1.000 m', modalidad: 'ski' },
        RUN_1K,
        { nombre: 'Sled Push', dosis: '50 m', objetivo: '152 kg', modalidad: 'functional' },
        RUN_1K,
        { nombre: 'Sled Pull', dosis: '50 m', objetivo: '103 kg', modalidad: 'functional' },
        RUN_1K,
        { nombre: 'Burpee Broad Jump', dosis: '80 m', modalidad: 'functional' },
        RUN_1K,
        { nombre: 'Rowing', dosis: '1.000 m', modalidad: 'row' },
        RUN_1K,
        { nombre: 'Farmers Carry', dosis: '200 m', objetivo: '24 kg', modalidad: 'functional' },
        RUN_1K,
        { nombre: 'Sandbag Lunges', dosis: '100 m', objetivo: '20 kg', modalidad: 'functional' },
        RUN_1K,
        { nombre: 'Wall Balls', dosis: '100 reps', objetivo: '6 kg', modalidad: 'functional' },
      ],
    },
    {
      titulo: 'Vuelta a la calma',
      estructural: true,
      items: [
        { nombre: 'BikeErg', dosis: '5:00', objetivo: 'RPE 2', modalidad: 'bike' },
        { nombre: 'Foam roll lower body', dosis: '5:00', modalidad: 'mobility' },
        { nombre: 'Breathing Work', dosis: '3:00', modalidad: 'mobility' },
      ],
    },
  ],
};

/** `templates` 442 · asignación 240 · 11 segmentos en 3 bloques. El caso típico del plan. */
export const CIRCUITO_PIERNA: SesionReal = {
  procedencia: 'plantilla 442 · asignación 240 · atleta 67',
  titulo: 'Fuerza · circuito de pierna',
  origen: 'coach',
  bloques: [
    {
      titulo: 'Calentamiento',
      estructural: true,
      items: [
        { nombre: 'BikeErg', dosis: '5:00', objetivo: 'RPE 3', modalidad: 'bike' },
        { nombre: 'Leg Swings', dosis: '10 reps', series: 2, modalidad: 'mobility' },
        { nombre: 'Air Squat', dosis: '15 reps', objetivo: 'peso corporal', series: 2, modalidad: 'functional' },
      ],
    },
    {
      titulo: 'Principal',
      items: [
        { nombre: 'Back Squat', dosis: '5 reps', objetivo: '100 kg', descansoS: 90, series: 4, modalidad: 'strength' },
        { nombre: 'Sandbag Lunges', dosis: '100 m', objetivo: '20 kg', modalidad: 'functional' },
        { nombre: 'Wall Balls', dosis: '100 reps', objetivo: '6 kg', modalidad: 'functional' },
      ],
    },
    {
      titulo: 'Vuelta a la calma',
      estructural: true,
      items: [
        { nombre: 'Foam roll lower body', dosis: '5:00', modalidad: 'mobility' },
        { nombre: 'Breathing Work', dosis: '3:00', modalidad: 'mobility' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// LO QUE SE MIDIÓ DE VERDAD — el reparto que decide el post-entreno
// ---------------------------------------------------------------------------

/** El reparto de cobertura de toda la base, para poder citarlo en la ficha. */
export const COBERTURA = {
  segmentos: 206,
  conFc: 181,
  conZonas: 9,
  /** De los 9, ocho son del atleta 64. */
  atletasConZonas: 2,
} as const;

export interface MedidoReal {
  /** `workout_executions.total_duration_seconds`. */
  duracionS: number;
  /** `segment_executions.avg_hr` promediado. Nulo = nadie lo midió. */
  fcMediaPpm: number | null;
  fcMaxPpm: number | null;
  /** `raw_lap_data_json.zone_seconds`. Vacío = no hay zonas que pintar. */
  zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>>;
  /** `workout_executions.perceived_exertion`. Nunca se siembra (§7). */
  rpe: number | null;
  fuente: 'live' | 'imported' | 'manual';
}

/** Ejecución 167 · asignación 352 · Remo 500 m. Sin FC, sin zonas: el caso normal. */
export const MEDIDO_REMO: MedidoReal = {
  duracionS: 37,
  fcMediaPpm: null,
  fcMaxPpm: null,
  zonasS: {},
  rpe: null,
  fuente: 'live',
};

/** Ejecución 103 · asignación 297 · circuito de pierna. FC sí, zonas no (181 de 206). */
export const MEDIDO_CIRCUITO: MedidoReal = {
  duracionS: 3120,
  fcMediaPpm: 138,
  fcMaxPpm: 171,
  zonasS: {},
  rpe: null,
  fuente: 'live',
};

/**
 * Ejecución 162 · asignación 349 · Back Squat. El caso RARO — una de las 9
 * filas con zonas de toda la base.
 *
 * Ojo al dato: z1 236 s + z2 246 s = 482 s sobre una sesión de 572 s. Las
 * zonas cubren el 84 %, no el 100 %, y eso hay que decirlo.
 */
export const MEDIDO_SQUAT: MedidoReal = {
  duracionS: 572,
  fcMediaPpm: 95,
  fcMaxPpm: 122,
  zonasS: { z1: 236, z2: 246 },
  rpe: null,
  fuente: 'live',
};

/**
 * El ancla de las zonas. HOY, en toda la base, es SIEMPRE estimada: ninguna
 * pantalla escribe un `lthr_bpm` medido (docs/DECISIONS.md, 28-jul). Sin ancla
 * no hay zonas, y con ancla estimada la etiqueta viaja marcada hasta el coach.
 */
export const UMBRAL = { ppm: 162, estimado: true } as const;

// ---------------------------------------------------------------------------
// Utilidades de lectura — un formateador por concepto (CONTRATO-UI §2)
// ---------------------------------------------------------------------------

/** `MarkFormat.clock` — 5:00, sin cero delante; 1:02:30 cuando pasa de la hora. */
export function reloj(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dosDigitos(m)}:${dosDigitos(r)}` : `${m}:${dosDigitos(r)}`;
}

/** Coma española (`esDecimal`) — jamás un punto de cara al atleta. */
export function esDecimal(valor: number, decimales = 1): string {
  return valor.toFixed(decimales).replace('.', ',');
}

/** El punto de modalidad (`ModalityDot`) — el color, no un Circle() a mano. */
export const COLOR_MODALIDAD: Record<Modalidad, string> = {
  run: 'var(--twin-modality-hyrox)',
  row: 'var(--twin-modality-support)',
  ski: 'var(--twin-modality-support)',
  bike: 'var(--twin-modality-support)',
  strength: 'var(--twin-modality-strength)',
  functional: 'var(--twin-modality-functional)',
  mobility: 'var(--twin-modality-support)',
};

/** Cuenta los ítems de una sesión — el número que decide si desborda. */
export function totalItems(s: SesionReal): number {
  return s.bloques.reduce((n, b) => n + b.items.length, 0);
}
