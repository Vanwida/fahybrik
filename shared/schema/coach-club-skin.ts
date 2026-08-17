// GET  /api/coach/club  → ClubSkinResponse
// PATCH /api/coach/club  ← clubSkinPatchSchema  (nombre + color; el logo tiene su ruta)

import { z } from 'zod';
import {
  CLUB_SKIN_NAME_MAX,
  normalizeClubName,
  parseAccentHex,
  type ClubSkin,
} from '../domain/coach/club-skin';

export interface ClubSkinResponse {
  club: ClubSkin;
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

/** PATCH: nombre y/o color. El logo no entra — lo escribe solo confirmar/borrar. */
export const clubSkinPatchSchema = z
  .object({
    name: nameField.optional(),
    accent_hex: accentField.optional(),
  })
  .strict();

export type ClubSkinPatch = z.infer<typeof clubSkinPatchSchema>;
