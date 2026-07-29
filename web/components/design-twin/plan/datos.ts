// Los escenarios del plan, medidos contra producción el 29-jul-2026.
//
// Nada de aquí está inventado, y lo poco que está COMPUESTO lo dice en su
// `procedencia`. Un mockup que enseña un número que la app no puede saber es un
// mockup que miente (CONTRATO-UI §7), y esta tanda va justo de eso.
//
// Este fichero añade la ESTRUCTURA DE CALENDARIO que `datos-reales.ts` no
// modela a propósito (ese fichero modela SESIONES; este, en qué día caen, en qué
// semana y dentro de qué microciclo). Es el mismo reparto que ya hizo
// `screens/plan-bloque/data.ts`, y por eso las sesiones se importan de allí en
// vez de volver a escribirlas.
//
// ---------------------------------------------------------------------------
// LOS SEIS HECHOS DE PRODUCCIÓN QUE MANDAN SOBRE ESTE DISEÑO
// ---------------------------------------------------------------------------
//
//  1. **No existe UNA SOLA asignación futura en toda la base.** El máximo
//     `scheduled_for` de cada atleta: 63→17-jul, 69→13-jul, 66→24-jul,
//     67→24-jul, 64 y 72→28-jul. Hoy es 29-jul. Es decir: el caso «tu plan se
//     acabó y no hay siguiente» no es un borde, es el estado de TODOS.
//
//  2. **`athlete_sequence_progress` está vacía** (0 filas) y de las tres
//     `program_sequences` que hay, dos no tienen ni un ítem. La maquinaria de
//     secuencias existe en el esquema y no la camina nadie.
//
//  3. **No existe la entidad «fase»** — la migración 0064 borró
//     `methodology_phases` y su `phase_id` de las cuatro tablas que lo tenían.
//     La etiqueta de un tramo es `program_month_templates.name` escrito por el
//     coach: «Acumulación», «Base 1», «Testing». El sistema no bautiza nada.
//
//  4. **La duración prevista casi nunca se puede calcular.** De las ocho
//     sesiones de la semana real del atleta 67, solo TRES traen dosis suficiente
//     para estimar cuánto duran. Las otras cinco o no llevan dosis en su bloque
//     de trabajo (el hueco conocido del método) o son `for_time`, donde la
//     duración ES el resultado y por definición no está prescrita.
//
//  5. **La cadencia de tests del coach SÍ materializa asignaciones.** Verificado:
//     `coach_test_schedule` del coach 60 coloca `one_rm_battery` en la semana 1,
//     martes; y las asignaciones 342/343 del atleta 64 son «Batería 1RM» con
//     `calibration_test_id = 3` un martes. La cadena cadencia → asignación está
//     probada, así que un test marcado en un tramo futuro es estructura decidida.
//
//  6. **La voz del coach existe y es corta.** `program_week_templates.focus` del
//     coach 62: «Subir volumen aeróbico y técnica de estaciones» y «Más volumen
//     y ritmo en las estaciones». Se pinta tal cual. Los demás coaches lo tienen
//     vacío, y entonces no hay línea: el sistema no escribe por el coach.

import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  HYROX,
  REMO_500,
  type ItemReal,
  type SesionReal,
} from '../datos-reales';
import type { Ciclo, Dia, Semana, Trabajo } from './modelo';

// ---------------------------------------------------------------------------
// Las sesiones que faltaban — copiadas fila a fila de `template_segments`
// ---------------------------------------------------------------------------

/** El calentamiento que el coach 62 repite en TODAS sus sesiones de carrera. */
const CALENTAMIENTO_CARRERA: ItemReal[] = [
  { nombre: 'Run', dosis: '8:00', objetivo: 'RPE 3', modalidad: 'run' },
  { nombre: 'Run Technique Drills', dosis: '40s', series: 3, modalidad: 'run' },
  { nombre: 'Leg Swings', dosis: '10 reps', series: 2, modalidad: 'mobility' },
  { nombre: 'Run', dosis: '80 m', objetivo: 'RPE 7', series: 4, descansoS: 60, modalidad: 'run' },
];

/** La vuelta a la calma que el coach 62 repite en TODAS sus sesiones. */
const VUELTA_CALMA: ItemReal[] = [
  { nombre: 'BikeErg', dosis: '5:00', objetivo: 'RPE 2', modalidad: 'bike' },
  { nombre: 'Foam roll lower body', dosis: '5:00', modalidad: 'mobility' },
  { nombre: 'Breathing Work', dosis: '3:00', modalidad: 'mobility' },
];

/** `templates` 438 · asignación 236 · atleta 67. */
export const SERIES_CARRERA: SesionReal = {
  procedencia: 'plantilla 438 · asignación 236 · atleta 67',
  titulo: 'Series de carrera',
  origen: 'coach',
  bloques: [
    { titulo: 'Calentamiento', estructural: true, items: CALENTAMIENTO_CARRERA },
    {
      titulo: 'Series de carrera',
      formato: '5 rondas · 5:00 cada una',
      items: [{ nombre: 'Run', dosis: '5:00', objetivo: 'Z4', series: 5, modalidad: 'run' }],
    },
    { titulo: 'Vuelta a la calma', estructural: true, items: VUELTA_CALMA },
  ],
};

/** `templates` 443 · asignación 241 · atleta 67. Igual que la 438 con 3 rondas y sin zona. */
export const SERIES_UMBRAL: SesionReal = {
  procedencia: 'plantilla 443 · asignación 241 · atleta 67',
  titulo: 'Series umbral',
  origen: 'coach',
  bloques: [
    { titulo: 'Calentamiento', estructural: true, items: CALENTAMIENTO_CARRERA },
    {
      titulo: 'Series de carrera',
      formato: '3 rondas · 5:00 cada una',
      // Sin objetivo: la plantilla 443 no escribe zona, al revés que la 438.
      // Se pinta sin él en vez de heredarlo de la sesión de al lado.
      items: [{ nombre: 'Run', dosis: '5:00', series: 3, modalidad: 'run' }],
    },
    { titulo: 'Vuelta a la calma', estructural: true, items: VUELTA_CALMA },
  ],
};

/** `templates` 440 · asignación 238 · atleta 67. Cuatro máquinas, diez minutos cada una. */
export const RODAJE_Z2: SesionReal = {
  procedencia: 'plantilla 440 · asignación 238 · atleta 67',
  titulo: 'Rodaje Z2',
  origen: 'coach',
  bloques: [
    { titulo: 'Calentamiento', estructural: true, items: CALENTAMIENTO_CARRERA },
    {
      titulo: 'Recuperación Z2',
      items: [
        { nombre: 'Rowing', dosis: '10:00', objetivo: 'Z2', modalidad: 'row' },
        { nombre: 'SkiErg', dosis: '10:00', objetivo: 'Z2', modalidad: 'ski' },
        { nombre: 'Assault Bike', dosis: '10:00', objetivo: 'Z2', modalidad: 'bike' },
        { nombre: 'Run', dosis: '10:00', objetivo: 'Z2', modalidad: 'run' },
      ],
    },
    { titulo: 'Vuelta a la calma', estructural: true, items: VUELTA_CALMA },
  ],
};

/**
 * `templates` 439 · asignación 237 · atleta 67. **El bloque de trabajo llega
 * VACÍO**: `Wall Balls` trae un peso y ninguna medida, y `Run` trae
 * `{"scheme":"sets"}` y nada más. Se pinta con el nombre solo (§7).
 */
export const METCON: SesionReal = {
  procedencia: 'plantilla 439 · asignación 237 · atleta 67',
  titulo: 'Metcon',
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
      titulo: 'Metcon',
      items: [
        { nombre: 'Wall Balls', dosis: null, objetivo: '6 kg', modalidad: 'functional' },
        { nombre: 'Run', dosis: null, modalidad: 'run' },
      ],
    },
    { titulo: 'Vuelta a la calma', estructural: true, items: VUELTA_CALMA },
  ],
};

/** `templates` 450 · asignación 245 · atleta 67. Un bloque, un ítem: 8 km en Z3. */
export const TEMPO_CONTINUO: SesionReal = {
  procedencia: 'plantilla 450 · asignación 245 · atleta 67',
  titulo: 'Tempo continuo',
  origen: 'coach',
  bloques: [
    { titulo: 'Tempo continuo', items: [{ nombre: 'Run', dosis: '8,00 km', objetivo: 'Z3', modalidad: 'run' }] },
  ],
};

/**
 * `templates` 465 · asignación 295 · atleta 67. Ojo al bloque del medio: el
 * título dice «8 × 500 m» y `template_segments` solo tiene UN ítem. Así está en
 * producción; no se multiplica por ocho para que cuadre.
 */
export const REMO_INTERVALOS: SesionReal = {
  procedencia: 'plantilla 465 · asignación 295 · atleta 67',
  titulo: 'Remo Concept2 · Intervalos',
  origen: 'coach',
  bloques: [
    {
      titulo: 'Calentamiento',
      estructural: true,
      items: [{ nombre: 'Rowing', dosis: '1,00 km', objetivo: 'Z1', modalidad: 'row' }],
    },
    {
      titulo: '8 × 500 m',
      items: [{ nombre: 'Rowing', dosis: '500 m', objetivo: '1:55/500m', modalidad: 'row' }],
    },
    {
      titulo: 'Vuelta a la calma',
      estructural: true,
      items: [{ nombre: 'Rowing', dosis: '750 m', objetivo: 'Z1', modalidad: 'row' }],
    },
  ],
};

/** `templates` 504 · asignación 356 · atleta 64. Libre. */
export const SKI_400: SesionReal = {
  procedencia: 'plantilla 504 · asignación 356 · atleta 64',
  titulo: 'Ski-Erg · 400 m',
  origen: 'libre',
  bloques: [
    { titulo: 'Ski-Erg · 400 m', items: [{ nombre: 'SkiErg', dosis: '400 m', objetivo: '2:05/500m', modalidad: 'ski' }] },
  ],
};

/** `templates` 505 · asignación 357 · atleta 64. Libre. */
export const CORRER_1K: SesionReal = {
  procedencia: 'plantilla 505 · asignación 357 · atleta 64',
  titulo: 'Correr · 1 km',
  origen: 'libre',
  bloques: [
    { titulo: 'Correr · 1 km', items: [{ nombre: 'Run', dosis: '1,00 km', objetivo: '6:00/km', modalidad: 'run' }] },
  ],
};

/** `templates` 506 · asignación 358 · atleta 64. Libre, EMOM 20 × 45/15. */
export const EMOM_SKI_BICI: SesionReal = {
  procedencia: 'plantilla 506 · asignación 358 · atleta 64',
  titulo: 'EMOM · 2 movimientos',
  origen: 'libre',
  bloques: [
    {
      titulo: 'EMOM · 2 movimientos',
      formato: '20 rondas · 45s trabajo / 15s cambio',
      items: [
        { nombre: 'SkiErg', dosis: '45s', modalidad: 'ski' },
        { nombre: 'Assault Bike', dosis: '45s', modalidad: 'bike' },
      ],
    },
  ],
};

/** `templates` 507 · asignación 359 · atleta 64. Libre, 5×500 con 2:00 de descanso. */
export const REMO_5X500: SesionReal = {
  procedencia: 'plantilla 507 · asignación 359 · atleta 64',
  titulo: 'Remo · 5×500 m',
  origen: 'libre',
  bloques: [
    {
      titulo: 'Remo · 5×500 m',
      formato: '5 rondas',
      items: [
        { nombre: 'Rowing', dosis: '500 m', objetivo: '1:55/500m', series: 5, descansoS: 120, modalidad: 'row' },
      ],
    },
  ],
};

/**
 * `templates` 490 · asignación 342 · atleta 64. El TEST de calibración del
 * coach (`calibration_test_id = 3`, `coach_calibration_tests.slug =
 * 'one_rm_battery'`).
 *
 * Su `prescription_json` es **NULL en los tres ítems**: un test de 1RM no lleva
 * dosis prescrita, porque el número que busca es justo el que no se sabe. Se
 * pinta con el nombre solo, que es lo correcto y no un hueco que tapar.
 */
export const BATERIA_1RM: SesionReal = {
  procedencia: 'plantilla 490 · asignación 342 · atleta 64',
  titulo: 'Batería 1RM',
  origen: 'coach',
  bloques: [
    {
      titulo: 'Batería 1RM',
      items: [
        { nombre: 'Back Squat', dosis: null, modalidad: 'strength' },
        { nombre: 'Deadlift', dosis: null, modalidad: 'strength' },
        { nombre: 'Bench Press', dosis: null, modalidad: 'strength' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// La duración prevista — solo cuando la prescripción la deja calcular
// ---------------------------------------------------------------------------
//
// Estos tres números salen de sumar los tiempos ESCRITOS en `prescription_json`
// (`total_s`, `work_s` × `rounds`, `rest_s` × `rounds`, `duration.seconds`). Lo
// que no tiene tiempo escrito no suma, y una sesión cuyo bloque de trabajo no
// tiene ninguno no tiene estimación: es `null`, no un número redondo.
//
//   Series de carrera (438): 480 + 3×40 + 4×(≈20 + 60) + 5×300 + 780 = 3.200 s
//   Series umbral     (443): 480 + 3×40 + 4×(≈20 + 60) + 3×300 + 780 = 2.600 s
//   Rodaje Z2         (440): 480 + 3×40 + 4×(≈20 + 60) + 4×600 + 780 = 4.100 s
//
// Y las que NO se pueden estimar, con su razón:
//
//   Fuerza de pierna  (437): 4 series con %RM pero SIN descanso escrito.
//   Metcon            (439): el bloque de trabajo llega sin ninguna medida.
//   Simulación HYROX  (441): es `for_time` — la duración ES el resultado.
//   Circuito de pierna(442): cuatro de sus ítems de trabajo llegan vacíos.
//   Tempo continuo    (450): 8 km sin ritmo objetivo; estimarlo sería inventarlo.
//   Remo intervalos   (465): el calentamiento va por distancia y sin ritmo.
const PREVISTO_MIN: Record<string, number> = {
  'Series de carrera': 53,
  'Series umbral': 43,
  'Rodaje Z2': 68,
};

function previstoDe(sesion: SesionReal): number | null {
  return PREVISTO_MIN[sesion.titulo] ?? null;
}

// ---------------------------------------------------------------------------
// El calendario
// ---------------------------------------------------------------------------

const NOMBRES: ReadonlyArray<{ inicial: string; nombre: string }> = [
  { inicial: 'L', nombre: 'lunes' },
  { inicial: 'M', nombre: 'martes' },
  { inicial: 'X', nombre: 'miércoles' },
  { inicial: 'J', nombre: 'jueves' },
  { inicial: 'V', nombre: 'viernes' },
  { inicial: 'S', nombre: 'sábado' },
  { inicial: 'D', nombre: 'domingo' },
];

/** Los minutos que de verdad duró una ejecución, redondeados a minuto. */
function medidos(duracionS: number): number {
  return Math.max(1, Math.round(duracionS / 60));
}

interface TrabajoInput {
  sesion: SesionReal;
  modalidades: Trabajo['modalidades'];
  /** `workout_executions.total_duration_seconds`. Ausente = no hay ejecución. */
  ejecucionS?: number;
  esTest?: boolean;
}

function trabajo({ sesion, modalidades, ejecucionS, esTest = false }: TrabajoInput): Trabajo {
  return {
    titulo: sesion.titulo,
    origen: sesion.origen,
    esTest,
    modalidades,
    ref: sesion,
    medidoMin: ejecucionS === undefined ? null : medidos(ejecucionS),
    previstoMin: previstoDe(sesion),
  };
}

function dia(indice: number, numero: number, trabajos: Trabajo[] = []): Dia {
  return { ...NOMBRES[indice], numero, trabajos };
}

// ---------------------------------------------------------------------------
// LA SEMANA REAL DEL ATLETA 67 — 13 al 19 de julio, microciclo 71
// ---------------------------------------------------------------------------
//
// Ocho asignaciones en seis días, con sus ejecuciones tal y como están:
//
//   L 13 · Fuerza de pierna    (asig. 235) · ejec. 57  =    960 s
//   L 13 · Tempo continuo      (asig. 245) · ejec. 38  =  2.174 s
//   M 14 · Series de carrera   (asig. 236) · SIN ejecución
//   X 15 · Fuerza · circuito   (asig. 297) · ejec. 103 =  3.120 s
//   X 15 · Metcon              (asig. 237) · ejec. 64  =    120 s
//   J 16 · Rodaje Z2           (asig. 238) · SIN ejecución  ← hoy
//   V 17 · Simulación HYROX    (asig. 239) · ejec. 66  =    935 s
//   S 18 · nada en el plan
//   D 19 · Remo Concept2       (asig. 295) · ejec. 101 =  2.460 s
//
// Hoy cae en JUEVES a propósito: es el único día de la semana que enseña a la
// vez días cerrados, un día saltado, el de hoy y los que quedan. Con hoy en
// lunes la mitad de los estados no existirían.

/** La sesión 437 del coach — no está en `datos-reales.ts`, así que va aquí. */
const FUERZA_PIERNA: SesionReal = {
  procedencia: 'plantilla 437 · asignación 235 · atleta 67',
  titulo: 'Fuerza de pierna',
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
      titulo: 'Fuerza',
      items: [
        // 10/8/8/6 con el objetivo en % de tu máximo. El descanso no está
        // escrito, y por eso la sesión no tiene duración estimable.
        { nombre: 'Back Squat', dosis: '10/8/8/6', objetivo: '65-80 % de tu máximo', series: 4, modalidad: 'strength' },
        // Cuatro series y ninguna carga: el coach no la escribió.
        { nombre: 'Front Squat', dosis: '8/8/6/4', series: 4, modalidad: 'strength' },
      ],
    },
    { titulo: 'Vuelta a la calma', estructural: true, items: VUELTA_CALMA },
  ],
};

function semanaDelSesentaYSiete(): Semana {
  return {
    indiceHoy: 3,
    intencion: 'Subir volumen aeróbico y técnica de estaciones',
    enTramo: { nombre: 'Acumulación', semana: 1, de: 2 },
    dias: [
      dia(0, 13, [
        trabajo({ sesion: FUERZA_PIERNA, modalidades: ['strength'], ejecucionS: 960 }),
        trabajo({ sesion: TEMPO_CONTINUO, modalidades: ['run'], ejecucionS: 2174 }),
      ]),
      dia(1, 14, [trabajo({ sesion: SERIES_CARRERA, modalidades: ['run'] })]),
      dia(2, 15, [
        trabajo({ sesion: CIRCUITO_PIERNA, modalidades: ['strength', 'functional'], ejecucionS: 3120 }),
        trabajo({ sesion: METCON, modalidades: ['functional', 'run'], ejecucionS: 120 }),
      ]),
      dia(3, 16, [trabajo({ sesion: RODAJE_Z2, modalidades: ['run', 'row'] })]),
      dia(4, 17, [trabajo({ sesion: HYROX, modalidades: ['run', 'functional'], ejecucionS: 935 })]),
      dia(5, 18),
      dia(6, 19, [trabajo({ sesion: REMO_INTERVALOS, modalidades: ['row'], ejecucionS: 2460 })]),
    ],
  };
}

/**
 * La semana en la que el atleta 67 está HOY (27 de julio - 2 de agosto).
 *
 * Está vacía, y no es un supuesto: su microciclo «Acumulación» acabó el 26-jul y
 * **no hay ni una asignación posterior a hoy en toda la base**. Es el caso más
 * probable de la app real, no el borde.
 */
function semanaSinPublicar(): Semana {
  return {
    indiceHoy: 2,
    intencion: null,
    enTramo: null,
    dias: [dia(0, 27), dia(1, 28), dia(2, 29), dia(3, 30), dia(4, 31), dia(5, 1), dia(6, 2)],
  };
}

/** El atleta recién dado de alta (68): sin plan, sin historial, sin nada. */
function semanaDeAltaNueva(): Semana {
  return {
    indiceHoy: 2,
    intencion: null,
    enTramo: null,
    dias: [dia(0, 27), dia(1, 28), dia(2, 29), dia(3, 30), dia(4, 31), dia(5, 1), dia(6, 2)],
  };
}

/**
 * La semana del atleta de entreno libre (64), del 27-jul al 2-ago.
 *
 * Seis asignaciones reales en dos días, cinco de ellas `origin='self'`. Es la
 * otra mitad del producto: la semana no la llena el coach, la llena el atleta,
 * y la vista tiene que enseñar las dos cosas sin tratar la libre como un anexo.
 *
 *   L 27 · Fuerza · Back Squat (asig. 349, libre)  · ejec. 162 = 572 s
 *   L 27 · Remo 500 m          (asig. 352, libre)  · ejec. 167 =  37 s
 *   L 27 · Batería 1RM         (asig. 343, TEST)   · ejec. 153 = 681 s
 *   M 28 · Ski-Erg 400 m       (asig. 356, libre)  · ejec. 173 = 121 s
 *   M 28 · Correr 1 km         (asig. 357, libre)  · ejec. 175 = 361 s
 *   M 28 · EMOM 2 movimientos  (asig. 358, libre)  · ejec. 177 = 652 s
 *   M 28 · Remo 5×500 m        (asig. 359, libre)  · ejec. 179 = 392 s
 *   M 28 · Batería 1RM         (asig. 342, TEST)   · SIN ejecución
 */
function semanaLibre(): Semana {
  return {
    indiceHoy: 2,
    intencion: null,
    enTramo: null,
    dias: [
      dia(0, 27, [
        trabajo({ sesion: BATERIA_1RM, modalidades: ['strength'], esTest: true, ejecucionS: 681 }),
        trabajo({ sesion: BACK_SQUAT, modalidades: ['strength'], ejecucionS: 572 }),
        trabajo({ sesion: REMO_500, modalidades: ['row'], ejecucionS: 37 }),
      ]),
      dia(1, 28, [
        trabajo({ sesion: BATERIA_1RM, modalidades: ['strength'], esTest: true }),
        trabajo({ sesion: SKI_400, modalidades: ['ski'], ejecucionS: 121 }),
        trabajo({ sesion: CORRER_1K, modalidades: ['run'], ejecucionS: 361 }),
        trabajo({ sesion: EMOM_SKI_BICI, modalidades: ['ski', 'bike'], ejecucionS: 652 }),
        trabajo({ sesion: REMO_5X500, modalidades: ['row'], ejecucionS: 392 }),
      ]),
      dia(2, 29),
      dia(3, 30),
      dia(4, 31),
      dia(5, 1),
      dia(6, 2),
    ],
  };
}

// ---------------------------------------------------------------------------
// LOS CICLOS
// ---------------------------------------------------------------------------

/** La carrera objetivo del atleta 67: `races` 29, 11-nov-2026, objetivo 0:59:00. */
const CARRERA_67 = { nombre: 'HYROX Barcelona', enDias: 105, objetivoS: 3540 };
/** La del atleta 64: `races` 46, 11-nov-2026, objetivo 1:10:00. */
const CARRERA_64 = { nombre: 'HYROX Barcelona', enDias: 105, objetivoS: 4200 };

/**
 * El ciclo REAL del atleta 67 mientras lo vivía: un solo microciclo publicado.
 *
 * `athlete_month_assignments` 41 → `program_month_templates` 73 «Acumulación»,
 * nivel N3 «Rendimiento», 13→26 de julio, `microcycle_ids = {71,72}`.
 *
 * `alAcabar` es **null a propósito**: el coach 62 no tiene ninguna
 * `program_sequence`, así que no se sabe qué viene después de este microciclo y
 * la pantalla lo dice en vez de suponerlo.
 *
 * Sin hitos dentro del tramo: la cadencia de tests del coach 62 existe y está
 * activa (`coach_test_schedule` 13-16), pero **no llegó a materializar ninguna
 * asignación** para este atleta. Pintar esos cuatro tests sería enseñar algo que
 * no ocurrió.
 */
const CICLO_67_DENTRO: Ciclo = {
  tramos: [{ nombre: 'Acumulación', semanas: 2, nivel: 'Rendimiento', hitos: [] }],
  indiceActual: 0,
  semanaEnTramo: 1,
  alAcabar: null,
  carrera: CARRERA_67,
  procedencia: 'asignación 41 · plantilla mensual 73 · atleta 67 · leído el 16-jul',
};

/**
 * El mismo atleta 67 HOY (29-jul). Su microciclo acabó el 26 y no hay siguiente.
 * `indiceActual = -1`: hoy no cae dentro de ningún tramo. Verificado: cero
 * asignaciones posteriores a hoy en toda la base.
 */
const CICLO_67_ACABADO: Ciclo = {
  tramos: [{ nombre: 'Acumulación', semanas: 2, nivel: 'Rendimiento', hitos: [] }],
  indiceActual: -1,
  semanaEnTramo: null,
  alAcabar: null,
  carrera: CARRERA_67,
  procedencia: 'asignación 41 · atleta 67 · acabó el 26-jul; 0 asignaciones futuras en toda la base',
};

/** El atleta 68, recién dado de alta: 0 asignaciones, 0 microciclos, 0 carreras. */
const CICLO_VACIO: Ciclo = {
  tramos: [],
  indiceActual: -1,
  semanaEnTramo: null,
  alAcabar: null,
  carrera: null,
  procedencia: 'atleta 68 · 0 filas en workout_assignments, microcycles y races',
};

/**
 * EL CASO LLENO — la secuencia del coach 60 con sus tres microciclos reales.
 *
 * Es el único escenario COMPUESTO de esta tanda, y se declara: la secuencia 29
 * existe de verdad (coach 60, nivel N3, 6 días/semana, `end_policy = 'repeat'`)
 * pero **no tiene ni un `program_sequence_item`**, así que el enlace secuencia →
 * microciclos y el cursor de hoy son la composición. Todo lo demás es producción:
 *
 *   · Los tres microciclos son sus tres `program_month_templates` reales:
 *     «Primer mes» (69), «Base 1» (68) y «Testing» (72), de cuatro semanas cada
 *     uno y nivel N3 «Rendimiento». Los nombres son SUYOS; el sistema no
 *     bautiza fases (migración 0064).
 *   · Los cuatro hitos del tramo «Testing» son su `coach_test_schedule` real:
 *     Batería 1RM (semana 1, martes), 5K control (semana 1, miércoles), Remo 2K
 *     (semana 1, viernes) y HYROX half-sim (semana 1, sábado). Van SIN fecha
 *     porque todavía no la tienen: se enseña la posición, que es lo que se sabe.
 *   · El hito con fecha es el test que SÍ está materializado: la asignación 342
 *     del atleta 64, «Batería 1RM» con `calibration_test_id = 3`, del 28-jul.
 *   · La carrera es la suya de verdad: `races` 46, 11-nov-2026.
 */
const CICLO_SECUENCIA: Ciclo = {
  tramos: [
    { nombre: 'Primer mes', semanas: 4, nivel: 'Rendimiento', hitos: [] },
    {
      nombre: 'Base 1',
      semanas: 4,
      nivel: 'Rendimiento',
      hitos: [
        { clase: 'test', nombre: 'Batería 1RM', enDias: 1, semanaDelTramo: null, diaInicial: null },
      ],
    },
    {
      nombre: 'Testing',
      semanas: 4,
      nivel: 'Rendimiento',
      hitos: [
        { clase: 'test', nombre: 'Batería 1RM', enDias: null, semanaDelTramo: 1, diaInicial: 'M' },
        { clase: 'test', nombre: '5K control', enDias: null, semanaDelTramo: 1, diaInicial: 'X' },
        { clase: 'test', nombre: 'Remo 2K', enDias: null, semanaDelTramo: 1, diaInicial: 'V' },
        { clase: 'test', nombre: 'HYROX half-sim', enDias: null, semanaDelTramo: 1, diaInicial: 'S' },
      ],
    },
  ],
  indiceActual: 1,
  semanaEnTramo: 2,
  alAcabar: 'repite',
  carrera: CARRERA_64,
  procedencia:
    'COMPUESTO — secuencia 29 (coach 60, N3, 6 días, repite) + sus 3 plantillas mensuales reales (69, 68, 72) + su coach_test_schedule + races 46. El enlace secuencia→ítems y el cursor no existen en producción (0 filas en program_sequence_items y en athlete_sequence_progress)',
};

// ---------------------------------------------------------------------------
// Los escenarios — el mínimo PRIMERO (§6.3)
// ---------------------------------------------------------------------------

export interface EscenarioPlan {
  ciclo: Ciclo;
  semana: Semana;
  /** Qué día abre la vista de día, 0-6. */
  diaAbierto: number;
  /** El nombre del atleta, para el registro del panel. No se pinta. */
  quien: string;
}

const ESCENARIOS: Record<string, EscenarioPlan> = {
  // 1 · El caso de diseño (§6.3): el atleta que acaba de darse de alta. Nunca
  //     ha tenido plan, así que tampoco tiene de qué venir.
  'alta-nueva': { ciclo: CICLO_VACIO, semana: semanaDeAltaNueva(), diaAbierto: 2, quien: 'atleta 68' },
  // 2 · El caso de HOY en producción: el plan se acabó y no hay siguiente. Es
  //     el mismo vacío que el anterior con una diferencia que cambia la salida:
  //     este atleta SÍ tiene de dónde venir.
  'sin-publicar': { ciclo: CICLO_67_ACABADO, semana: semanaSinPublicar(), diaAbierto: 2, quien: 'atleta 67' },
  // 3 · El típico. El día abierto es el jueves: hoy, pendiente, una sola sesión.
  coach: { ciclo: CICLO_67_DENTRO, semana: semanaDelSesentaYSiete(), diaAbierto: 3, quien: 'atleta 67' },
  // 4 · El día que revienta: viernes 17, Simulación HYROX, 23 movimientos con
  //     16 estaciones seguidas. El único bloque que desborda de toda la base.
  'dia-lleno': { ciclo: CICLO_67_DENTRO, semana: semanaDelSesentaYSiete(), diaAbierto: 4, quien: 'atleta 67' },
  // 5 · El día con huecos: miércoles 15, dos trabajos y los dos con dosis que
  //     el coach no escribió (el circuito de pierna y el Metcon vacío).
  'sin-dosis': { ciclo: CICLO_67_DENTRO, semana: semanaDelSesentaYSiete(), diaAbierto: 2, quien: 'atleta 67' },
  // 6 · La semana del atleta libre: cinco cosas el martes, cuatro suyas.
  libre: { ciclo: CICLO_SECUENCIA, semana: semanaLibre(), diaAbierto: 1, quien: 'atleta 64' },
  // 7 · El ciclo lleno: la secuencia entera con sus hitos.
  secuencia: { ciclo: CICLO_SECUENCIA, semana: semanaLibre(), diaAbierto: 1, quien: 'atleta 64' },
};

export function escenarioPlan(id: string): EscenarioPlan {
  return Object.prototype.hasOwnProperty.call(ESCENARIOS, id) ? ESCENARIOS[id] : ESCENARIOS['alta-nueva'];
}
