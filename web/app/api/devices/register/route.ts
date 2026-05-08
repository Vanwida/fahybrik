// POST /api/devices/register
//
// iOS sends an APNS device token after the user grants notification
// permissions. Body: { device_token, apns_env, bundle_id, app_version?, app_build? }.
// Auth: bearer (athlete) OR cookie (coach) — both can receive push.
//
// Idempotent on (user_id, bundle_id, apns_env, device_token). When the
// same triple is re-registered we clear last_failure (token may have
// rotated back into validity).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  device_token: z.string().regex(/^[0-9a-fA-F]{32,200}$/, 'expected hex device token'),
  apns_env: z.enum(['sandbox', 'production']),
  bundle_id: z.string().min(3).max(200),
  app_version: z.string().max(40).optional(),
  app_build: z.string().max(40).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  let user_id: bigint | null = null;

  // Athlete via bearer first.
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (athlete) user_id = athlete.user_id;
  if (!user_id) {
    const coach = await getCoachSession();
    if (coach) user_id = coach.user_id;
  }
  if (!user_id) {
    return jsonError('unauthorized', 'Coach session or athlete bearer required', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid registration', 400, parsed.error.flatten());
  }
  const { device_token, apns_env, bundle_id, app_version, app_build } = parsed.data;

  const inserted = await sql<{ id: string }[]>`
    insert into apns_push_tokens (
      user_id, device_token, apns_env, bundle_id, app_version, app_build
    ) values (
      ${user_id as unknown as number},
      ${device_token},
      ${apns_env},
      ${bundle_id},
      ${app_version ?? null},
      ${app_build ?? null}
    )
    on conflict (user_id, bundle_id, apns_env, device_token) do update
      set app_version = excluded.app_version,
          app_build = excluded.app_build,
          last_failure = null,
          failed_at = null,
          updated_at = now()
    returning id::text
  `;
  return jsonOk({ ok: true, id: inserted[0]!.id });
}
