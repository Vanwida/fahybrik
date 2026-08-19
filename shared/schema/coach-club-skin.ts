// GET  /api/coach/club  → ClubSkinResponse
// PATCH /api/coach/club  ← clubSkinPatchSchema  (nombre, color y/o correo de avisos; el logo tiene su ruta)

import { z } from 'zod';
import {
  CLUB_SKIN_NAME_MAX,
  normalizeClubName,
  parseAccentHex,
  type ClubSkin,
} from '../domain/coach/club-skin';
import {
  normalizeClubNotifyEmail,
  validateClubNotifyEmail,
} from '../domain/coach/club-notify';

/** Ficha del club: piel + correo de avisos (el correo no es piel). */
export interface ClubFicha extends ClubSkin {
  notify_email: string | null;
}

export interface ClubSkinResponse {
  club: ClubFicha;
}

const nameField = z
  .union([z.string(), z.null()])
  .transform((v) => normalizeClubName(v))
  .pipe(z.string().max(CLUB_SKIN_NAME_MAX).nullable());

const accentField = z.union([z.string(), z.null()]).transform((v, ctx) => {
  const parsed = parseAccentHex(v);
  if (!parsed.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'El color tiene que ser #RRGGBB.',
    });
    return z.NEVER;
  }
  return parsed.hex;
});

const notifyEmailField = z.union([z.string(), z.null()]).transform((v, ctx) => {
  const issues = validateClubNotifyEmail(v);
  if (issues.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issues[0]?.message ?? 'Ese correo no vale.',
    });
    return z.NEVER;
  }
  return normalizeClubNotifyEmail(v);
});

/** PATCH: nombre, color y/o correo de avisos. El logo no entra — otro escritor. */
export const clubSkinPatchSchema = z
  .object({
    name: nameField.optional(),
    accent_hex: accentField.optional(),
    notify_email: notifyEmailField.optional(),
  })
  .strict();

export type ClubSkinPatch = z.infer<typeof clubSkinPatchSchema>;
