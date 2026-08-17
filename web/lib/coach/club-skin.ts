import 'server-only';

// Piel del club — lectura/escritura de coaches.club_skin_*.
// Scoped siempre a coach_id de la sesión. El logo no se escribe aquí.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { emptyClubSkin, type ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import type { ClubSkinPatch } from '@fahybrid/shared/schema/coach-club-skin';

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

export async function getClubSkin(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<ClubSkin | null> {
  const rows = await client<ClubSkinRow[]>`
    select club_skin_name, club_logo_url, club_accent_hex
    from coaches
    where id = ${coach_id}
    limit 1
  `;
  if (rows.length === 0) return null;
  return toSkin(rows[0]);
}

export async function updateClubSkin(
  coach_id: bigint | number,
  patch: ClubSkinPatch,
  client: Sql = defaultSql,
): Promise<ClubSkin | null> {
  const id = Number(coach_id);

  await client.begin(async (tx) => {
    if (patch.name !== undefined) {
      await tx`update coaches set club_skin_name = ${patch.name} where id = ${id}`;
    }
    if (patch.accent_hex !== undefined) {
      await tx`update coaches set club_accent_hex = ${patch.accent_hex} where id = ${id}`;
    }
    await tx`update coaches set updated_at = now() where id = ${id}`;
  });

  return getClubSkin(id, client);
}
