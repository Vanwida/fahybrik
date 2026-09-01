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

/** Cómo se hace una recuperación — `RunRecoveryMode` (Plan/RunStructure.swift). */
export type ModoRecuperacion = 'trote' | 'caminar' | 'parado';

/** La parte de la sesión a la que pertenece el tramo — `RunPhaseRole`. */
export type FaseCarrera = 'calentamiento' | 'principal' | 'vuelta';

/**
 * UN TRAMO de una carrera estructurada — `RunLeg` visto por el doble.
 *
 * La gramática de correr (#61) es un árbol de fases con su repetición, y cada
 * tramo lleva SU medida, SU objetivo y —si es recuperación— SU modo. Aplanarla a
 * «un set + un `rest_s`» miente dos veces: pierde el ×16 (un 16×500 se lee «500
 * m») y llama «descanso» a un minuto que se corre al trote.
 */
export interface TramoCarrera {
  tipo: 'trabajo' | 'recuperacion';
  /** Metros, cuando el tramo se mide por distancia. */
  metros?: number;
  /** Segundos, cuando se mide por tiempo. */
  segundos?: number;
  /**
   * La ZONA del tramo (`RunLeg.zoneLabel`) — el único objetivo que además NOMBRA
   * la recuperación: «recuperación 1:00 suave **en Z2**».
   */
  zona?: number;
  /**
   * Cualquier otro objetivo, ya escrito como lo escribe la app: «@ 4:35/km»,
   * «RPE 8». Excluyente con `zona` (un tramo tiene UN objetivo).
   */
  objetivo?: string;
  /** Solo en una recuperación. Ausente = el coach no lo dijo (no se sabe). */
  modo?: ModoRecuperacion;
  /** Ausente = principal, que es la fase cuya dosis se cuenta. */
  fase?: FaseCarrera;
}

/** Una línea de trabajo: qué se hace, cuánto, y contra qué. */
export interface ItemReal {
  /** `exercises.name`. */
  nombre: string;
  /**
   * La MEDIDA — distancia, tiempo, reps o calorías.
   *
   * **`null` cuando la prescripción no la trae, y pasa de verdad**: en el
   * circuito de pierna del coach (plantilla 442) hay CUATRO segmentos cuyo
   * `prescription_json` entero es `{"scheme":"sets","modality":"functional"}`.
   * Sin medida. Es el hueco conocido del método (~38 % de la biblioteca sin
   * dosis) y llega hasta la pantalla del atleta.
   *
   * Nulo se pinta como el nombre solo. **Jamás un «— reps» ni un 0**: eso
   * sería fabricar una dosis que el coach no escribió (§7).
   */
  dosis: string | null;
  /** El OBJETIVO — ritmo, zona, RPE, %RM o kg. Ausente = no lo hay. */
  objetivo?: string;
  /** Descanso entre series, en segundos. Ausente = la prescripción no lo lleva. */
  descansoS?: number;
  /** Series, cuando la prescripción las declara (`sets[]`). */
  series?: number;
  /**
   * La ESTRUCTURA de una carrera, cuando el coach la dictó (`prescription.structure`).
   *
   * Cuando está, MANDA: los campos de arriba son el aplanado que deriva
   * `prescriptionToParams` (un set, un `rest_s`) y con él solo se cuenta lo que
   * no trae gramática. Aquí van los tramos de la fase que se cuenta, ya
   * expandidos — igual que `structure.expandedLegs()`.
   */
  estructura?: TramoCarrera[];
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
// LA CARRERA ESTRUCTURADA — el fartlek que no se podía empezar (10-ago-2026)
// ---------------------------------------------------------------------------

const FARTLEK_SERIES = 16;

/**
 * Los 32 tramos que expande la estructura: 16 × [500 m en Z4 + 1' en Z2 al trote].
 * Se generan en vez de escribirse a mano por lo mismo que la app los expande:
 * el dato es «repite 16 veces esto», no treinta y dos filas.
 */
const FARTLEK_TRAMOS: TramoCarrera[] = Array.from({ length: FARTLEK_SERIES }, () => [
  { tipo: 'trabajo' as const, metros: 500, zona: 4 },
  { tipo: 'recuperacion' as const, segundos: 60, zona: 2, modo: 'trote' as const },
]).flat();

/**
 * `GET /api/athlete/assignments/411/detail` — plantilla 609, atleta 64, para el
 * 11-ago-2026. El coach lo dictó por el conector MCP: «16 series: 500 m fuerte en
 * Z4 (ON) + 1 min suave en Z2 (OFF) entre cada una».
 *
 * ES EL CASO QUE ROMPIÓ LA APP. La ficha se veía bien, y al tocar EMPEZAR la
 * pantalla salía en blanco; y las dos pantallas que enseñan la dosis leían «500 m
 * · Z4 · descanso 1:00»: perdían el ×16 y llamaban «descanso» a un minuto que se
 * corre al trote. Los dos arreglos están en los commits 68fd9b69 y 7b01b5a1.
 *
 * Por eso vive aquí con las DOS caras del mismo dato: los escalares son el
 * aplanado que deriva `prescriptionToParams` (un set, `rest_seconds` 60,
 * `distance_meters` 500, `hr_zone` 4) y `estructura` es la verdad que el coach
 * dictó. Un espejo que solo trajera la estructura no podría demostrar que la
 * estructura MANDA sobre el aplanado.
 */
export const FARTLEK_16X500: SesionReal = {
  procedencia: 'plantilla 609 · asignación 411 · atleta 64',
  titulo: 'Fartlek 16 x 500m Z4',
  origen: 'coach',
  bloques: [
    {
      titulo: 'Fartlek 16 x 500m Z4',
      // `PrescriptionRenderer.wodHeader` de un `intervals` con `rounds: 16` y sin
      // reparto trabajo/transición escrito. Se repite la palabra porque la
      // cabecera nombra el esquema y luego cuenta sus rondas.
      formato: 'Series · 16 series',
      items: [
        {
          nombre: 'Run',
          dosis: '500 m',
          objetivo: 'Z4',
          descansoS: 60,
          series: 1,
          estructura: FARTLEK_TRAMOS,
          modalidad: 'run',
        },
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

/**
 * `templates` 442 · asignación 240 · **11 segmentos en 3 bloques**. El caso
 * típico del plan del coach — y el que enseña el hueco del método.
 *
 * Copiado fila a fila de `template_segments`. Los cuatro del bloque «Fuerza»
 * son literales: `Sled Push`, `Sled drag (backwards)` y `Run` llegan con
 * `{"scheme":"sets","modality":…}` y NADA más, y el `Reverse Lunge` trae
 * cuatro series con 30 kg pero **sin repeticiones**. Así está en producción.
 */
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
        { nombre: 'Thoracic Rotation', dosis: '10 reps', series: 2, modalidad: 'mobility' },
        { nombre: 'Air Squat', dosis: '15 reps', objetivo: 'peso corporal', series: 2, modalidad: 'functional' },
      ],
    },
    {
      titulo: 'Fuerza',
      items: [
        // Cuatro series y un peso, pero el coach no escribió las repeticiones.
        { nombre: 'Reverse Lunge', dosis: null, objetivo: '30 kg', series: 4, modalidad: 'strength' },
        { nombre: 'Sled Push', dosis: null, modalidad: 'functional' },
        { nombre: 'Sled drag (backwards)', dosis: null, modalidad: 'strength' },
        { nombre: 'Run', dosis: null, modalidad: 'run' },
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

/**
 * Qué se escribe por debajo del minuto — `Formato.SubMinuto`. `reloj` da «0:45»
 * y `segundos` da «45s», que es la grafía de los descansos y los topes, donde
 * «45s» se lee de un vistazo y «0:45» hace pensar.
 */
export type SubMinuto = 'reloj' | 'segundos';

/** `Formato.clock` — 5:00, sin cero delante; 1:02:30 cuando pasa de la hora. */
export function reloj(segundos: number, subMinuto: SubMinuto = 'reloj'): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${dosDigitos(m)}:${dosDigitos(r)}`;
  if (m === 0 && subMinuto === 'segundos') return `${r}s`;
  return `${m}:${dosDigitos(r)}`;
}

/** Coma española (`esDecimal`) — jamás un punto de cara al atleta. */
export function esDecimal(valor: number, decimales = 1): string {
  return valor.toFixed(decimales).replace('.', ',');
}

/**
 * LA DOSIS ESCRITA de una distancia — `Formato.distancia`: «500 m», «1 km»,
 * «1,4 km». Del kilómetro para arriba pasa a km y el decimal se cae cuando la
 * cifra es redonda, porque «1,0 km» no es como se dice una dosis.
 *
 * Su hermana es `distanciaCubierta`, y la diferencia NO es la pantalla: es el
 * concepto. Una dosis se escribe corta; una MEDIDA lleva sus dos decimales
 * («2,00 km»), porque ahí los ceros son el dato.
 *
 * Nulo en cero o negativo: no hay distancia que escribir (§7).
 */
export function distanciaDosis(metros: number): string | null {
  if (!(metros > 0)) return null;
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;
  return `${Number.isInteger(km) ? String(km) : esDecimal(km)} km`;
}

/** LA DISTANCIA MEDIDA — `Formato.distanciaCubierta`: «2,34 km», «2,00 km», «437 m». */
export function distanciaCubierta(metros: number): string | null {
  if (!(metros > 0)) return null;
  return metros >= 1000 ? `${esDecimal(metros / 1000, 2)} km` : `${Math.round(metros)} m`;
}

/**
 * El ritmo objetivo — `PrescriptionRenderer.paceString`: «@ 4:35/km». Cifras y
 * unidad PEGADAS: el espacio de «@ 4:35 /km» era una de las tres grafías del
 * ritmo que convivían en la app (§2).
 */
export function ritmoObjetivo(segundosPorKm: number): string {
  return `@ ${reloj(segundosPorKm)}/km`;
}

/**
 * El signo de multiplicar es el MULTIPLICATION SIGN (U+00D7), no una equis
 * (`Formato.signoPor`): la `x` del teclado se lee como letra al lado de una
 * cifra y cambia de anchura en la monoespaciada.
 */
export const SIGNO_POR = '×';

// ---------------------------------------------------------------------------
// La dosis de una carrera ESTRUCTURADA — espejo de
// `PrescriptionRenderer.structuredRunLine` / `fraseDeRecuperacion`
// ---------------------------------------------------------------------------

/** La palabra del modo — `RunLegDisplay.recoveryModeWord`, la misma que dicen el
 *  entreno en vivo y la muñeca. */
const PALABRA_DEL_MODO: Record<ModoRecuperacion, string> = {
  trote: 'suave',
  caminar: 'caminando',
  parado: 'parado',
};

/** La medida de un tramo, escrita como la escribe `PrescriptionRenderer.measureWork`. */
function medidaDeTramo(tramo: TramoCarrera): string | null {
  if (tramo.metros != null) return distanciaDosis(tramo.metros);
  if (tramo.segundos != null && tramo.segundos > 0) return reloj(tramo.segundos, 'segundos');
  return null;
}

/**
 * LA RECUPERACIÓN, DICHA COMO SE HACE — «recuperación 1:00 suave en Z2».
 *
 * Un minuto al trote en Z2 NO es un descanso, y llamarlo así hace que el atleta
 * lo haga mal: se queda parado, y el fartlek entero pierde el sentido (el OFF
 * también se corre). Se dice «descanso» solo cuando de verdad se para —modo
 * `parado`— y cuando el modo NO SE SABE, que es lo que llega de una prescripción
 * plana: allí el número nació de un `rest_s`, así que «descanso» es exactamente
 * lo que escribió el coach y no se le cambia la palabra.
 */
export function fraseDeRecuperacion(tramo: TramoCarrera): string | null {
  const medida = medidaDeTramo(tramo);
  if (!medida) return null;
  if (!tramo.modo || tramo.modo === 'parado') return `descanso ${medida}`;
  return ['recuperación', medida, PALABRA_DEL_MODO[tramo.modo], tramo.zona ? `en Z${tramo.zona}` : null]
    .filter((parte): parte is string => parte !== null && parte !== '')
    .join(' ');
}

/**
 * EL TITULAR DEL TRABAJO — `tituloDeTrabajos`: «16 × 500 m» cuando los tramos son
 * iguales, «1200/1000/800 m» cuando no.
 *
 * La secuencia se escribe desde los METROS, no juntando lo que diría el
 * formateador de cada tramo por separado: `distanciaDosis` pasa a kilómetros a
 * partir de 1.000 —lo correcto para UNA dosis, «1 km»— y una pirámide salía «1,2
 * km/1 km/800 m», que no se lee ni se compara.
 *
 * Nulo cuando algún tramo no declara medida: sin dosis completa manda el aplanado.
 */
function tituloDeTrabajos(trabajos: TramoCarrera[]): string | null {
  const repetido = (dosis: string) =>
    trabajos.length > 1 ? `${trabajos.length} ${SIGNO_POR} ${dosis}` : dosis;

  const metros = trabajos.map((t) => t.metros).filter((m): m is number => m != null && m > 0);
  if (metros.length === trabajos.length) {
    const primero = metros[0];
    if (metros.every((m) => m === primero)) {
      const dosis = distanciaDosis(primero);
      return dosis ? repetido(dosis) : null;
    }
    return `${metros.join('/')} m`;
  }

  const segundos = trabajos.map((t) => t.segundos).filter((s): s is number => s != null && s > 0);
  if (segundos.length === trabajos.length) {
    const primero = segundos[0];
    if (segundos.every((s) => s === primero)) return repetido(reloj(primero, 'segundos'));
    return segundos.map((s) => reloj(s, 'segundos')).join('/');
  }

  // Tramos de distinta NATURALEZA en la misma serie (unos por metros, otros por
  // tiempo): no hay unidad que compartir, así que cada uno se dice entero.
  const dosis = trabajos.map(medidaDeTramo);
  if (dosis.some((d) => d === null)) return null;
  const escritas = dosis as string[];
  return escritas.every((d) => d === escritas[0]) ? repetido(escritas[0]) : escritas.join('/');
}

/** El objetivo de un tramo tal y como se escribe: la zona manda, si la lleva. */
function objetivoDeTramo(tramo: TramoCarrera): string | undefined {
  return tramo.zona ? `Z${tramo.zona}` : tramo.objetivo;
}

/** Las tres partes de la dosis de una carrera estructurada, y la línea que forman. */
export interface DosisCarrera {
  /** El trabajo de la fase que se cuenta: «16 × 500 m», «1200/1000/800 m». */
  titular: string;
  /** La zona / el ritmo / el RPE del trabajo, solo si TODOS los tramos llevan el mismo. */
  objetivo?: string;
  /** La recuperación dicha como se hace, o el descanso que trae el aplanado. */
  detalle?: string;
  /**
   * Las tres en una línea, en el orden y con el separador de
   * `WorkoutSegment.previewWorkLine` (titular · objetivo · detalle). Vive aquí
   * para que la puerta del bloque y el entreno en vivo no lo junten cada uno a
   * su manera (§2).
   */
  linea: string;
}

/** Los campos que necesita cualquier formateador de dosis. */
export type DosisDeItem = Pick<ItemReal, 'dosis' | 'series' | 'descansoS' | 'estructura'>;

/**
 * LA DOSIS DE UNA CARRERA ESTRUCTURADA — espejo de
 * `PrescriptionRenderer.structuredRunLine`.
 *
 *     titular   → el trabajo de la fase PRINCIPAL. No cuenta el calentamiento:
 *                 un «10' + 5×800» no son 6 series.
 *     objetivo  → la zona / el ritmo / el RPE del trabajo, cuando TODOS los
 *                 tramos llevan el mismo. Si difieren no se resume: uno de ellos
 *                 pintado sobre los demás sería falso (§7).
 *     detalle   → la recuperación, dicha como se hace.
 *
 * Nulo cuando no hay estructura o cuando no queda nada honesto que decir de ella
 * — y entonces manda el aplanado, que es el suelo de siempre.
 *
 * Ojo a lo que este doble NO modela: Swift devuelve el ritmo y la zona en campos
 * distintos porque hay superficies que pintan la zona como insignia de color.
 * Aquí las dos caben en `objetivo` porque estas pantallas la escriben como
 * texto, y el orden de `previewWorkLine` hace que la línea salga idéntica.
 */
export function dosisDeCarrera(item: Pick<ItemReal, 'descansoS' | 'estructura'>): DosisCarrera | null {
  const tramos = item.estructura;
  if (!tramos || tramos.length === 0) return null;

  // Una estructura que solo calienta no tiene fase principal: se cuenta lo que
  // hay, igual que hace el contador de series (`RunLegDisplay.serie`).
  const principales = tramos.filter((t) => (t.fase ?? 'principal') === 'principal');
  const cuentan = principales.length > 0 ? principales : tramos;
  const trabajos = cuentan.filter((t) => t.tipo === 'trabajo');
  if (trabajos.length === 0) return null;

  const titular = tituloDeTrabajos(trabajos);
  if (!titular) return null;

  const primerObjetivo = objetivoDeTramo(trabajos[0]);
  const objetivo = trabajos.every((t) => objetivoDeTramo(t) === primerObjetivo) ? primerObjetivo : undefined;

  // La recuperación: todas iguales o no se resume — una distinta por serie no
  // cabe en una línea, y decir solo la primera sería inventarse las demás.
  const detalles: string[] = [];
  const recuperaciones = cuentan.filter((t) => t.tipo === 'recuperacion');
  const primera = recuperaciones[0];
  if (primera) {
    const iguales = recuperaciones.every(
      (t) =>
        t.metros === primera.metros &&
        t.segundos === primera.segundos &&
        t.modo === primera.modo &&
        objetivoDeTramo(t) === objetivoDeTramo(primera)
    );
    const frase = iguales ? fraseDeRecuperacion(primera) : null;
    if (frase) detalles.push(frase);
  } else if (item.descansoS != null && item.descansoS > 0) {
    // La estructura no declara recuperaciones pero el plano sí trae un descanso
    // entre tramos: es un dato real del coach y no se tira.
    detalles.push(`descanso ${reloj(item.descansoS, 'segundos')}`);
  }
  const detalle = detalles.length > 0 ? detalles.join(' · ') : undefined;

  return {
    titular,
    objetivo,
    detalle,
    linea: [titular, objetivo, detalle].filter((parte): parte is string => Boolean(parte)).join(' · '),
  };
}

/**
 * LA dosis de un ítem, con sus series. Una sola grafía: `4×5`, `2×10`, `500 m`.
 *
 * Vive aquí y no en cada pantalla porque ya pasó lo que el contrato avisaba.
 * Las tres pantallas de esta tanda la escribieron por separado, cada una a su
 * manera, el mismo día y habiendo leído las dos el §2:
 *
 *   - la puerta del bloque   → `2×10`        (series delante, «reps» fuera)
 *   - el entreno en vivo     → `10 reps × 2` (series detrás, «reps» dentro)
 *   - el post-entreno        → `2×10 reps`   (series delante, «reps» dentro)
 *
 * Mismo `Leg Swings`, mismos datos, tres grafías. Exactamente los «seis relojes
 * y tres grafías del ritmo» que motivaron el contrato — así que la función es
 * una y las pantallas la usan.
 *
 * Nulo cuando la prescripción no trae medida: las series SOLAS no son una
 * dosis, y un `4×` colgando sería fabricar la mitad de un dato (§7).
 *
 * Y una CARRERA CON ESTRUCTURA se cuenta por su estructura, no por el aplanado:
 * misma precedencia que `PrescriptionRenderer.summaryLine`, que mira
 * `structuredRunLine` antes de leer el set y el `rest_s`.
 */
export function dosisConSeries(item: DosisDeItem): string | null {
  const carrera = dosisDeCarrera(item);
  if (carrera) return carrera.titular;
  if (item.dosis == null) return null;
  if (!item.series || item.series <= 1) return item.dosis;
  // «5 reps» ×4 se lee «4×5»: la unidad se cae porque el × ya la implica.
  return `${item.series}${SIGNO_POR}${item.dosis.replace(/\s*reps?$/i, '')}`;
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
