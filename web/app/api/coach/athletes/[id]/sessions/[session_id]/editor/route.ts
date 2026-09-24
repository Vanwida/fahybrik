// GET /api/coach/athletes/[id]/sessions/[session_id]/editor
//   El entreno para el panel-editor de la ficha (modelo del editor + estado).
// PATCH /api/coach/athletes/[id]/sessions/[session_id]/editor { name, segments }
//   Guarda el contenido en la instancia del atleta (la bifurca si aún compartía
//   la plantilla de biblioteca). Solo entrenos pendientes.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId } from '@/lib/coach/api-input';
import { coachActor } from '@/lib/audit/record-edit';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { WeekOpError } from '@/lib/dashboard/v2/ficha-week-ops';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';
import {
  FichaSessionError,
  loadFichaSessionEditor,
  saveFichaSession,
} from '@/lib/dashboard/v2/ficha-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const putSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre al entreno.').max(200),
    // El contenido lo valida el escritor de la instancia (athleteDayContentSchema).
    segments: z.array(z.record(z.string(), z.unknown())).max(120),
  })
  .strict();

async function ids(ctx: { params: Promise<{ id: string; session_id: string }> }) {
  const p = await ctx.params;
  return { athlete: parseRouteId(p.id, 'atleta'), session: parseRouteId(p.session_id, 'entreno') };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; session_id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const { athlete, session } = await ids(ctx);
  if (!athlete.ok) return athlete.response;
  if (!session.ok) return session.response;
  const editor = await loadFichaSessionEditor({
    coach_id: auth.session.coach_id,
    athlete_id: athlete.data,
    assignment_id: session.data,
  });
  if (!editor) return jsonError('not_found', 'Entreno no encontrado', 404);
  return jsonOk({ editor });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; session_id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const { athlete, session } = await ids(ctx);
  if (!athlete.ok) return athlete.response;
  if (!session.ok) return session.response;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  try {
    const out = await saveFichaSession({
      coach_id: auth.session.coach_id,
      athlete_id: athlete.data,
      assignment_id: session.data,
      name: body.data.name,
      segments: body.data.segments,
      actor: coachActor(auth.session),
    });
    return jsonOk({ template_id: String(out.template_id) });
  } catch (err) {
    if (err instanceof FichaSessionError || err instanceof WeekOpError || err instanceof TemplateError) {
      return jsonError(err.code, err.message, err.status);
    }
    if (err instanceof InvalidAuthoringLineError) {
      return jsonError('incomplete_lines', 'Hay líneas sin ejercicio: elige uno en cada línea.', 400);
    }
    throw err;
  }
}
