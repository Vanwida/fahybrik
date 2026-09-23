import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { ProgramError, setProgramArchived, updateProgramMeta } from '@/lib/dashboard/programming/programs';
import { programPatchSchema } from '@/lib/dashboard/programming/schemas';
import {
  deleteMonthTemplate,
  ProgramMonthError,
  programMonthUpdateSchema,
  updateMonthTemplate,
} from '@/lib/dashboard/coach/program-months';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const month_id = Number(id);
  if (!Number.isFinite(month_id) || month_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }

  const parsed = programMonthUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', parsed.error.message, 400);
  }

  try {
    const row = await updateMonthTemplate({
      coach_id: session.coach_id,
      month_id,
      patch: parsed.data,
    });
    return jsonOk({ month: row });
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el microciclo';
    return jsonError('internal_error', message, 500);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const month_id = Number(id);
  if (!Number.isFinite(month_id) || month_id <= 0) {
    return jsonError('bad_request', 'id inválido', 400);
  }

  try {
    await deleteMonthTemplate({ coach_id: session.coach_id, month_id });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof ProgramMonthError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo borrar el microciclo';
    return jsonError('internal_error', message, 500);
  }
}

// PATCH — el programa en la lista y en la cabecera del editor: nombre, nivel
// (opcional: null = «Sin nivel»), etiquetas del coach y archivar / recuperar.
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  const { id } = await ctx.params;
  const program_id = Number(id);
  if (!Number.isInteger(program_id) || program_id <= 0) return jsonError('bad_request', 'id inválido', 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body JSON inválido', 400);
  }
  const parsed = programPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', parsed.error.issues[0]?.message ?? 'Datos no válidos', 400);
  const { archived, level_id, ...rest } = parsed.data;
  try {
    if (rest.name !== undefined || rest.tags !== undefined || level_id !== undefined) {
      await updateProgramMeta({
        coach_id: session.coach_id,
        program_id,
        patch: { ...rest, ...(level_id !== undefined ? { level_id: level_id === null ? null : Number(level_id) } : {}) },
      });
    }
    if (archived !== undefined) await setProgramArchived({ coach_id: session.coach_id, program_id, archived });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof ProgramError) return jsonError(err.code, err.message, err.status);
    return jsonError('internal_error', 'No se pudo guardar el programa.', 500);
  }
}
