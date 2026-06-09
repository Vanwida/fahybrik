import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  createTemplate,
  listTemplatesForCoach,
  TemplateError,
} from '@/lib/dashboard/coach/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const templates = await listTemplatesForCoach(session.coach_id);
  return jsonOk({ templates });
}

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const id = await createTemplate({ coach_id: session.coach_id, payload });
    return jsonOk({ id }, 201);
  } catch (err) {
    if (err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear el entreno';
    return jsonError('internal_error', message, 500);
  }
}
