// Admin coach administration API (migrations 0040 + 0041).
//
// GET  /api/admin/coaches — list every allowlist entry (status + signed-in)
// POST /api/admin/coaches — admin adds a coach directly, as `approved`
//
// Gated by requireAdmin (server-side, 404s for non-admins). CSRF is enforced by
// getAdminSession (rejects cross-origin cookie requests). snake_case.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireAdmin } from '@/lib/auth/require-admin';
import { addApprovedCoach, listCoachRequests } from '@/lib/dashboard/admin/coaches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const addCoachSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const coaches = await listCoachRequests();
    return jsonOk({ coaches });
  } catch (err) {
    console.error('[GET /api/admin/coaches]', err);
    return jsonError('list_failed', 'No se pudieron cargar los coaches.', 500);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  const parsed = addCoachSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Email válido requerido', 400, parsed.error.flatten());
  }

  try {
    const result = await addApprovedCoach({
      email: parsed.data.email,
      reviewed_by_user_id: auth.session.user_id,
    });
    // 201 when newly added, 200 when it was already on the allowlist (idempotent).
    return jsonOk({ coach: result }, result.created ? 201 : 200);
  } catch (err) {
    console.error('[POST /api/admin/coaches]', err);
    return jsonError('create_failed', 'No se pudo crear el coach.', 500);
  }
}
