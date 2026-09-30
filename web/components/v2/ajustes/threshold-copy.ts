// Cómo se dice cada umbral en Ajustes › Método. Las claves, límites y defectos
// son de `COACH_THRESHOLD_SPEC` (shared/domain/coach/signal-thresholds.ts);
// aquí solo vive el castellano y el orden de las secciones.

import type { CoachThresholdKey } from '@fahybrid/shared/domain/coach/signal-thresholds';

export interface ThresholdCopy {
  label: string;
  /** La unidad, ya en palabras, tras el número. Vacía en un interruptor o una lista. */
  unit: string;
  /** Una línea: qué cambia si lo mueves. */
  hint: string;
  /** Solo en una lista corta (`unit: 'sentido'`): las palabras de cada posición, en orden. */
  options?: readonly string[];
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
  wrist_slack_pace_s: {
    label: 'Margen de ritmo',
    unit: 's/km',
    hint: 'Cuánto se puede salir de la banda de ritmo antes de contar como fuera.',
  },
  wrist_slack_hr_bpm: {
    label: 'Margen de pulso',
    unit: 'pulsaciones',
    hint: 'Cuánto se puede salir de la zona o del pulso pedido antes de contar como fuera.',
  },
  wrist_slack_split500_s: {
    label: 'Margen en remo y ski',
    unit: 's/500 m',
    hint: 'Cuánto se puede salir del ritmo pedido en la máquina antes de contar como fuera.',
  },
  wrist_slack_watts: { label: 'Margen de vatios', unit: 'W', hint: 'Cuánto se puede salir de la potencia pedida antes de contar como fuera.' },
  wrist_slack_cadence_spm: {
    label: 'Margen de cadencia',
    unit: 'pasos/min',
    hint: 'Cuánto se puede salir de la cadencia pedida antes de contar como fuera.',
  },
  wrist_alert_confirm_s: {
    label: 'Fuera de banda antes del primer aviso',
    unit: 'segundos',
    hint: 'Segundos seguidos fuera hasta que el reloj vibra. Con 0, vibra al instante.',
  },
  wrist_alert_gap_s: {
    label: 'Entre un aviso y el siguiente',
    unit: 'segundos',
    hint: 'Lo mínimo que espera el reloj antes de volver a avisar en el mismo paso.',
  },
  wrist_alert_zone_grace_s: {
    label: 'Gracia al empezar un paso a zona',
    unit: 'segundos',
    hint: 'El pulso tarda en subir: en estos segundos no le dice «aprieta».',
  },
  wrist_alert_in_warmup: {
    label: 'Avisar en el calentamiento',
    unit: '',
    hint: 'Apagado, el calentamiento no vibra aunque el ritmo o el pulso se salgan.',
  },
  wrist_alert_in_recovery: {
    label: 'Avisar en la recuperación',
    unit: '',
    hint: 'Apagado, un trote entre series no vibra aunque el ritmo o el pulso se salgan.',
  },
  wrist_alert_continuous_zone: {
    label: 'Rodaje a zona: cuándo avisar',
    unit: '',
    hint: 'Si el tramo no trae su propio aviso. Un tope de pulso avisa siempre solo por arriba.',
    options: ['Nunca', 'Solo por arriba', 'Por arriba y por abajo'],
  },
  wrist_prewarn_s: {
    label: 'Preaviso antes del final de un paso',
    unit: 'segundos',
    hint: 'En pasos medidos por tiempo. Con 0, sin preaviso.',
  },
  wrist_prewarn_m: {
    label: 'Preaviso antes del final de un paso',
    unit: 'metros',
    hint: 'En pasos medidos por distancia. Con 0, sin preaviso.',
  },
  wrist_prewarn_min_step_s: {
    label: 'Sin preaviso en pasos de menos de',
    unit: 'segundos',
    hint: 'Tiene que ser al menos el doble del preaviso: si no, el aviso sería la mitad del paso.',
  },
  wrist_auto_lap_m: {
    label: 'Vuelta automática cada',
    unit: 'metros',
    hint: 'El reloj cierra una vuelta y dice el tiempo. Con 0, apagada; si no, desde 100 m.',
  },
  wrist_auto_lap_rodaje: { label: 'Vuelta automática en los rodajes', unit: '', hint: 'Correr continuo a ritmo suave.' },
  wrist_auto_lap_tirada: { label: 'Vuelta automática en las tiradas', unit: '', hint: 'Rodajes largos.' },
  wrist_auto_lap_tempo: { label: 'Vuelta automática en los tempos', unit: '', hint: 'Correr continuo a ritmo fuerte.' },
  wrist_auto_lap_progresivo: { label: 'Vuelta automática en los progresivos', unit: '', hint: 'Tramos que suben de ritmo.' },
  wrist_auto_lap_carrera: { label: 'Vuelta automática en las carreras', unit: '', hint: 'El parcial de cada kilómetro.' },
  wrist_long_run_min: {
    label: 'Una tirada empieza en',
    unit: 'minutos',
    hint: 'Un rodaje de esta duración o más se llama tirada.',
  },
  wrist_long_run_km: {
    label: 'O una tirada empieza en',
    unit: 'km',
    hint: 'Un rodaje de esta distancia o más se llama tirada.',
  },
  wrist_stride_max_s: {
    label: 'Un stride dura como mucho',
    unit: 'segundos',
    hint: 'Una serie más corta que esto, dentro de un repetir, se llama stride y no serie.',
  },
  wrist_gate_manual: {
    label: 'Empezar las series solo cuando el atleta pulse',
    unit: '',
    hint: 'Apagado, del calentamiento a las series se pasa solo, con su preaviso.',
  },
  wrist_short_rep_done_pct: {
    label: 'Una serie cortada a mano cuenta como hecha desde el',
    unit: '% de lo pedido',
    hint: 'Si el atleta la cierra antes, no cuenta como hecha.',
  },
  wrist_idle_save_min: {
    label: 'Guardar sola una sesión ya acabada tras',
    unit: 'minutos quieto',
    hint: 'Para que nadie se deje el reloj grabando un enfriamiento que ya terminó.',
  },
};

/** Lo que una sección lleva además de sus números: hoy, las palabras del RPE del reloj. */
export type ThresholdSectionExtra = 'palabras_rpe';

export const THRESHOLD_SECTIONS: ReadonlyArray<{
  title: string;
  keys: CoachThresholdKey[];
  extra?: ThresholdSectionExtra;
}> = [
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
  {
    title: 'Reloj al correr: cuándo avisa',
    keys: [
      'wrist_slack_pace_s',
      'wrist_slack_hr_bpm',
      'wrist_slack_split500_s',
      'wrist_slack_watts',
      'wrist_slack_cadence_spm',
      'wrist_alert_confirm_s',
      'wrist_alert_gap_s',
      'wrist_alert_zone_grace_s',
      'wrist_alert_in_warmup',
      'wrist_alert_in_recovery',
      'wrist_alert_continuous_zone',
    ],
  },
  { title: 'Reloj: el final de cada paso', keys: ['wrist_prewarn_s', 'wrist_prewarn_m', 'wrist_prewarn_min_step_s'] },
  {
    title: 'Reloj: vueltas y nombres al correr',
    keys: [
      'wrist_auto_lap_m',
      'wrist_auto_lap_rodaje',
      'wrist_auto_lap_tirada',
      'wrist_auto_lap_tempo',
      'wrist_auto_lap_progresivo',
      'wrist_auto_lap_carrera',
      'wrist_long_run_min',
      'wrist_long_run_km',
      'wrist_stride_max_s',
      'wrist_gate_manual',
    ],
  },
  {
    title: 'Reloj: al terminar',
    keys: ['wrist_short_rep_done_pct', 'wrist_idle_save_min'],
    extra: 'palabras_rpe',
  },
];
