// Contrato de Hoy (plan §4.3). Los nombres y la forma son vinculantes para la
// pantalla de la ola 2; los campos marcados «extra» son añadidos del dueño que no
// rompen el contrato.

import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';

export type SystemicKind =
  | 'awaiting_reply'
  | 'week_hidden'
  | 'no_program'
  | 'intake_pending'
  | 'payments_overdue'
  | 'leads_new'
  | 'calls_today';

export interface SystemicGroup {
  kind: SystemicKind;
  count: number;
  title: string;
  detail: string;
  /** Atletas afectados (vacío para leads y llamadas, que no son atletas). */
  athlete_ids: string[];
  /** extra — `week_hidden`: el lunes de la semana (la actual o la que viene). */
  week_start?: string | null;
  /** extra — leads y llamadas: sus ids, para la acción en bloque. */
  item_ids?: string[];
}

/**
 * extra — lo que contestó el motor de ajuste a «Proponer descarga» para ESTA
 * señal (una propuesta hecha después de que el motor la viera):
 *   - `propuesta`: hay un cambio pendiente de aprobar en su ficha;
 *   - `mantener`: el motor no propone cambios; `summary` dice por qué, en una
 *     línea, y la fila ofrece «Hecho» en vez de volver a proponer.
 */
export interface HoyProposal {
  id: string;
  outcome: 'propuesta' | 'mantener';
  summary: string;
}

export interface HoyRow {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level_label: string | null;
  primary: AthleteSignal;
  other_count: number;
  /** «2 h», «3 d» — desde que el motor ve la señal principal. */
  age_label: string;
  snoozable: boolean;
  /** extra — las demás señales accionables del atleta, peor primero. */
  others: AthleteSignal[];
  /** extra — la respuesta del motor a «Proponer descarga» (ver `HoyProposal`). */
  proposal?: HoyProposal | null;
}

/** extra — una fila pospuesta (para «Pospuesto (n)» y deshacer). */
export interface HoySnoozedRow extends HoyRow {
  /** Hasta cuándo, o null = hasta nueva señal. */
  until: string | null;
}

export interface HoyView {
  generated_at: string;
  counts: {
    /**
     * ATLETAS que te necesitan (`athleteNeedsYou`): los de los grupos más los de
     * las filas, cada uno una vez. Es la insignia de Hoy y la vista «Necesitan
     * algo» de Atletas. Baja al actuar. Leads y llamadas no cuentan aquí (son
     * de Negocio, con su propia insignia).
     */
    needs_you: number;
    /** extra — hilos por responder (la regla y la cifra de Mensajes). */
    awaiting_reply: number;
    /** Filas de la sección «Acción» (atletas en estado acción con algo propio). */
    critico: number;
    vigilar: number;
    /**
     * extra — atletas en estado «Acción» sin fila porque lo suyo ya lo cubre un
     * grupo (p. ej. solo un pago vencido). Filas + esto = «Acción» de Atletas.
     */
    accion_in_groups: number;
    /** Atletas que el coach marcó «hecho» hoy. */
    resolved_today: number;
    /** Atletas con alguna señal pospuesta que, sin posponer, tendrían fila. */
    snoozed: number;
  };
  /**
   * Cuántos atletas activos ven su semana (chip «Visible»): `total` = activos;
   * `programmed` (extra) = los que tienen entrenos esta semana (visibles u
   * ocultos) — «89 de 89 ven su semana programada» suma con «No ven su semana».
   */
  week_visibility: { visible: number; total: number; programmed: number };
  /** Filas de causa compartida primero. */
  systemic: SystemicGroup[];
  /** Todas. */
  critico: HoyRow[];
  /** Todas (la pantalla pliega a partir de 10). */
  vigilar: HoyRow[];
  /** extra — las filas pospuestas, para desplegarlas y deshacer. */
  snoozed_rows: HoySnoozedRow[];
  /**
   * extra — cada hilo por responder como fila (el mismo conjunto que el grupo
   * «N por responder» y que Mensajes), la espera más larga primero. Solo en el
   * filtro «Por responder». Su señal es la del motor si ya pasó el umbral del
   * coach, o la informativa desde el primer minuto.
   */
  replies: HoyRow[];
}
