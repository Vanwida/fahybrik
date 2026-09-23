// PUT /api/coach/program-months/[id]/cells — guarda un LOTE de celdas de la
// rejilla del programa (una edición, un pegado, un «Progresar», un deshacer) en
// una transacción: todas o ninguna. Cada día se valida con weekDaySchema en el
// servidor; después se re-sincronizan los atletas que tienen esas semanas.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { ProgramError, writeCells } from '@/lib/dashboard/programming/programs';
import { cellsWriteSchema } from '@/lib/dashboard/programming/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const programId = Number(id);
  if (!Number.isInteger(programId) || programId <= 0) return jsonError('bad_request', 'Identificador inválido', 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = cellsWriteSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', parsed.error.issues[0]?.message ?? 'Datos no válidos', 400);

  try {
    const out = await writeCells({ coach_id: auth.session.coach_id, program_id: programId, cells: parsed.data.cells });
    return jsonOk({ saved: parsed.data.cells.length, weeks: out.weeks, synced_athletes: out.synced });
  } catch (err) {
    if (err instanceof ProgramError) return jsonError(err.code, err.message, err.status);
    return jsonError('internal_error', 'No se pudo guardar.', 500);
  }
}
