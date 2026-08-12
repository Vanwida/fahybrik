// Local Zod mirrors for chat wire shapes. Authoritative shape is in
// shared/schema/chat.ts; this file exists for the same reason the templates
// schema is mirrored — Turbopack can't yet resolve `.js` workspace imports
// (fixed by #29 cleanup).

import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const chatAttachmentKindSchema = z.enum(['voice', 'video', 'image', 'file']);
export type ChatAttachmentKind = z.infer<typeof chatAttachmentKindSchema>;

// -----------------------------------------------------------------------------
// Reglas de adjunto — compartidas por el servidor y el navegador
// -----------------------------------------------------------------------------
//
// Viven aquí, en un módulo sin dependencias de Node, porque las necesitan LOS DOS
// lados: el servidor para rechazar lo que no acepta, y la caja de texto para
// decírselo a quien escribe ANTES de subir 40 MB y comerse un 400 sin explicación.
// Antes solo existían en `lib/chat/upload.ts`, que importa `node:fs` y por tanto
// no se puede tocar desde un componente de cliente.

/** Extensiones aceptadas por tipo de adjunto. La extensión manda sobre el MIME:
 *  el navegador miente con el MIME más de lo que miente con el nombre.
 *
 *  Audio y vídeo se quedan en formatos que reproducen LOS DOS lados. WebM/Opus
 *  se acepta en el navegador pero no en iOS, así que dejarlo entrar solo serviría
 *  para que el atleta reciba algo que no puede abrir. */
export const CHAT_ATTACHMENT_EXTENSIONS: Record<ChatAttachmentKind, readonly string[]> = {
  voice: ['m4a', 'aac', 'mp3', 'wav'],
  video: ['mp4', 'mov', 'm4v'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'avif'],
  // Lo que de verdad se pasan un entrenador y su atleta: un plan en PDF, una
  // hoja de cargas, unas notas. SVG queda FUERA a propósito: es un documento con
  // scripts dentro y se serviría desde nuestro propio dominio.
  file: ['pdf', 'txt', 'md', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
};

/** Tope de tamaño por tipo. El vídeo es el grande: un atleta grabando su técnica
 *  con el móvil en 4K se come 200 MB sin despeinarse. */
export const CHAT_ATTACHMENT_MAX_BYTES: Record<ChatAttachmentKind, number> = {
  voice: 25 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  image: 30 * 1024 * 1024,
  file: 25 * 1024 * 1024,
};

/** La extensión de un nombre de fichero, en minúsculas y sin punto. '' si no tiene. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * Qué tipo de adjunto es un fichero. Decide por EXTENSIÓN, que es lo que valida
 * el servidor, y solo cae al MIME cuando el nombre no lleva ninguna. Devuelve
 * null cuando no encaja en ningún tipo — el llamante avisa en vez de subirlo para
 * que lo rechacen luego.
 */
export function inferAttachmentKind(
  filename: string,
  mimeType: string,
): ChatAttachmentKind | null {
  const ext = fileExtension(filename);
  if (ext) {
    for (const [kind, exts] of Object.entries(CHAT_ATTACHMENT_EXTENSIONS)) {
      if (exts.includes(ext)) return kind as ChatAttachmentKind;
    }
    return null;
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'voice';
  return null;
}

/** Cómo se anuncia un mensaje que es solo adjunto — en la lista de
 *  conversaciones, en el push del iPhone y en el del dashboard. UNA fuente:
 *  si esto se duplicara, el aviso diría "[image]" en un sitio y "📷 Foto" en
 *  otro. */
export function attachmentPreview(kind: ChatAttachmentKind | null): string {
  switch (kind) {
    case 'image':
      return '📷 Foto';
    case 'video':
      return '🎥 Vídeo';
    case 'voice':
      return '🎤 Nota de voz';
    case 'file':
      return '📎 Archivo';
    default:
      return '📎 Adjunto';
  }
}

/** Humaniza una vista previa que viene de la DB. El SQL de la lista guarda el
 *  marcador crudo (`[image]`, `[voice]`…) porque un scalar subquery solo puede
 *  devolver una columna; esta función lo traduce en el borde de pintar. Un
 *  cuerpo de texto normal pasa intacto. */
export function humanPreview(raw: string): string {
  const match = /^\[(voice|video|image|file|attach)\]$/.exec(raw);
  if (!match) return raw;
  const kind = match[1] === 'attach' ? null : (match[1] as ChatAttachmentKind);
  return attachmentPreview(kind);
}

/** Quién escribió el mensaje. Columna real desde la 0082, obligatoria desde la
 *  0136 — nunca se re-deriva del `sender_user_id` (miente cuando el coach es su
 *  propio atleta). */
export const chatSenderRoleSchema = z.enum(['coach', 'athlete']);
export type ChatSenderRole = z.infer<typeof chatSenderRoleSchema>;

/** Tope de caracteres del cuerpo de un mensaje. UNO para los dos lados: el coach
 *  y el atleta escriben en el mismo hilo y no hay ninguna razón para que uno
 *  pueda escribir más largo que el otro. Es a la vez el límite del schema y el
 *  del contador de la caja de texto. */
export const CHAT_BODY_MAX = 8000;

// -----------------------------------------------------------------------------
// Contexto de mensaje (migración 0186) — ver docs/DECISIONS.md 2026-08-12
// "El chat aprende SOBRE QUÉ va el mensaje".
// -----------------------------------------------------------------------------
//
// session = el entreno (workout_assignments.id), con `sub` opcional = el
// ejercicio DENTRO de ese entreno (template_segments.id). exercise = el
// ejercicio del catálogo en abstracto (exercises.id), `sub` siempre ausente.
// race = la carrera (races.id).

export const chatContextKindSchema = z.enum(['session', 'exercise', 'race']);
export type ChatContextKind = z.infer<typeof chatContextKindSchema>;

/** Lo que el CLIENTE manda: kind + ref (+ sub solo con session). Nunca lleva
 *  `label` — lo deriva el servidor (`web/lib/chat/context.ts`), que ya carga
 *  la entidad para validar la propiedad; si el cliente lo escribiera habría
 *  dos redactores del mismo texto. */
export const chatContextInputSchema = z
  .object({
    kind: chatContextKindSchema,
    ref: z.string().min(1).max(200),
    sub: z.string().min(1).max(200).optional(),
  })
  .refine((c) => !c.sub || c.kind === 'session', {
    message: 'context.sub is only allowed when kind is "session"',
  });
export type ChatContextInput = z.infer<typeof chatContextInputSchema>;

/** Lo que viaja en la burbuja: la misma terna más la etiqueta congelada. */
export const chatContextSchema = z.object({
  kind: chatContextKindSchema,
  ref: z.string(),
  sub: z.string().nullable(),
  label: z.string(),
});
export type ChatContext = z.infer<typeof chatContextSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().max(CHAT_BODY_MAX).optional(),
    attachment_url: z.string().url().max(1000).optional(),
    attachment_kind: chatAttachmentKindSchema.optional(),
    attachment_meta: z
      .object({
        duration_ms: z.number().int().nonnegative().optional(),
        size_bytes: z.number().int().nonnegative().optional(),
        mime_type: z.string().max(120).optional(),
        width: z.number().int().nonnegative().optional(),
        height: z.number().int().nonnegative().optional(),
      })
      .optional(),
    context: chatContextInputSchema.optional(),
  })
  .refine(
    // Una referencia sin pregunta es ruido: esto YA exigía body/adjunto para
    // TODO mensaje, así que un mensaje con `context` lo hereda gratis — no
    // hace falta una segunda regla.
    (m) => (m.body && m.body.trim().length > 0) || !!m.attachment_url,
    'Message must have body text or an attachment',
  )
  .refine((m) => !m.attachment_url || !!m.attachment_kind, {
    message: 'attachment_kind is required when attachment_url is provided',
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const markReadSchema = z.object({
  up_to_message_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const messageDtoSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  sender_user_id: z.string(),
  sender_role: chatSenderRoleSchema,
  body: z.string().nullable(),
  attachment_url: z.string().nullable(),
  attachment_kind: chatAttachmentKindSchema.nullable(),
  attachment_meta: z.unknown().nullable(),
  // Presente y null cuando el mensaje no lleva contexto — nunca ausente, para
  // que un cliente que compara "tiene contexto?" no tenga que distinguir
  // undefined de null.
  context: chatContextSchema.nullable(),
  created_at: isoDateTime,
  read_at: isoDateTime.nullable(),
  edited_at: isoDateTime.nullable(),
});
export type MessageDTO = z.infer<typeof messageDtoSchema>;
