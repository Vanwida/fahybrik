// GET    /api/coach/papers/[id] — detalle de UN paper de este coach.
// DELETE /api/coach/papers/[id] — archivo (soft delete). Un doc de método da 404.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { archivePaper, getPaperDetail } from '@/lib/rag/papers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(param: string): bigint | null {
  if (!/^\d+$/.test(param)) return null;
  try {
    return BigInt(param);
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const document_id = parseId(id);
  if (document_id === null) {
    return jsonError('invalid_id', 'Invalid document id', 400);
  }

  const paper = await getPaperDetail({
    coach_id: auth.session.coach_id,
    document_id,
  });
  if (!paper) {
    return jsonError('not_found', 'Paper not found', 404);
  }
  return jsonOk({ paper });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const document_id = parseId(id);
  if (document_id === null) {
    return jsonError('invalid_id', 'Invalid document id', 400);
  }

  const result = await archivePaper({
    coach_id: auth.session.coach_id,
    document_id,
  });
  if (!result.archived) {
    return jsonError('not_found', 'Paper not found or already archived', 404);
  }
  return jsonOk({ archived: true });
}
