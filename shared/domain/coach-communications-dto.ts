// @fahybrid/shared/domain/coach-communications-dto — EL CONTRATO DE LECTURA.
//
// Lo que viaja por el cable, en snake_case porque al otro lado hay un `Codable`
// de Swift. Vive aparte del vocabulario y de los esquemas de escritura
// (`coach-communications.ts`, que lo reexporta entero) porque es la cara que ven
// TRES clientes —iOS, la app del atleta en web y el dashboard del coach— y la
// que no se puede tocar sin mirar a los tres.
//
// Lo que se escribe y lo que se lee no son la misma forma a propósito: al
// escribir, una sección de nota es una unión por FORMA (una cifra no tiene
// segmentos); al leer es una fila plana con todos los campos, porque un
// decodificador no elige rama.

import type { PlanPathDTO } from './plan-path';
import type { ZoneChartDTO } from './zone-chart';
import type { ZoneComparisonDTO } from './zone-compare';
import type {
  CommunicationAnchor,
  CommunicationDisplay,
  CommunicationKind,
  CommunicationState,
  CommunicationStatus,
} from './coach-communications';

// ---------------------------------------------------------------------------
// El contrato de lectura (snake_case — convención Swift Codable)
// ---------------------------------------------------------------------------

/** Un trozo de un reparto. El color no viaja: se deriva de `position`. */
export interface CommunicationSegmentDTO {
  position: number;
  value_num: number;
  label: string;
}

export interface CommunicationItemDTO {
  id: string;
  position: number;
  /** Marca temporal del paso, cabecera de sección o —en una cifra— su pie.
   *  Null en las opciones de una pregunta. */
  label: string | null;
  /** Vacío en las formas que no se teclean (`reparto`, `camino`). */
  content: string;
  /** Qué pasa si eliges esta opción. Solo en preguntas. */
  consequence: string | null;
  /**
   * ¿Lleva casilla? Solo significa algo en un paso de PROTOCOLO: una opción se
   * elige y una sección se lee, así que ahí llega `true` y nadie lo mira.
   */
  checkable: boolean;
  /**
   * Cómo se pinta. Solo significa algo en una sección de NOTA; fuera de ahí
   * llega `texto` y es inerte (migración 0163).
   */
  display: CommunicationDisplay;
  /**
   * Los trozos de un reparto, en orden. Vacío en todo lo demás — los rangos de
   * una gráfica comparten tabla con éstos pero NO viajan aquí: un rango marca un
   * periodo y no pesa nada, así que meterlo en la misma lista obligaría a todo
   * decodificador a preguntarse qué es cada fila. Viajan dentro de `grafica`.
   */
  segments: CommunicationSegmentDTO[];
  /**
   * La espina del plan de ESE atleta, resuelta al servir (nunca guardada: si se
   * guardara, el día que le cambien el plan la nota seguiría contando el viejo).
   * Null cuando la sección no es un camino, cuando no hay atleta al que
   * resolvérselo (la lista del coach) o cuando ese atleta no tiene plan — y
   * entonces el cliente no la pinta, en vez de dibujar un camino inventado.
   */
  camino: PlanPathDTO | null;
  /**
   * El tiempo en zonas de ESE atleta dentro de la ventana que el coach guardó,
   * con sus marcas encima. Se resuelve al servir por la misma razón que el
   * camino: si se guardaran las barras, la nota seguiría contando los datos del
   * día que se escribió aunque después llegara el entreno que faltaba.
   *
   * Null cuando la sección no es una gráfica, cuando no hay atleta al que
   * resolvérsela (la biblioteca del coach) o cuando en toda la ventana no hay
   * ni una semana con dato — y entonces el cliente no la pinta, en vez de
   * dibujar seis meses de suelo como si el atleta no hubiera entrenado.
   */
  grafica: ZoneChartDTO | null;
  /**
   * Los dos periodos de ESE atleta, sumados y enfrentados. Se resuelve al servir
   * por la misma razón que el camino y la gráfica: guardados, los totales
   * seguirían contando lo que se sabía el día que se escribió la nota.
   *
   * Null cuando la sección no es una comparativa o cuando no hay atleta al que
   * resolvérsela (la biblioteca del coach). Un periodo SIN dato no la anula: sale
   * con los totales a cero y `weeks_with_data` a cero, que son dos cosas
   * distintas y el cliente las dice distinto — «no entrenó» y «no lo sabemos».
   */
  comparativa: ZoneComparisonDTO | null;
  /**
   * Config + informe resuelto. `assignment_id` viaja siempre (es lo que el
   * coach eligió). `report` es null sin atleta o sin resultado todavía.
   */
  test_result: {
    assignment_id: string;
    report: import('./test-report/cmj').CmjReport | null;
  } | null;
}

/**
 * El comunicado al que otro apunta, tal y como se enseña en el pie del que
 * enlaza. Una sola forma para los dos lados: al coach le llega siempre y con
 * `state` en null (sin un atleta delante no hay estado); al atleta sólo le llega
 * si él también es destinatario, y con SU estado — así el pie deja de ser una
 * llamada a la acción y pasa a ser el recibo de lo que decidió.
 */
export interface LinkedCommunicationDTO {
  id: string;
  kind: CommunicationKind;
  title: string;
  blocks: boolean;
  state: CommunicationState | null;
}

/** Lo que ve el ATLETA: el comunicado más SU estado. */
export interface AthleteCommunicationDTO {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: string | null;
  blocks: boolean;
  /**
   * La nota de voz del coach, si la grabó. Es la URL de NUESTRO proxy
   * autenticado: se pide con la misma credencial que el resto de la bandeja y se
   * reproduce EN LÍNEA, dentro del comunicado, sin salir a ningún sitio.
   */
  audio_url: string | null;
  /** Cuánto dura, para poder rotular «2:14» antes de descargar un byte. */
  audio_seconds: number | null;
  published_at: string;
  coach_name: string | null;
  items: CommunicationItemDTO[];
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  /** Los pasos que este atleta ya lleva marcados. */
  marked_item_ids: string[];
  /** ¿Sigue reclamándole algo? Lo calcula el servidor para que no haya dos verdades. */
  claims_attention: boolean;
  /** A qué otro comunicado apunta, si le llegó a él también. Null si no. */
  linked: LinkedCommunicationDTO | null;
}

/** El seguimiento agregado que ve el COACH en su lista. */
export interface CommunicationTracking {
  recipients: number;
  seen: number;
  done: number;
  answered: number;
}

/** El estado de UN atleta dentro de un comunicado, en el detalle del coach. */
export interface CommunicationRecipientDTO {
  athlete_id: string;
  athlete_full_name: string;
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  marked_items: number;
}

/** Lo que ve el COACH: el comunicado, su estado editorial y su seguimiento. */
export interface CoachCommunicationDTO {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: string | null;
  blocks: boolean;
  /** Su nota de voz, la misma que oye el atleta. Al coach le llega siempre: la
   *  ficha es donde relee lo que le mandó, audio incluido. */
  audio_url: string | null;
  audio_seconds: number | null;
  is_template: boolean;
  status: CommunicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items: CommunicationItemDTO[];
  tracking: CommunicationTracking;
  /** A qué otro comunicado suyo apunta. Al coach le llega siempre (es suyo). */
  linked: LinkedCommunicationDTO | null;
}

export interface CoachCommunicationDetailDTO extends CoachCommunicationDTO {
  recipients: CommunicationRecipientDTO[];
}

/**
 * El estado de UN atleta dentro de UN comunicado, con el detalle por paso.
 *
 * Es lo que el coach mira desde la ficha de ese atleta: no le sirve saber que
 * "3 de 8 lo han hecho", le sirve saber qué hizo ESTE con lo que le mandó — y en
 * un protocolo, por qué paso se quedó.
 */
export interface CommunicationAthleteStateDTO {
  athlete_id: string;
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  marked_item_ids: string[];
  /** ¿Le sigue reclamando algo? La misma regla que usa su bandeja. */
  claims_attention: boolean;
}

/** Un comunicado visto desde la ficha de un atleta concreto. */
export interface CoachAthleteCommunicationDTO extends CoachCommunicationDTO {
  athlete_state: CommunicationAthleteStateDTO;
}

