// Coach-side chat request schemas.
//
// Body cap is 2000 chars at the coach API layer per the W2 spec. The DB column
// (chat_messages.body) allows longer (web/iOS already produces up to 8000 in
// `web/lib/chat/schema.ts`), so this is a stricter UX constraint, not a data
// migration. Zod is the enforcement boundary — no DB CHECK added so we don't
// retroactively break older rows.

import { z } from 'zod';

export const sendCoachMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensaje vacío').max(2000, 'Máx. 2000 caracteres'),
});
export type SendCoachMessageInput = z.infer<typeof sendCoachMessageSchema>;

export const sinceQuerySchema = z
  .object({
    since: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type SinceQueryInput = z.infer<typeof sinceQuerySchema>;
