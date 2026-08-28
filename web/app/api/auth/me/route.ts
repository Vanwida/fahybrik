import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadAthleteProfileByUserId } from '@/lib/athlete/profile';
import { getClubSkin } from '@/lib/coach/club-skin';
import { deviceClubTheme } from '@fahybrid/shared/domain/coach/club-skin';
import { isPgMissingColumn } from '@/lib/dashboard/db/pg-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UserRow {
  user_id: string;
  email: string;
  apple_user_id: string | null;
}

export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) {
    return jsonError('unauthorized', 'Invalid or expired session', 401);
  }

  // Fetch user envelope fields (not part of the athlete DTO)
  const userRows = await sql<UserRow[]>`
    select
      u.id::text      as user_id,
      u.email         as email,
      u.apple_user_id as apple_user_id
    from users u
    where u.id = ${session.user_id}
      and u.deleted_at is null
    limit 1
  `;

  const userRow = userRows[0];
  if (!userRow) {
    return jsonError('not_found', 'Athlete profile not found', 404);
  }

  // session.user_id is bigint (AthleteSession.user_id)
  const athlete = await loadAthleteProfileByUserId(sql, session.user_id);
  if (!athlete) {
    return jsonError('not_found', 'Athlete profile not found', 404);
  }

  // La piel del club de su coach. Columna 0199 ausente → club vacío, no
  // 500: la sesión del atleta no depende de que Preview tenga la piel.
  let skin = null;
  if (athlete.coach_id) {
    try {
      skin = await getClubSkin(BigInt(athlete.coach_id), sql);
    } catch (err) {
      const missingSkin =
        isPgMissingColumn(err, 'club_skin_name') ||
        isPgMissingColumn(err, 'club_logo_url') ||
        isPgMissingColumn(err, 'club_accent_hex');
      if (!missingSkin) throw err;
      skin = null;
    }
  }

  return jsonOk({
    user: {
      id: userRow.user_id,
      email: userRow.email,
      apple_user_id: userRow.apple_user_id,
      role: 'athlete' as const,
    },
    athlete,
    club: deviceClubTheme(skin),
  });
}
