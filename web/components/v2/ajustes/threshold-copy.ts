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
    hint: 'Por responder está en Hoy desde el primer minuto; tras estas horas, el atleta pasa a Vigilar.',
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
  renewal_alert_days: {
    label: 'Avisar de una baja',
    unit: 'días antes',
    hint: 'Quien canceló pasa a Vigilar («Se da de baja en N d») para que le escribas antes de que se vaya.',
  },
  readiness_weight_checkin: {
    label: 'Check-in',
    unit: 'de peso',
    hint: 'Cómo dice el atleta que llega: sueño, agujetas, ánimo, fatiga.',
  },
  readiness_weight_hrv: { label: 'Variabilidad (VFC)', unit: 'de peso', hint: 'La de hoy frente a su media de las semanas anteriores.' },
  readiness_weight_sleep: { label: 'Sueño', unit: 'de peso', hint: 'Horas dormidas frente a tu objetivo de sueño.' },
  readiness_weight_rhr: { label: 'FC en reposo', unit: 'de peso', hint: 'Pulsaciones en reposo del día.' },
  readiness_weight_recovery: { label: 'Recuperación del reloj', unit: 'de peso', hint: 'La puntuación de recuperación que da su reloj.' },
  readiness_sleep_target_hours: {
    label: 'Objetivo de sueño',
    unit: 'horas',
    hint: 'Dormir esto o más puntúa el sueño entero.',
  },
  readiness_adherence_floor_pct: {
    label: 'Resta si la adherencia (7 d) baja del',
    unit: '%',
    hint: 'Solo cuentan los entrenos que ya tocaban.',
  },
  readiness_adherence_penalty: {
    label: 'Cuánto resta',
    unit: 'puntos',
    hint: 'Con 0, la adherencia no toca el readiness.',
  },
  race_readiness_weight_freshness: {
    label: 'Frescura',
    unit: 'de peso',
    hint: 'El equilibrio entre la carga de las últimas semanas y la de los últimos días (TSB).',
  },
  race_readiness_weight_adherence: { label: 'Adherencia (7 d)', unit: 'de peso', hint: 'Los entrenos hechos de los que tocaban.' },
  race_readiness_weight_hrv: { label: 'Variabilidad (VFC)', unit: 'de peso', hint: 'Con 0, no hace falta reloj con VFC para dar el índice.' },
  race_readiness_weight_activity: { label: 'Actividad', unit: 'de peso', hint: 'Días con entreno en la última semana.' },
  race_readiness_tsb_span: {
    label: 'Frescura entera con TSB de',
    unit: 'o más',
    hint: 'Y cero con el mismo número en negativo. Entre medias, proporcional.',
  },
  progress_adherence_min_pct: {
    label: 'Adherencia mínima para progresar',
    unit: '%',
    hint: 'De los entrenos del programa actual que ya tocaban.',
  },
  progress_acr_high_pct: {
    label: 'Sobrecarga si la carga aguda pasa del',
    unit: '% de la crónica',
    hint: 'La carga de los últimos 7 días frente a la de las últimas 6 semanas (ACWR × 100).',
  },
  progress_acr_low_pct: {
    label: 'Infraentrenado por debajo del',
    unit: '% de la crónica',
    hint: 'Con tan poca carga reciente no hay estímulo para subir.',
  },
  progress_tsb_fatigue: {
    label: 'Demasiado fatigado con TSB por debajo de',
    unit: 'en negativo',
    hint: 'Con 25, un TSB de −26 frena la progresión.',
  },
  progress_benchmark_drop_pct: {
    label: 'Retroceso en tests desde',
    unit: '% de caída',
    hint: 'La media de sus tests del programa frente a los de antes.',
  },
  pause_budget_days: {
    label: 'Días de pausa al año',
    unit: 'días',
    hint: 'En pausa no se cobra y la plaza se guarda. Se cuentan en los últimos 12 meses.',
  },
  intake_low_sleep_max: {
    label: 'Avisar si duerme mal: sueño de',
    unit: 'de 10 o menos',
    hint: 'Lo que contesta en el cuestionario de entrada.',
  },
  intake_high_stress_min: {
    label: 'Avisar si va estresado: estrés de',
    unit: 'de 10 o más',
    hint: 'Lo que contesta en el cuestionario de entrada.',
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
  { title: 'Bajas', keys: ['renewal_alert_days'] },
  {
    title: 'Cómo se calcula el readiness',
    keys: [
      'readiness_weight_checkin',
      'readiness_weight_hrv',
      'readiness_weight_sleep',
      'readiness_weight_rhr',
      'readiness_weight_recovery',
      'readiness_sleep_target_hours',
      'readiness_adherence_floor_pct',
      'readiness_adherence_penalty',
    ],
  },
  {
    title: 'Índice de disposición',
    keys: [
      'race_readiness_weight_freshness',
      'race_readiness_weight_adherence',
      'race_readiness_weight_hrv',
      'race_readiness_weight_activity',
      'race_readiness_tsb_span',
    ],
  },
  {
    title: 'Listo para progresar',
    keys: [
      'progress_adherence_min_pct',
      'progress_acr_high_pct',
      'progress_acr_low_pct',
      'progress_tsb_fatigue',
      'progress_benchmark_drop_pct',
    ],
  },
  { title: 'Pausas', keys: ['pause_budget_days'] },
  { title: 'Cuestionario de entrada', keys: ['intake_low_sleep_max', 'intake_high_stress_min'] },
];
