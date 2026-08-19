import 'server-only';

// Piel del club — lectura/escritura de coaches.club_skin_*.
// Scoped siempre a coach_id de la sesión. El logo no se escribe aquí.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  emptyClubSkin,
  normalizeAccentHex,
  resolveClubBrand,
  type ClubSkin,
} from '@fahybrid/shared/domain/coach/club-skin';
import { buildClubAccent } from '@fahybrid/shared/domain/coach/club-accent';
import type { ClubFicha, ClubSkinPatch } from '@fahybrid/shared/schema/coach-club-skin';
import { getClubNotifyEmail, updateClubNotifyEmail } from '@/lib/coach/club-notify';

interface ClubSkinRow {
  club_skin_name: string | null;
  club_logo_url: string | null;
  club_accent_hex: string | null;
}

function toSkin(row: ClubSkinRow | undefined): ClubSkin {
  if (!row) return emptyClubSkin();
  return {
    name: row.club_skin_name,
    logo_url: row.club_logo_url,
    accent_hex: row.club_accent_hex,
  };
}

async function withNotify(
  coach_id: bigint | number,
  skin: ClubSkin | null,
  client: Sql,
): Promise<ClubFicha | null> {
  if (!skin) return null;
  return {
    ...skin,
    notify_email: await getClubNotifyEmail(coach_id, client),
  };
}

export async function getClubSkin(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<ClubFicha | null> {
  const rows = await client<ClubSkinRow[]>`
    select club_skin_name, club_logo_url, club_accent_hex
    from coaches
    where id = ${coach_id}
    limit 1
  `;
  if (rows.length === 0) return null;
  return withNotify(coach_id, toSkin(rows[0]), client);
}

export async function updateClubSkin(
  coach_id: bigint | number,
  patch: ClubSkinPatch,
  client: Sql = defaultSql,
): Promise<ClubFicha | null> {
  const id = Number(coach_id);

  await client.begin(async (tx) => {
    if (patch.name !== undefined) {
      await tx`update coaches set club_skin_name = ${patch.name} where id = ${id}`;
    }
    if (patch.accent_hex !== undefined) {
      await tx`update coaches set club_accent_hex = ${patch.accent_hex} where id = ${id}`;
    }
    if (patch.notify_email !== undefined) {
      await updateClubNotifyEmail(id, patch.notify_email, tx as unknown as Sql);
    }
    await tx`update coaches set updated_at = now() where id = ${id}`;
  });

  return getClubSkin(id, client);
}

/** Un acento ya resuelto para UNA superficie de correo (fondo claro u oscuro). */
export interface ClubEmailAccent {
  /** Relleno de un botón/CTA. */
  fill: string;
  /** Texto ENCIMA de ese relleno. */
  on_fill: string;
  /** El acento usado como texto suelto (la etiqueta de marca). */
  text: string;
}

export interface ClubEmailSkin {
  /** Nombre a pintar como marca: el del club, o «FAHYBRID» si no ha puesto piel. */
  wordmark: string;
  /** Acento para un correo de fondo CLARO (blanco) — leads, citas, código de acceso. */
  light: ClubEmailAccent;
  /** Acento para un correo de fondo OSCURO (casi negro, estilo app) — alta, resumen de sesión. */
  dark: ClubEmailAccent;
}

/** El binario, tal cual se pinta HOY en cada plantilla sin piel — ni un byte cambia. */
const DEFAULT_EMAIL_ACCENT: ClubEmailAccent = { fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' };

/**
 * La piel de un correo para el coach `coach_id`: el nombre que hace de marca y el
 * acento ya resuelto para las dos superficies que usan las plantillas de correo.
 * Una sola pieza que reutilizan todos los envíos en vez de repetir la derivación.
 *
 * `coach_id` nulo, o un coach que no ha tocado su piel → EXACTAMENTE lo de hoy
 * (wordmark "FAHYBRID", el naranja fijo): un correo sin piel no cambia ni un byte.
 */
export async function resolveClubEmailSkin(
  coach_id: bigint | number | null | undefined,
  client: Sql = defaultSql,
): Promise<ClubEmailSkin> {
  const skin = coach_id == null ? null : await getClubSkin(coach_id, client);
  const brand = resolveClubBrand(skin ?? emptyClubSkin());
  const family = buildClubAccent(normalizeAccentHex(skin?.accent_hex));
  return {
    wordmark: brand.wordmark,
    light: family
      ? { fill: family.light.fill, on_fill: family.light.on_fill, text: family.light.text }
      : DEFAULT_EMAIL_ACCENT,
    dark: family
      ? { fill: family.dark.fill, on_fill: family.dark.on_fill, text: family.dark.text }
      : DEFAULT_EMAIL_ACCENT,
  };
}
