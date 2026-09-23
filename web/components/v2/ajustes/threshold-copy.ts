// Cómo se dice cada umbral en Ajustes › Método. Las claves, límites y defectos
// son de `COACH_THRESHOLD_SPEC` (shared/domain/coach/signal-thresholds.ts);
// aquí solo vive el castellano y el orden de las secciones.

import type { CoachThresholdKey } from '@fahybrid/shared/domain/coach/signal-thresholds';

export interface ThresholdCopy {
  label: string;
  /** La unidad, ya en palabras, tras el número. */
  unit: string;
  /** Una línea: qué cambia si lo mueves. */
  hint: string;
}

export const THRESHOLD_COPY: Record<CoachThresholdKey, ThresholdCopy> = {
  readiness_ok_min: { label: 'Bien desde', unit: 'puntos', hint: 'Un readiness igual o mayor se pinta como bien.' },
  readiness_caution_min: {
    label: 'Cautela desde',
    unit: 'puntos',
    hint: 'Entre este número y «bien», cautela. Por debajo, bajo.',
  },
  readiness_critical_floor: {
    label: 'Urgente por debajo de',
    unit: 'puntos',
    hint: 'Una sola lectura por debajo lleva al atleta a Hoy como urgente.',
  },
  readiness_drop_points: {
    label: 'Caída frente a su base',
    unit: 'puntos',
    hint: 'Cuánto por debajo de su mediana de 28 días cuenta como caída.',
  },
  readiness_drop_days: { label: 'Días seguidos de caída', unit: 'días', hint: 'Cuántos días seguidos hacen falta para avisarte.' },
  readiness_max_age_days: {
    label: 'Una lectura vale durante',
    unit: 'días',
    hint: 'Más vieja ya no describe hoy y no avisa.',
  },
  checkin_habit_min: {
    label: 'Tiene el hábito si hace',
    unit: 'de 14 días',
    hint: 'Solo se echa en falta el check-in de quien suele hacerlo.',
  },
  checkin_skipped_days: { label: 'Avisar si se lo salta', unit: 'días', hint: 'Días seguidos sin check-in de alguien con el hábito.' },
  missed_sessions_min: {
    label: 'Entrenos sin hacer en 7 días',
    unit: 'entrenos',
    hint: 'Solo cuentan los que ya tocaban y el atleta podía ver.',
  },
  missed_sessions_share_pct: {
    label: 'Y que sean al menos el',
    unit: '% de lo debido',
    hint: 'Con 0, basta el número de entrenos.',
  },
  rpe_high_min: { label: 'RPE alto desde', unit: 'RPE', hint: 'Desde qué esfuerzo cuenta un entreno como duro.' },
  rpe_high_share_pct: {
    label: 'Semana dura si llega a',
    unit: '% de entrenos',
    hint: 'Con RPE alto, y al menos dos entrenos.',
  },
  message_unanswered_hours: {
    label: 'Mensaje sin responder tras',
    unit: 'horas',
    hint: 'Entonces pasa a Hoy como «Por responder».',
  },
  communication_question_unanswered_days: {
    label: 'Pregunta sin respuesta tras',
    unit: 'días',
    hint: 'Una pregunta de un comunicado que el atleta no contesta.',
  },
  communication_task_overdue_critical_days: {
    label: 'Tarea atrasada, urgente tras',
    unit: 'días',
    hint: 'Días de retraso para que una tarea pase a urgente.',
  },
  communication_protocol_unopened_days: {
    label: 'Protocolo sin abrir, avisar',
    unit: 'días antes',
    hint: 'Antelación con la que avisa de un protocolo que nadie ha abierto.',
  },
  review_reproposal_days: {
    label: 'Volver a proponer una revisión tras',
    unit: 'días',
    hint: 'Si el atleta no reservó la revisión 1:1 que le propusiste, cuánto esperar para proponerla otra vez.',
  },
};

export const THRESHOLD_SECTIONS: ReadonlyArray<{ title: string; keys: CoachThresholdKey[] }> = [
  { title: 'Bandas de readiness', keys: ['readiness_ok_min', 'readiness_caution_min'] },
  {
    title: 'Avisos de readiness y check-in',
    keys: [
      'readiness_critical_floor',
      'readiness_drop_points',
      'readiness_drop_days',
      'readiness_max_age_days',
      'checkin_habit_min',
      'checkin_skipped_days',
    ],
  },
  { title: 'Avisos de entrenos', keys: ['missed_sessions_min', 'missed_sessions_share_pct', 'rpe_high_min', 'rpe_high_share_pct'] },
  {
    title: 'Avisos de mensajes y comunicados',
    keys: [
      'message_unanswered_hours',
      'communication_question_unanswered_days',
      'communication_task_overdue_critical_days',
      'communication_protocol_unopened_days',
    ],
  },
  { title: 'Revisiones 1:1', keys: ['review_reproposal_days'] },
];
