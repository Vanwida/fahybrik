import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { listWeekTemplates, ProgramWeekError, upsertWeekTemplate } from '@/lib/dashboard/coach/program-weeks';
import { programLevelSchema } from '@fahybrid/shared/schema/program-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const levelRaw = url.searchParams.get('level');
  const level = levelRaw ? programLevelSchema.safeParse(levelRaw) : null;
  if (levelRaw && !level?.success) {
    return jsonError('bad_request', 'Filtro de nivel inválido', 400);
  }

  const weeks = await listWeekTemplates({
    coach_id: session.coach_id,
    level: level?.success ? level.data : undefined,
  });
  return jsonOk({ weeks });
}

export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }

  try {
    const id = await upsertWeekTemplate({
      coach_id: session.coach_id,
      payload: body,
    });
    return jsonOk({ id }, 201);
  } catch (err) {
    if (err instanceof ProgramWeekError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear la semana';
    return jsonError('internal_error', message, 500);
  }
}
