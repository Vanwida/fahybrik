// Pasos de «Progresar selección…» del editor de programas (mig 0237). Son
// MÉTODO del coach: NULL = defecto de shared/domain/coach/progression-steps.ts.
// GET → los efectivos · PATCH → por campo (`null` vuelve al defecto).
// Campos para Ajustes › Método: load_step_pct · sets_step · deload_volume_pct.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { loadProgressionSteps, saveProgressionSteps } from '@/lib/dashboard/programming/programs';
import { progressionStepsPatchSchema } from '@/lib/dashboard/programming/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk({ steps: await loadProgressionSteps(auth.session.coach_id) });
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = progressionStepsPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', parsed.error.issues[0]?.message ?? 'Valor no válido', 400);
  return jsonOk({ steps: await saveProgressionSteps({ coach_id: auth.session.coach_id, patch: parsed.data }) });
}
