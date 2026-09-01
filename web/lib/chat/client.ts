// Cliente de chat del navegador. Es la ÚNICA puerta del dashboard a la API de
// chat, y llama exactamente a los mismos endpoints que la app del atleta: mismo
// hilo, mismo DTO, mismas reglas. Antes el dashboard tenía su propia familia de
// rutas (`/api/coach/chat/*`) que no publicaba al canal en vivo ni sabía de
// adjuntos, y de ahí salían todos los fallos del chat.
//
// Todo se identifica por `athlete_id`: el hilo entre un coach y un atleta es
// único, así que no hace falta pasear el id del hilo por la interfaz. La sesión
// del coach viaja en la cookie (`credentials: 'include'`).
//
// Módulo puro de navegador: sin imports de servidor, para que lo pueda usar un
// componente de cliente.

import {
  CHAT_ATTACHMENT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_BODY_MAX,
  inferAttachmentKind,
  type ChatAttachmentKind,
  type ChatContext,
  type ChatContextInput,
  type MessageDTO,
} from './schema';

export type { MessageDTO, ChatAttachmentKind, ChatContext, ChatContextInput };
// Se reexporta para que las pantallas tengan UNA sola puerta al chat y no tengan
// que saber que el tope de caracteres vive en el módulo de schemas.
export { CHAT_BODY_MAX };

/** Metadatos del adjunto que el emisor conoce y el receptor agradece: duración
 *  para pintar un reproductor con su tiempo, tamaño para el chip de fichero, y
 *  dimensiones para reservar el hueco de la imagen sin que salte el scroll. */
export interface ChatAttachmentMeta {
  duration_ms?: number;
  size_bytes?: number;
  mime_type?: string;
  width?: number;
  height?: number;
}

/** Un fallo con un mensaje ya escrito para enseñar en pantalla. */
export class ChatError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}

const basePath = (athleteId: string) => `/api/chat/threads/${encodeURIComponent(athleteId)}`;

async function readError(res: Response, fallback: string): Promise<ChatError> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return new ChatError(body.error ?? `http_${res.status}`, body.message ?? fallback);
  } catch {
    return new ChatError(`http_${res.status}`, fallback);
  }
}

/**
 * El último tramo de la conversación, del MÁS VIEJO al más nuevo.
 *
 * La API pagina hacia atrás (devuelve del más nuevo al más viejo, y un cursor
 * para seguir tirando hacia el pasado). Se le da la vuelta aquí, una sola vez,
 * para que ninguna pantalla tenga que acordarse de hacerlo.
 */
export async function fetchMessages(
  athleteId: string,
  opts: { limit?: number; before?: string | null } = {},
): Promise<{ messages: MessageDTO[]; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 50) });
  if (opts.before) params.set('cursor', opts.before);
  const res = await fetch(`${basePath(athleteId)}/messages?${params}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw await readError(res, 'No se pudo cargar la conversación.');
  const body = (await res.json()) as { messages: MessageDTO[]; next_cursor: string | null };
  return { messages: body.messages.slice().reverse(), next_cursor: body.next_cursor };
}

export async function sendMessage(
  athleteId: string,
  input: {
    body?: string;
    attachment_url?: string;
    attachment_kind?: ChatAttachmentKind;
    attachment_meta?: ChatAttachmentMeta;
    // Sobre qué va el mensaje — SIN `label`, la deriva el servidor (ver
    // docs/DECISIONS.md 2026-08-12). Ausente = sin contexto, igual que hoy.
    context?: ChatContextInput;
  },
): Promise<MessageDTO> {
  const res = await fetch(`${basePath(athleteId)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await readError(res, 'No se pudo enviar el mensaje.');
  const body = (await res.json()) as { message: MessageDTO };
  return body.message;
}

/** Sella como leídos los mensajes del otro lado hasta `messageId`. Best-effort:
 *  un acuse perdido se recupera al volver a abrir el hilo, así que nunca se le
 *  enseña al coach un error por esto. */
export async function markRead(athleteId: string, messageId: string): Promise<void> {
  try {
    await fetch(`${basePath(athleteId)}/read`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ up_to_message_id: messageId }),
    });
  } catch {
    // Silencio a propósito.
  }
}

/** Borra un mensaje PROPIO. El servidor comprueba la autoría, así que esto nunca
 *  puede llevarse por delante un mensaje del atleta. */
export async function deleteMessage(athleteId: string, messageId: string): Promise<void> {
  const res = await fetch(
    `${basePath(athleteId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw await readError(res, 'No se pudo borrar el mensaje.');
}

// -----------------------------------------------------------------------------
// Adjuntos
// -----------------------------------------------------------------------------

/** Un adjunto elegido pero aún sin enviar: se ve en pantalla antes de salir, con
 *  su miniatura y su botón de descartar. */
export interface PendingAttachment {
  file: File;
  kind: ChatAttachmentKind;
  /** object URL local para la vista previa. Lo revoca quien lo creó. */
  preview_url: string;
  meta: ChatAttachmentMeta;
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const KIND_LABEL: Record<ChatAttachmentKind, string> = {
  image: 'imagen',
  video: 'vídeo',
  voice: 'audio',
  file: 'archivo',
};

/**
 * Valida un fichero elegido contra las MISMAS reglas que aplica el servidor y lo
 * convierte en un adjunto pendiente. Lanza un `ChatError` con el motivo escrito
 * para pantalla: sin esto, un .xlsx se subiría entero para morir en un 400 mudo.
 */
export function prepareAttachment(file: File): PendingAttachment {
  const kind = inferAttachmentKind(file.name, file.type);
  if (!kind) {
    const all = Object.values(CHAT_ATTACHMENT_EXTENSIONS).flat().join(', ');
    throw new ChatError(
      'invalid_extension',
      `No se puede enviar ese tipo de archivo. Se aceptan: ${all}.`,
    );
  }
  const max = CHAT_ATTACHMENT_MAX_BYTES[kind];
  if (file.size > max) {
    throw new ChatError(
      'too_large',
      `Ese ${KIND_LABEL[kind]} pesa ${humanBytes(file.size)} y el máximo son ${humanBytes(max)}.`,
    );
  }
  return {
    file,
    kind,
    preview_url: URL.createObjectURL(file),
    meta: { size_bytes: file.size, mime_type: file.type || undefined },
  };
}

/** Sube el fichero y devuelve la URL con la que se referencia en el mensaje.
 *  Dos pasos: el servidor valida y prefirma (`/api/chat/upload-url`), y los
 *  bytes van con un PUT DIRECTO al almacén — por nuestra API no caben (la
 *  plataforma corta el body en ~4.5 MB). El `athlete_id` decide la carpeta;
 *  el servidor comprueba que sea de la cohorte. */
export async function uploadAttachment(
  athleteId: string,
  pending: PendingAttachment,
): Promise<{ url: string; mime_type: string; size_bytes: number }> {
  const res = await fetch('/api/chat/upload-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: pending.kind,
      filename: pending.file.name,
      mime_type: pending.file.type || undefined,
      size_bytes: pending.file.size,
      athlete_id: athleteId,
    }),
  });
  if (!res.ok) throw await readError(res, 'No se pudo preparar la subida.');
  const target = (await res.json()) as {
    upload_url: string;
    attachment_url: string;
    content_type: string;
  };

  // El Content-Type debe ser EXACTAMENTE el firmado, o el almacén rechaza el PUT.
  const put = await fetch(target.upload_url, {
    method: 'PUT',
    headers: { 'content-type': target.content_type },
    body: pending.file,
  });
  if (!put.ok) {
    throw new ChatError(
      'upload_failed',
      'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.',
    );
  }
  return { url: target.attachment_url, mime_type: target.content_type, size_bytes: pending.file.size };
}

/** El nombre legible de un adjunto, sacado de su URL. Los ficheros se guardan con
 *  un uuid, así que cuando no hay nombre original se cae al tipo. */
export function attachmentLabel(msg: MessageDTO): string {
  const meta = (msg.attachment_meta ?? {}) as ChatAttachmentMeta & { filename?: string };
  if (typeof meta.filename === 'string' && meta.filename.length > 0) return meta.filename;
  const kind = msg.attachment_kind;
  return kind ? KIND_LABEL[kind] : 'Adjunto';
}
