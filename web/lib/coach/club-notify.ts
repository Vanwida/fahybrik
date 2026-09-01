import 'server-only';

// Buzón de avisos del club. Vacío = no se envía. Nunca lee env ni hello@.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingColumn } from '@/lib/dashboard/db/pg-errors';
import { normalizeClubNotifyEmail } from '@fahybrid/shared/domain/coach/club-notify';

const COLUMN = 'club_notify_email';

export async function getClubNotifyEmail(
  coach_id: bigint | number | null | undefined,
  client: Sql = defaultSql,
): Promise<string | null> {
  if (coach_id == null) return null;
  try {
    const rows = await client<{ club_notify_email: string | null }[]>`
      select club_notify_email
      from coaches
      where id = ${coach_id}
      limit 1
    `;
    return normalizeClubNotifyEmail(rows[0]?.club_notify_email ?? null);
  } catch (err) {
    if (isPgMissingColumn(err, COLUMN)) return null;
    throw err;
  }
}

export async function updateClubNotifyEmail(
  coach_id: bigint | number,
  notify_email: string | null,
  client: Sql = defaultSql,
): Promise<string | null> {
  const value = normalizeClubNotifyEmail(notify_email);
  try {
    await client`
      update coaches
      set club_notify_email = ${value}, updated_at = now()
      where id = ${Number(coach_id)}
    `;
  } catch (err) {
    if (isPgMissingColumn(err, COLUMN)) return null;
    throw err;
  }
  return value;
}

/** A qué cuenta llegan los avisos de ESTE club. Null = no se envía. */
export async function resolveClubNotifyEmail(
  coach_id: bigint | number | null | undefined,
  client: Sql = defaultSql,
): Promise<string | null> {
  try {
    return await getClubNotifyEmail(coach_id, client);
  } catch (err) {
    console.warn('[club-notify] no se pudo leer el correo de avisos', err);
    return null;
  }
}

/**
 * Override del cuestionario si existe; si no, el del club.
 * Vacío en los dos = no se envía.
 */
export async function resolveCoachInbox(
  coach_id: bigint | number | null | undefined,
  override?: string | null,
  client: Sql = defaultSql,
): Promise<string | null> {
  const fromOverride = normalizeClubNotifyEmail(override);
  if (fromOverride) return fromOverride;
  return resolveClubNotifyEmail(coach_id, client);
}
