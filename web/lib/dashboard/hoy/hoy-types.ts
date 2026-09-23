// Contrato de Hoy (plan §4.3). Los nombres y la forma son vinculantes para la
// pantalla de la ola 2; los campos marcados «extra» son añadidos del dueño que no
// rompen el contrato.

import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';

export type SystemicKind =
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
}

/** extra — una fila pospuesta (para «Pospuesto (n)» y deshacer). */
export interface HoySnoozedRow extends HoyRow {
  /** Hasta cuándo, o null = hasta nueva señal. */
  until: string | null;
}

export interface HoyView {
  generated_at: string;
  counts: {
    /** Filas que piden algo hoy: grupos + crítico + vigilar. Baja al actuar. */
    needs_you: number;
    critico: number;
    vigilar: number;
    /** Atletas que el coach marcó «hecho» hoy. */
    resolved_today: number;
    /** Atletas con alguna señal pospuesta que, sin posponer, tendrían fila. */
    snoozed: number;
  };
  /** Cuántos atletas activos ven su semana (chip «Visible») de cuántos. */
  week_visibility: { visible: number; total: number };
  /** Filas de causa compartida primero. */
  systemic: SystemicGroup[];
  /** Todas. */
  critico: HoyRow[];
  /** Todas (la pantalla pliega a partir de 10). */
  vigilar: HoyRow[];
  /** extra — las filas pospuestas, para desplegarlas y deshacer. */
  snoozed_rows: HoySnoozedRow[];
}
