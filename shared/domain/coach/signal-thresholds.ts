// @fahybrid/shared/domain/coach/signal-thresholds — los umbrales de señal que
// el COACH edita.
//
// POR QUÉ EXISTE ESTE FICHERO (HARD RULE Nº0: mecanismo vs método)
// ---------------------------------------------------------------
// Que exista una señal «pregunta sin responder» es MECANISMO: lo decide el
// modelo del comunicado (una pregunta se cierra respondiendo, y mientras no se
// responda reclama). Cuántos días de silencio hacen falta antes de molestar al
// coach con ella es MÉTODO: un entrenador con veinte atletas quiere saberlo al
// día siguiente y otro con cien no quiere ruido hasta la semana. La pregunta que
// decide («¿otro entrenador competente lo haría distinto?») da que sí, así que
// estos números nacen como DATO con un valor por defecto, nunca como `const`.
//
// El resto de umbrales del motor (`web/lib/coach/signal-config.ts`) siguen hoy
// siendo constantes del sistema. Este módulo es el SITIO donde se editan los que
// ya lo son, y el camino por el que los demás se moverán cuando toque: el
// resolutor (`web/lib/coach/signal-thresholds.ts`) mezcla la fila del coach
// sobre los defectos y entrega el `EffectiveThresholds` que reciben los
// evaluadores — que es exactamente para lo que ese tipo se llama «effective».
//
// Puro y sin base de datos, como el resto de `shared/domain`.

/**
 * Una fila por coach (`coach_signal_thresholds`, único por `coach_id`). Todos
 * los campos son obligatorios: guardar reemplaza el conjunto entero, sin parche
 * por campo, igual que `coach_guidance` y `coach_import_defaults`.
 */
export interface CoachSignalThresholds {
  /**
   * Días que una pregunta publicada puede pasar sin respuesta antes de que el
   * atleta suba a /hoy. Cuenta desde que se publicó, no desde que la vio: un
   * atleta que abre y no contesta es exactamente el caso que hay que ver.
   */
  communication_question_unanswered_days: number;
  /**
   * Días de retraso a partir de los cuales una tarea vencida deja de ser
   * «vigilar» y pasa a «crítico». Vencer ya dispara la señal al día siguiente de
   * la fecha límite (eso es el modelo, no una preferencia); lo que el coach
   * decide es cuándo el retraso deja de ser un despiste.
   */
  communication_task_overdue_critical_days: number;
  /**
   * Días de antelación con los que un protocolo sin abrir empieza a reclamar,
   * medidos hasta la fecha del evento al que cuelga (carrera o test). Un
   * protocolo de día de carrera que nadie ha abierto sirve de poco si se avisa
   * la víspera, y molesta si se avisa un mes antes.
   */
  communication_protocol_unopened_days: number;
}

// ── Límites (con nombre, no mágicos — se repiten como CHECKs en la tabla) ─────

/** Por debajo de un día no hay «espera»: sería la señal disparándose al publicar. */
export const COACH_SIGNAL_THRESHOLD_MIN_DAYS = 1;
/**
 * Un mes de silencio ya no es un umbral, es no querer la señal. Para eso está
 * silenciarla en la propia tarjeta (`coach_alert_overrides`), que es donde el
 * «no me lo enseñes» tiene su sitio.
 */
export const COACH_SIGNAL_THRESHOLD_MAX_DAYS = 30;

/**
 * Los defectos del sistema, servidos mientras el coach no haya escrito su fila.
 * Genéricos y sin nombre propio: son el punto de partida más común, nunca los
 * números de una metodología concreta.
 *
 *   - 2 días sin responder una pregunta: uno solo cabe en un día ocupado o un
 *     viaje; dos ya es que no la va a contestar sin que se la recuerden.
 *   - 3 días de retraso para que una tarea pase a crítica: un fin de semana
 *     entero cabe dentro, así que lo que queda fuera es abandono, no despiste.
 *   - 3 días de antelación para un protocolo sin abrir: da margen a leerlo y a
 *     preguntar lo que no se entienda antes del día del evento.
 */
export const DEFAULT_COACH_SIGNAL_THRESHOLDS: CoachSignalThresholds = {
  communication_question_unanswered_days: 2,
  communication_task_overdue_critical_days: 3,
  communication_protocol_unopened_days: 3,
};

/** Los defectos, en copia fresca (quien llama puede esparcir y mutar). */
export function defaultCoachSignalThresholds(): CoachSignalThresholds {
  return { ...DEFAULT_COACH_SIGNAL_THRESHOLDS };
}

/** Las claves editables, para recorrerlas sin repetir la lista a mano. */
export const COACH_SIGNAL_THRESHOLD_KEYS = Object.keys(
  DEFAULT_COACH_SIGNAL_THRESHOLDS,
) as Array<keyof CoachSignalThresholds>;
