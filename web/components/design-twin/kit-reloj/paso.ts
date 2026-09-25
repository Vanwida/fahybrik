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
