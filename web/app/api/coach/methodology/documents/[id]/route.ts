// GET    /api/coach/methodology/documents/[id] — detail with chunks
// DELETE /api/coach/methodology/documents/[id] — soft delete (archived_at)

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { archiveDocument, getDocumentDetail } from '@/lib/rag/repository';

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

  const detail = await getDocumentDetail({
    coach_id: auth.session.coach_id,
    document_id,
  });
  if (!detail) {
    return jsonError('not_found', 'Document not found', 404);
  }
  return jsonOk({ document: detail });
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

  const result = await archiveDocument({
    coach_id: auth.session.coach_id,
    document_id,
  });
  if (!result.archived) {
    return jsonError('not_found', 'Document not found or already archived', 404);
  }
  return jsonOk({ archived: true });
}
