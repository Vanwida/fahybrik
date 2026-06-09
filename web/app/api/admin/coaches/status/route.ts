// Admin coach approve/reject API (migration 0041).
//
// POST /api/admin/coaches/status — set an allowlist entry to approved/rejected.
//   body: { email, status: 'approved' | 'rejected' }
//
// Approving lets the coach sign in by magic-link (isCoachAllowlisted requires
// status='approved'). Rejecting revokes that. Gated by requireAdmin (404 for
// non-admins); CSRF via getAdminSession. snake_case.
//
// Email goes in the body (not the path) so addresses with reserved URL chars
// don't need escaping and the route stays simple.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireAdmin } from '@/lib/auth/require-admin';
import { setCoachStatus } from '@/lib/dashboard/admin/coaches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statusSchema = z.object({
  email: z.string().email().toLowerCase(),
  status: z.enum(['approved', 'rejected']),
});

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be valid JSON', 400);
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Email y estado válidos requeridos', 400, parsed.error.flatten());
  }

  try {
    const result = await setCoachStatus({
      email: parsed.data.email,
      status: parsed.data.status,
      reviewed_by_user_id: auth.session.user_id,
    });
    if (!result.updated) {
      return jsonError('not_found', 'Ese email no está en la lista.', 404);
    }
    return jsonOk({ coach: result });
  } catch (err) {
    console.error('[POST /api/admin/coaches/status]', err);
    return jsonError('update_failed', 'No se pudo actualizar el coach.', 500);
  }
}
