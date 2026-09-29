// EL CONTRATO DE «PLAN» — lo que la pestaña del atleta con coach recibe, y solo eso.
//
// Es el espejo, campo a campo, de lo que `PlanView.swift` lee hoy: la semana
// publicada (`AthletePlanWeekResponse` → `SemanaDelPlan` en PlanHoyModel.swift),
// el desglose de la sesión que la card muestra (`AssignmentDetail` →
// `DesgloseSesion`), la pareja de dobles, el aviso de pausa y el entreno
// guardado a medias. Nada de lo de aquí se calcula en la pantalla: una pestaña
// PINTA, no decide (mismo principio que `kit-hoy/contrato`). Las decisiones
// puras (qué día se muestra, qué sesión es el sujeto, qué acción se ancla, qué
// tono lleva) viven en `modelo.ts` y las fija `tests/design-twin/plan-rehecho.test.ts`.
//
// Reutiliza los tipos del doble que ya existían: `EstadoSesion` y `ModalidadHoy`
// (kit-hoy/contrato) y `DurationUnknownReason` (shared/domain/prescription),
// la misma pareja «reloj escrito, o por qué no lo hay» de `plan-bloque/data.ts`.
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md) QUE ESTA PESTAÑA RESPETA ──────────
//  · 6-ago: el PLAN es la ÚNICA puerta que EMPIEZA un entreno. Aquí vive
//    «Empezar»; Hoy solo dice el estado y lleva aquí.
//  · 7-ago: cada día es una card. Un solo día MOSTRADO en cada momento, con su
//    desglose real; tocar un día del carril lo cambia, no abre otra pantalla.
//  · 7-ago: la dosis (series, carga, descanso) NO vive en el héroe. Se retiró
//    porque un bloque suelto se leía como la dosis de la sesión entera; en su
//    sitio va la nota del coach para ese día. Por eso este contrato no lleva
//    «claves de dosis»: el servidor no sirve ninguna cifra a nivel de sesión.
//  · 11-ago: la puerta al ciclo vive en el cromo, no en un pie.
//  · 12-ago (plan-ciclo): nada de volumen previsto de semanas futuras. Lo
//    planificado se pinta con seguridad; lo medido del futuro no existe.
//  · CONTRATO-UI §7: un día sin sesión es descanso y no fabrica nada; la
//    duración es el reloj que ESCRIBE la prescripción (un suelo, «desde 45 min»)
//    o la razón por la que no lo hay; nunca un número plausible.
//  · HARD RULE Nº0: el nombre del bloque, la línea de la semana y la nota del
//    día son VOZ DEL COACH (dato). El sistema no bautiza fases ni escribe ahí.

import type { DurationUnknownReason } from '@fahybrid/shared/domain/prescription';
import type { EstadoSesion, ModalidadHoy } from '../kit-hoy/contrato';

export type { EstadoSesion, ModalidadHoy };

/**
 * Los CINCO estados de un día del carril (`EstadoDiaPlan`). El doble antiguo
 * modelaba cuatro; el dato real distingue «a medias» y colapsarlo en «hecha»
 * afirmaría un trabajo completo que no ocurrió.
 */
export type EstadoDiaPlan = 'descanso' | EstadoSesion;

export type Franja = 'AM' | 'PM';

/**
 * El reloj que ESCRIBE el plan, o por qué no lo escribe. `null` cuando el
 * servidor no dice nada (payloads viejos): entonces no se pinta ni número ni razón.
 */
export type DuracionEscrita = { minutos: number } | { razon: DurationUnknownReason };

// ---------------------------------------------------------------------------
// La semana publicada
// ---------------------------------------------------------------------------

/** Una sesión REAL de un día (con asignación). Las vacías no cuentan. */
export interface SesionDelPlan {
  /** `assignmentId`. */
  id: string;
  /** `slot` del cable. Solo se dice cuando el día trae más de una sesión. */
  franja: Franja;
  titulo: string;
  /** La que declara el cable; `other` cuando no trae ninguna (punto neutro). */
  modalidad: ModalidadHoy;
  /** `SessionMarkState`: lo que dice el SERVIDOR (o el marcado optimista). */
  estado: EstadoSesion;
  /** `origin == "self"`: la montó el atleta. Lleva la insignia «Libre». */
  libre: boolean;
  /** `isTest`: mide, no entrena. Lleva la insignia «Test». */
  test: boolean;
  duracion: DuracionEscrita | null;
  /** `shortPrescription`: una línea de estructura. Solo se pinta si el desglose no llega. */
  resumen: string | null;
}

/** Un día del carril, ya resuelto (`DiaDelPlan`). Inicial, nombre y número se derivan del ISO. */
export interface DiaDelPlan {
  /** `YYYY-MM-DD`. */
  iso: string;
  /** 1 = lunes … 7 = domingo (el `day_of_week` del cable). */
  diaSemana: number;
  sesiones: SesionDelPlan[];
  /** Derivado por `estadoDeDia`: el sello del día. */
  estado: EstadoDiaPlan;
  esHoy: boolean;
}

/**
 * «Semana 3 de 6» / «Semana 3» (`PosicionEnBloque`). Sale de `macro.week_label`
 * del servidor. `total: null` = plan directo: el total no es un hecho, crece a
 * medida que el coach publica (nunca se inventa un «de M»).
 */
export interface PosicionEnBloque {
  semana: number;
  total: number | null;
}

export interface SemanaDelPlan {
  /** `week_start` / `week_end` del cable (siempre lunes y domingo). */
  desde: string;
  hasta: string;
  /** Siempre siete, de lunes a domingo. */
  dias: DiaDelPlan[];
  /** Índice de hoy dentro de `dias`; null cuando hoy cae fuera (semanas hojeadas). */
  indiceHoy: number | null;
  /** `focus`: lo que el coach escribió para ESTA semana. */
  intencion: string | null;
  /** `microciclo_name`: el nombre que el coach le puso al bloque. */
  nombreBloque: string | null;
  posicion: PosicionEnBloque | null;
  /** `plan_starts_on`: cuándo empieza el trabajo YA programado, si cae después de esta semana. */
  planStartsOn: string | null;
  /** `has_next_week`: hay semana publicada más adelante dentro del horizonte del club. */
  hayMasAdelante: boolean;
  /** `peek_blocked_by_horizon`: la hay, pero el club no deja verla todavía. */
  bloqueadaPorHorizonte: boolean;
}

// ---------------------------------------------------------------------------
// El desglose de la sesión que la card muestra
// ---------------------------------------------------------------------------

/** Un bloque del entreno, con QUÉ ejercicios lleva (nombres reales, nunca un recuento). */
export interface ParteDeSesion {
  titulo: string;
  ejercicios: string[];
  /** Calentamiento o vuelta a la calma: el marco, no el trabajo. Se atenúa. */
  estructural: boolean;
  /** La que abre la parte (la de su primer ejercicio). */
  modalidad: ModalidadHoy;
}

export interface DesgloseSesion {
  partes: ParteDeSesion[];
  /** Cabecera de formato en castellano con sus números («AMRAP · 12:00»). Null en fuerza. */
  formato: string | null;
  /** La nota del coach para ESTA sesión (no la ficha del ejercicio). */
  nota: string | null;
  /**
   * Minutos MEDIDOS de una sesión ya hecha (`execution.totalDurationSeconds`).
   * Viaja en el mismo `AssignmentDetail` que las partes, así que no cuesta otra
   * llamada. Solo se lee en sesiones terminadas; una pendiente no tiene medida.
   */
  medidoMin: number | null;
}

/**
 * El desglose llega aparte de la semana (una petición por día mostrado):
 *  · `cargando`   → esqueleto con la forma de las partes (nada salta al llegar)
 *  · `sin-detalle`→ el servidor no lo sirvió: el héroe enseña lo que sí sabe
 *  · `listo`      → las partes reales
 */
export type Desglose = { estado: 'cargando' } | { estado: 'sin-detalle' } | ({ estado: 'listo' } & DesgloseSesion);

// ---------------------------------------------------------------------------
// La lectura entera de la pestaña
// ---------------------------------------------------------------------------

/** La semana siguiente (offset 1): llegó, o no se pudo cargar. Null = no hay, o el club la bloquea. */
export type SemanaSiguiente = SemanaDelPlan | 'falla' | null;

export interface LecturaPlan {
  /** `coach_name`. Null → «tu coach». */
  coach: string | null;
  /** Nombre de pila de la pareja de dobles: enseña el chip «Dobles · Biel» en el cromo. */
  companero: string | null;
  /** `today_iso` del cable: el «hoy» del atleta. */
  hoyIso: string;
  /**
   * Arranque en frío: sin semana en memoria todavía. Cada pieza es un esqueleto
   * con la forma final, NUNCA un vacío ni una invitación (aún no sabemos cuál toca).
   */
  cargando: boolean;
  /** No cargó y no hay caché (instalación nueva sin red). */
  errorCarga: boolean;
  /** El coach pausó el plan (`paused`). Ni error ni vacío: el atleta no ve sesiones caducadas. */
  pausa: { desde: string | null } | null;
  /** Null solo mientras carga o si falló sin caché. */
  actual: SemanaDelPlan | null;
  siguiente: SemanaSiguiente;
  /** `plan_visibility.wall_message`. Null → el texto por defecto. */
  muro: string | null;
  /** Desglose por id de sesión. Una sesión sin entrada se lee como `sin-detalle`. */
  desgloses: Record<string, Desglose>;
  /** Hay una instantánea de entreno guardado (o uno vivo): «Empezar» pregunta antes de pisarlo. */
  guardado: { titulo: string } | null;
}

/** Un escenario del doble = un caso con su título y lo que hay que mirar. */
export interface CasoPlan {
  tipo: 'coach';
  id: string;
  titulo: string;
  /** Qué simula y qué hay que mirar (va tal cual al selector de escenarios del doble). */
  mira: string;
  lectura: LecturaPlan;
  /** Con qué día y semana se abre (por defecto: hoy, esta semana). Es de la demo, no del dominio. */
  abre?: { offset?: number; iso?: string };
  /** La demo hace fallar «Marcar como hecha» la primera vez, para ver el aviso y la reversión. */
  fallaAcciones?: boolean;
}
