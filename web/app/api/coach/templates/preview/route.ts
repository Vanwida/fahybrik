import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { getTemplatePreviews } from '@/lib/coach/template-preview';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  ids: z.array(z.string()).max(120),
});

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Body must be JSON', 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_request', parsed.error.message, 400);
  }

  const previews = await getTemplatePreviews({
    coach_id: auth.session.coach_id,
    ids: parsed.data.ids,
  });

  return jsonOk({ previews });
}
