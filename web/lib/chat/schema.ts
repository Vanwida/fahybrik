// Local Zod mirrors for chat wire shapes. Authoritative shape is in
// shared/schema/chat.ts; this file exists for the same reason the templates
// schema is mirrored — Turbopack can't yet resolve `.js` workspace imports
// (fixed by #29 cleanup).

import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const chatAttachmentKindSchema = z.enum(['voice', 'video', 'image', 'file']);
export type ChatAttachmentKind = z.infer<typeof chatAttachmentKindSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().max(8000).optional(),
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
  })
  .refine(
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
  body: z.string().nullable(),
  attachment_url: z.string().nullable(),
  attachment_kind: chatAttachmentKindSchema.nullable(),
  attachment_meta: z.unknown().nullable(),
  created_at: isoDateTime,
  read_at: isoDateTime.nullable(),
  edited_at: isoDateTime.nullable(),
});
export type MessageDTO = z.infer<typeof messageDtoSchema>;
