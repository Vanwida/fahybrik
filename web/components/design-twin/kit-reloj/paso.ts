// EL PASO Y EL ESTADO VIVO — el contrato de P1/P2 (docs/reloj-muneca/modelo.md).
//
// P1 · Un estado vivo, un pintor. Quien lleve el motor (el reloj o el móvil)
//      produce ESTE estado; la muñeca lo pinta siempre con el mismo código.
//      Los relojes se calculan en la muñeca desde anclas; los hápticos salen de
//      las TRANSICIONES del estado. Un dato que deja de llegar se marca viejo.
// P2 · El paso es la unidad: medida × objetivo(s) × rol × fase, con su posición
//      anidada, quién lo mide, el paso siguiente y el cue del coach.
//
// Este fichero es PURO (solo tipos y valores por defecto) y es lo que el Swift
// espejará tal cual: `Paso` ↔ el paso del cable, `Lecturas` ↔ lo que miden los
// sensores. Ningún campo es texto libre salvo el cue del coach (M8), que es
// coaching y no prescripción, y el nombre de catálogo de un ejercicio o
// estación («Sled Push»), que viene de la biblioteca, no se escribe a mano.
//
// Lo que es MÉTODO (dónde cortan las zonas, cuánta holgura antes de avisar,
// cada cuánto se repite un aviso, cómo se llama cada clase de paso) va como
// DATO con valor por defecto — HARD RULE Nº0. Nada de eso es un `const` que un
// coach no pueda cambiar.

// ---------------------------------------------------------------------------
// Medida — cómo se mide el trabajo y quién lo mide
// ---------------------------------------------------------------------------

export type TipoMedida = 'distancia' | 'tiempo' | 'reps' | 'cal' | 'abierta';

/**
 * Quién mide el paso. `reloj` es el crono de la muñeca (todo paso por tiempo);
 * `sensor` el acelerómetro (reps contadas); `atleta` = nadie lo mide, «lo dices
 * tú». Decide si un «te faltan 50 m» puede bajar solo o no.
 */
export type QuienMide = 'gps' | 'cinta' | 'ergo' | 'sensor' | 'atleta' | 'reloj';

export interface Medida {
  tipo: TipoMedida;
  /** En la unidad del tipo: m, s, reps, cal. `null` en una medida abierta. */
  prescrito: number | null;
  mide: QuienMide;
}

// ---------------------------------------------------------------------------
// Objetivo — contra qué se mide (0–2 por paso, M1)
// ---------------------------------------------------------------------------

export type EjeObjetivo =
  | 'ritmo' // s/km
  | 'zona' // número de zona del coach (1..N)
  | 'ppm' // pulsaciones
  | 'rpe' // 1–10
  | 'potencia' // W
  | 'pctRM' // % de la RM
  | 'kg'
  | 'rir'
  | 'split500' // s/500 m (ergo)
  | 'cadencia' // pasos/min o paladas/min
  | 'inclinacion'; // % (cinta)

/**
 * `principal` es lo que el coach pide controlar (manda en el héroe, P3);
 * `techo` es un límite que solo avisa por encima («máx 142 ppm»); `secundario`
 * acompaña sin mandar (la carga junto al RIR, la inclinación de la cinta).
 */
export type PapelObjetivo = 'principal' | 'techo' | 'secundario';

/**
 * Qué dirección avisa. Se razona en INTENSIDAD: «arriba» es más rápido, más
 * pulso, más vatios. En un rodaje a zona el coach suele querer solo el techo
 * (P9: «el tope de FC solo avisa por encima»). Dato del coach.
 */
export type SentidoAviso = 'ambos' | 'solo-arriba' | 'solo-abajo';

export interface Objetivo {
  eje: EjeObjetivo;
  /**
   * El rango, en la unidad del eje. En `ritmo` y `split500` `min` es el valor
   * MÁS RÁPIDO (menos segundos): 3:45–3:55 → min 225, max 235. Un valor único
   * se escribe con min = max. Un techo solo lleva `max`.
   */
  min: number | null;
  max: number | null;
  papel: PapelObjetivo;
  avisa?: SentidoAviso;
  /** La palabra del coach para un RPE («fuerte»). Si falta, la del defecto. */
  palabra?: string;
}

// ---------------------------------------------------------------------------
// Rol, fase, posición
// ---------------------------------------------------------------------------

export type Rol = 'trabajo' | 'recuperacion' | 'descanso' | 'transicion';
export type Fase = 'calentamiento' | 'principal' | 'vuelta';

export interface Contador {
  n: number;
  de: number;
}

/** La posición anidada, sin aplanar (M4): «Tanda 2/3 · Serie 4/6», «Ronda 2/5 · Estación 3/4». */
export interface Posicion {
  tanda?: Contador;
  serie?: Contador;
  tramo?: Contador;
  ronda?: Contador;
  estacion?: Contador;
  /** Superserie: «A1», «A2». Viene del bloque, no se escribe a mano. */
  slot?: string;
}

/**
 * La clase del paso — cómo lo llama el contexto. El NOMBRE que se pinta es
 * dato del coach (`NOMBRE_CLASE` es solo el defecto).
 */
export type Clase =
  | 'calentamiento'
  | 'vuelta-calma'
  | 'rodaje'
  | 'tirada'
  | 'tempo'
  | 'series'
  | 'progresivo'
  | 'fartlek'
  | 'cuestas'
  | 'strides'
  | 'carrera'
  | 'test'
  | 'recuperacion'
  | 'descanso'
  | 'descanso-tandas'
  | 'estacion'
  | 'roxzone'
  | 'fuerza'
  | 'ergo'
  | 'emom'
  | 'amrap'
  | 'fortime'
  | 'movilidad';

export const NOMBRE_CLASE_DEFECTO: Record<Clase, string> = {
  calentamiento: 'Calentamiento',
  'vuelta-calma': 'Vuelta a la calma',
  rodaje: 'Rodaje',
  tirada: 'Tirada',
  tempo: 'Tempo',
  series: 'Serie',
  progresivo: 'Progresivo',
  fartlek: 'Fartlek',
  cuestas: 'Cuesta',
  strides: 'Stride',
  carrera: 'Carrera',
  test: 'Test',
  recuperacion: 'Recupera',
  descanso: 'Descanso',
  'descanso-tandas': 'Descanso entre tandas',
  estacion: 'Estación',
  roxzone: 'Roxzone',
  fuerza: 'Serie',
  ergo: 'Ergo',
  emom: 'EMOM',
  amrap: 'AMRAP',
  fortime: 'For Time',
  movilidad: 'Movilidad',
};

/**
 * Los nombres por defecto que son femeninos («Serie 2 cerrada», «Tramo 3
 * cerrado»). El género va con el nombre: si el coach renombra una clase, lo
 * trae con él.
 */
export const FEMENINO_DEFECTO: ReadonlySet<Clase> = new Set<Clase>([
  'vuelta-calma',
  'tirada',
  'series',
  'cuestas',
  'carrera',
  'estacion',
  'roxzone',
  'fuerza',
  'movilidad',
]);

// ---------------------------------------------------------------------------
// Lo propio de cada familia, como DATO del paso (P10, P11, P12)
// ---------------------------------------------------------------------------

/**
 * P10 · La Roxzone tiene dos mitades: entrar a la estación (la cierra el
 * atleta al empezarla) y salir a correr (se cierra sola al detectar que vuelve
 * a correr: `medida.mide = 'sensor'`).
 */
export type SentidoRoxzone = 'entrada' | 'salida';

/**
 * P12 · Un movimiento dentro de una ventana (EMOM), de una ronda (AMRAP) o de
 * un For Time. `dosis: null` = todo el intervalo (el remo de 498 «6 × 1′»).
 */
export interface Tarea {
  nombre: string;
  dosis: Medida | null;
  carga?: { kg: number; implementos?: number };
  /** «@ peso corporal» (506): un dato, no la ausencia de carga. */
  corporal?: boolean;
  /** Quién la mide: el PM5 (metros y /500), la cinta, o nadie («lo dices tú»). */
  mide: QuienMide;
  /** Una tarea de correr usa la cara de correr (P10). */
  corre?: boolean;
}

/**
 * P12 · El formato que enmarca la tarea (M5: el EMOM con su total explícito).
 * `puntuacion` no la escribe el coach: es el paso que sigue a un AMRAP, donde
 * se dicen las reps de la ronda a medias con la corona.
 */
export type InfoWod =
  | { formato: 'emom'; tarea: Tarea; ciclo: Tarea[]; ventanas: number; ventanaS: number }
  | { formato: 'amrap'; tareas: Tarea[]; duracionS: number }
  | { formato: 'puntuacion'; tareas: Tarea[]; duracionS: number }
  | { formato: 'fortime'; tarea: Tarea | null; capS: number | null }
  | { formato: 'pared'; trabajoS: number; descansoS: number; rondas: number };

/** P11 · El eje de la CARGA. Uno por serie; el esfuerzo es el otro eje. */
export type CargaFuerza =
  /** Kilos directos del coach: «155 kg», «150–160 kg». */
  | { tipo: 'kg'; min: number; max: number }
  /** %RM del coach, resuelto en kg con la RM del atleta (`null` = no la tiene). */
  | { tipo: 'rm'; pctMin: number; pctMax: number; rmKg: number | null }
  /** Peso corporal: no hay carga que anotar. */
  | { tipo: 'corporal' }
  /**
   * El coach no pone carga (manda el RIR o el RPE): la pone el atleta. Se
   * propone la de la última vez, que no cuenta como declarada. Con `lastre`,
   * lo que se anota es el lastre (dominada lastrada).
   */
  | { tipo: 'tuya'; ultimaKg: number | null; lastre?: boolean };

/** P11 · El eje del ESFUERZO: RIR o RPE, valor o rango. */
export interface EsfuerzoFuerza {
  eje: 'rir' | 'rpe';
  min: number;
  max: number;
}

/**
 * P11/M1 · LA FICHA DE LA SERIE DE FUERZA: los DOS ejes de la dosis, si es
 * por lado, si es de aproximación y lo que mueve la corona al anotar la carga.
 *
 * Va en el paso (`PasoBase.fuerza`), no en un tipo aparte: el paso del cable
 * es uno solo y el Swift lo espeja como un `struct`; con un tipo aparte cada
 * consumidor genérico (la voz, el aviso de deshacer, «Viene:») tendría que
 * adivinar de qué familia es. `esFuerza` estrecha el tipo donde hace falta.
 *
 * Los objetivos del paso siguen diciendo lo mismo en su idioma (`rir`/`rpe`
 * principal, `pctRM`/`kg` secundario): la ficha es lo que la anotación
 * necesita y un objetivo no dice (la RM del atleta, la última carga, el
 * implemento).
 */
export interface FichaFuerza {
  /** Clave del ejercicio en la sesión: agrupa sus series y aproximaciones. */
  ejercicio: string;
  carga: CargaFuerza;
  esfuerzo: EsfuerzoFuerza | null;
  /** «10 por pierna» es dato, no nota. */
  porLado?: 'pierna' | 'brazo' | 'lado';
  /** Serie de aproximación: se marca, no es de trabajo y no se anota. */
  aproximacion?: boolean;
  /** Lo que mueve la carga un clic de corona, en kg (barra 2,5, mancuernas 2…). Del gimnasio. */
  pasoKg: number;
  /** De dónde arranca la corona si no hay carga propuesta: la barra vacía. Del implemento. */
  vaciaKg?: number;
}

/**
 * Lo que es del implemento y del gimnasio, no del plan: dato con defecto
 * (HARD RULE Nº0). Una barra técnica pesa 10 kg; una de mujer, 15.
 */
export const FICHA_FUERZA_DEFECTO = { pasoKg: 2.5, vaciaKg: 20 } as const;

// ---------------------------------------------------------------------------
// El paso
// ---------------------------------------------------------------------------

/** M2 · Cómo se recupera, como dato: decide la palabra y si el GPS sigue midiendo. */
export type ModoRecupera = 'trote' | 'andar' | 'parado';

/** M3 · Dónde se corre. Sale de la prescripción; nunca se pregunta a mitad. */
export type Entorno = 'calle' | 'cinta' | 'pista';

export interface PasoBase {
  id: string;
  clase: Clase;
  rol: Rol;
  fase: Fase;
  medida: Medida;
  /** 0–2 (M1). El `principal` manda en el héroe. */
  objetivos: Objetivo[];
  posicion?: Posicion;
  /** Nombre de catálogo del ejercicio, estación o máquina («Back Squat», «Sled Push»). */
  nombre?: string;
  modoRecupera?: ModoRecupera;
  entorno?: Entorno;
  /** M7 · Carga del implemento: 2 × 32 kg → { kg: 32, implementos: 2 }. */
  carga?: { kg: number; implementos?: number };
  /** M7 · Máquina y su ajuste (damper del SkiErg o del remo). */
  maquina?: { tipo: 'remo' | 'ski' | 'bici' | 'cinta'; damper?: number };
  /** Tempo de fuerza, en segundos: 3-1-1-0. */
  tempo?: { excentrica: number; pausaAbajo: number; concentrica: number; pausaArriba: number };
  /** M8 · El cue del coach: coaching corto, no prescripción («mirar el pulso»). */
  cue?: string;
  /**
   * Quién cierra el paso. `medida` = se cierra solo al cruzar lo prescrito;
   * `atleta` = hasta pulsar (dato del coach, P9) o porque nada lo mide.
   */
  cierre: 'medida' | 'atleta';
  /** Vuelta automática cada N metros en rodajes y tiradas (dato del coach, P9). */
  vueltaAutoM?: number;
  /** Índice del bloque del coach: cambiar de bloque es el evento «bloque hecho». */
  bloque?: number;
  /** P10 · Qué mitad de la Roxzone es (solo en un paso `roxzone`). */
  roxzone?: SentidoRoxzone;
  /** P12 · El formato del WOD y su tarea (EMOM, AMRAP, For Time, reloj de pared). */
  wod?: InfoWod;
  /** P11 · La ficha de la serie de fuerza (los dos ejes de la dosis). */
  fuerza?: FichaFuerza;
}

export interface Paso extends PasoBase {
  /** Lo que viene. `null` = es el último. Es de donde sale «Luego · …» y «Viene: …». */
  siguiente: PasoBase | null;
}

// ---------------------------------------------------------------------------
// Lecturas — lo que miden los sensores AHORA
// ---------------------------------------------------------------------------

export type CampoVivo = 'hecho' | 'ritmo' | 'ppm' | 'split500' | 'vatios' | 'cadencia';

export type EstadoGps = 'buscando' | 'listo' | 'no-aplica';

export interface Lecturas {
  /** Segundos en el paso, anclados en la muñeca (inicio + pausas). */
  t: number;
  /**
   * Lo hecho del paso en la unidad de su medida (m, s, reps, cal). `null` =
   * nadie lo ha medido todavía: se pinta «—», jamás un cero (honestidad).
   */
  hecho: number | null;
  /** Ritmo ACTUAL suavizado (~10 s), s/km. Nunca la media rotulada «ritmo». */
  ritmo: number | null;
  ppm: number | null;
  ppmTendencia?: 'sube' | 'baja' | 'estable';
  split500?: number | null;
  vatios?: number | null;
  cadencia?: number | null;
  gps: EstadoGps;
  /** Campos que dependen del móvil y no llegan en 5 s: se pintan «—» (§3). */
  viejos?: CampoVivo[];
}

// ---------------------------------------------------------------------------
// Zonas del coach y reglas de aviso — MÉTODO, dato con defecto
// ---------------------------------------------------------------------------

/**
 * Las zonas del coach para este atleta, en ppm. `techos[i]` es el ppm más alto
 * de la zona i+1; el último es la FC máxima. De 3 a 9 zonas.
 */
export interface ZonasCoach {
  techos: number[];
  nombres?: string[];
}

export interface ReglasAviso {
  /** Holgura fuera de la banda antes de contar como fuera (histéresis), por eje. */
  holgura: { ritmo: number; ppm: number; split500: number; vatios: number; cadencia: number };
  /** Mínimo entre dos avisos del mismo paso, en s. */
  cadenciaS: number;
  /** Segundos seguidos fuera antes del primer aviso. */
  confirmacionS: number;
  /** Segundos al empezar un paso a zona en los que no se avisa «aprieta» (el pulso va con retraso). */
  graciaZonaS: number;
  /** Preaviso antes del final de un paso: 10 s o 100 m. */
  preavisoS: number;
  preavisoM: number;
  /** Un paso más corto que esto no lleva preaviso (sería la mitad del paso). */
  preavisoMinimoS: number;
  avisarEnCalentamiento: boolean;
  avisarEnRecuperacion: boolean;
}

export const REGLAS_AVISO_DEFECTO: ReglasAviso = {
  holgura: { ritmo: 3, ppm: 2, split500: 2, vatios: 10, cadencia: 3 },
  cadenciaS: 20,
  confirmacionS: 4,
  graciaZonaS: 45,
  preavisoS: 10,
  preavisoM: 100,
  preavisoMinimoS: 30,
  avisarEnCalentamiento: false,
  avisarEnRecuperacion: false,
};

// ---------------------------------------------------------------------------
// Vueltas y estructura — las páginas de la corona
// ---------------------------------------------------------------------------

export type Veredicto = 'dentro' | 'por-encima' | 'por-debajo';

export interface Vuelta {
  n: number;
  /** En series anidadas, la tanda (la vuelta «2·4» es la serie 4 de la tanda 2). */
  tanda?: number;
  clase: 'serie' | 'km' | 'tramo' | 'estacion';
  segundos: number;
  metros: number | null;
  /** Ritmo medio de la vuelta, s/km. */
  ritmo: number | null;
  ppm: number | null;
  veredicto: Veredicto | null;
  /** Contra qué eje se juzgó: decide la palabra («rápido» o «alto»). */
  eje?: EjeObjetivo;
}

/**
 * EL PARCIAL DE UN PASO — cada paso cerrado deja el suyo (P10: cada estación y
 * cada tramo de carrera es su propia vuelta). Lo deja el motor al cerrar,
 * mida quien mida: la estación que dices tú deja su tiempo; la del PM5, sus
 * metros; la Roxzone, lo que tardaste en cruzarla.
 */
export interface Parcial {
  /** El índice del paso en el plan. */
  i: number;
  segundos: number;
  /** Metros de ESTE paso si alguien los midió (GPS, cinta, PM5); si no, null. */
  metros: number | null;
  ppm: number | null;
  /** Lo hecho en la unidad de la medida cuando la cuenta un sensor (reps del reloj, cal del PM5). */
  hecho: number | null;
}

/** Una fila de la página Estructura: un bloque del coach y dónde estás en él. */
export interface FilaEstructura {
  fase: Fase;
  /** N × (trabajo / recupera); sin `veces` es un paso suelto. */
  veces?: number;
  trabajo: PasoBase;
  recupera?: PasoBase;
  /** Series anidadas (M4): 3 × (6 × …) con su descanso entre tandas. */
  tandas?: { veces: number; descanso: PasoBase };
  estado: 'hecho' | 'ahora' | 'pendiente';
}

// ---------------------------------------------------------------------------
// El estado vivo entero
// ---------------------------------------------------------------------------

/** Quién lleva el motor y si el enlace vive. En espejo sin enlace, lo que viene del móvil se marca viejo. */
export type Enlace = 'solo' | 'espejo' | 'sin-enlace';

export interface Sesion {
  t: number;
  metros: number | null;
  ritmoMedio: number | null;
  ppmMedio: number | null;
}

export interface EstadoVivo {
  paso: Paso;
  lecturas: Lecturas;
  sesion: Sesion;
  zonas: ZonasCoach | null;
  reglas: ReglasAviso;
  pausado: boolean;
  enlace: Enlace;
  vueltas: Vuelta[];
  estructura: FilaEstructura[];
}
