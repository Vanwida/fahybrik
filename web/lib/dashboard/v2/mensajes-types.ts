// Mensajes — el contrato entre el servidor y la bandeja del coach.
//
// Un hilo por atleta. Lo que decide dónde sale cada hilo es su ESTADO, no si
// está leído (plan §2, «Por responder»; informe B, M1/H9): abrir un hilo no es
// contestarlo. El estado se deriva de dos fuentes reales, sin columnas nuevas:
//   · la espera: mensajes del atleta después de la última respuesta del coach
//     (`loadAwaitingReply`, la misma lectura que el motor de señales);
//   · lo que hizo el coach con ella: «Hecho» / «Posponer» son la fila de
//     `coach_alert_overrides` de la señal `message_unanswered` — la MISMA que
//     escribe Hoy, así que marcar hecho aquí lo quita también de Hoy.
// Campos en snake_case (contrato de la API).

/** Qué pinta la bandeja de un hilo. */
export type ThreadState =
  /** El atleta escribió lo último y nadie lo ha despachado. */
  | 'por_responder'
  /** El coach lo marcó «no requiere respuesta» y el atleta no ha vuelto a escribir. */
  | 'hecho'
  /** Pospuesto: con fecha (`snoozed_until`) o hasta que el atleta vuelva a escribir. */
  | 'pospuesto'
  /** El coach escribió lo último (o no hay mensajes): nada pendiente. */
  | 'al_dia';

export const MENSAJES_FILTERS = ['por_responder', 'todas', 'sin_leer', 'hechas'] as const;
export type MensajesFilter = (typeof MENSAJES_FILTERS)[number];

export interface MensajesThread {
  thread_id: string;
  athlete_id: string;
  athlete_name: string;
  avatar_url: string | null;
  /** Etiqueta del nivel del coach («N3»), o null sin nivel. */
  level_label: string | null;
  /** El último mensaje vivo del hilo, o null si el hilo está vacío. */
  last_message: {
    /** Texto, o la etiqueta humana del adjunto («📷 Foto»). */
    preview: string;
    /** ISO 8601. */
    at: string;
    from: 'athlete' | 'coach';
  } | null;
  /** Mensajes del atleta sin abrir (contador del hilo). */
  unread: number;
  /** La espera en curso: mensajes del atleta tras la última respuesta. Null = nada. */
  waiting: {
    /** ISO del más antiguo de esos mensajes: desde cuándo espera. */
    since: string;
    /** ISO del más reciente (si vuelve a escribir tras un «hecho», es otra espera). */
    last_at: string;
    count: number;
  } | null;
  state: ThreadState;
  /** Con `state = 'pospuesto'`: hasta cuándo (ISO), o null = hasta que vuelva a escribir. */
  snoozed_until: string | null;
  /** Solo en una búsqueda: el mensaje que casa (texto), si lo que casa no es solo el nombre. */
  match: { preview: string; at: string; from: 'athlete' | 'coach' } | null;
}

export interface MensajesInbox {
  generated_at: string;
  /** Umbral del coach (horas) para que una espera pase a «vigilar» — `message_unanswered_hours`. */
  threshold_hours: number;
  /** La búsqueda aplicada (normalizada a como la escribió), o null. */
  q: string | null;
  threads: MensajesThread[];
}
