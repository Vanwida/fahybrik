// Coach profile — the SINGLE source of truth for the editable-profile shape and
// its validation. Isomorphic on purpose: only depends on zod, so the client form
// and the server route import the exact same schema + limits (DRY — one place
// defines what a valid profile is). No server-only imports here.

import { z } from 'zod';

/** Field limits, shared with the form (maxLength attrs) and the validator. */
export const COACH_PROFILE_LIMITS = {
  name: 120,
  bio: 1000,
  studio: 120,
  location: 120,
  /** Max chars per individual tag. */
  tag: 48,
  /** Max number of tags in a list. */
  tags: 20,
} as const;

// '' / whitespace-only → null, so emptying a text field CLEARS the column rather
// than storing an empty string. Length is validated on the trimmed value.
const nullableText = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((v) => {
      if (v == null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    })
    .pipe(z.string().max(max).nullable());

// Tags: trim, drop empties, de-duplicate (order preserved), then validate.
const tagList = z
  .array(z.string())
  .transform((arr) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const t = raw.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  })
  .pipe(z.array(z.string().max(COACH_PROFILE_LIMITS.tag)).max(COACH_PROFILE_LIMITS.tags));

const fullName = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1, 'El nombre es obligatorio').max(COACH_PROFILE_LIMITS.name));

/**
 * Full editable profile. Ni el email ni la FOTO están aquí:
 *   · el email lo lleva Clerk y es de sólo lectura;
 *   · la foto tiene su propio camino (`/api/perfil/foto/...`), que la guarda sólo
 *     cuando el fichero existe de verdad en Cloudflare. Aceptarla también por aquí
 *     daría DOS escritores para una columna, y el de este lado se creería cualquier
 *     URL que le mandaran.
 */
export const coachProfileSchema = z.object({
  full_name: fullName,
  bio: nullableText(COACH_PROFILE_LIMITS.bio),
  specialties: tagList,
  certifications: tagList,
  studio_name: nullableText(COACH_PROFILE_LIMITS.studio),
  location: nullableText(COACH_PROFILE_LIMITS.location),
});

export type CoachProfileInput = z.infer<typeof coachProfileSchema>;

/** PATCH payload: any subset of the editable fields. */
export const coachProfilePatchSchema = coachProfileSchema.partial();
export type CoachProfilePatch = z.infer<typeof coachProfilePatchSchema>;
