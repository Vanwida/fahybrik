// POST /api/devices/test-push
//
// Manual smoke-test: fire a real push to a user's registered devices over BOTH
// channels — APNS (iPhone) and Web Push (dashboard instalado) — so the full
// pipeline can be confirmed end-to-end desde la propia instancia desplegada.
// NOT public — a coach session is required (Clerk auth → DB authz). A coach may
// push to THEIR OWN devices (default, no body); targeting another user_id
// requires the admin role, so a plain coach can't push to arbitrary users.
//
// Body (optional): { user_id?: number | string }. Omitted → push to caller.
//
// Until the channel creds are set (APNS .p8 / claves VAPID), each send no-ops
// (attempted: 0). The response surfaces `*_configured` so that's visible, not
// silent.

import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadApnsConfig, smokeTestPush } from '@/lib/push/apns';
import { loadVapidConfig, sendWebPush } from '@/lib/push/webpush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    // bigint user id, accepted as a positive-integer string or number.
    user_id: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => (v == null ? undefined : String(v)))
      .refine(
        (v) => v === undefined || /^[0-9]+$/.test(v),
        'user_id must be a positive integer',
      ),
  })
  .strict();

export async function POST(req: Request): Promise<Response> {
  const coach = await getCoachSession();
  if (!coach) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }

  // Body is optional — an empty body means "push to me".
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      return jsonError('invalid_json', 'Request body must be JSON', 400);
    }
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid test-push request', 400, parsed.error.flatten());
  }

  // Default target = the caller. Targeting anyone else requires admin.
  let target_user_id = coach.user_id;
  if (parsed.data.user_id !== undefined) {
    const requested = BigInt(parsed.data.user_id);
    if (requested !== coach.user_id && !coach.roles.includes('admin')) {
      return jsonError('forbidden', 'Targeting another user requires the admin role', 403);
    }
    target_user_id = requested;
  }

  const apns = loadApnsConfig();
  const vapid = loadVapidConfig();
  const result = await smokeTestPush({ sql, user_id: target_user_id });
  const web_result = await sendWebPush({
    sql,
    user_id: target_user_id,
    payload: {
      title: 'FAHYBRID',
      body: 'Aviso de prueba: este dispositivo recibe.',
      url: '/hoy',
      tag: 'system',
      type: 'system',
    },
  });

  return jsonOk({
    ok: true,
    // Until the .p8 key is provisioned this is false and the push no-ops.
    apns_configured: apns.ok,
    ...(apns.ok ? {} : { apns_missing: apns.missing }),
    web_push_configured: vapid.ok,
    ...(vapid.ok ? {} : { web_push_missing: vapid.missing }),
    target_user_id: target_user_id.toString(),
    result,
    web_result,
  });
}
