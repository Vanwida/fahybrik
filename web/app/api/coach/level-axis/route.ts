// GET   /api/coach/level-axis → { level_axis_label, effective_label, default_label }
// PATCH /api/coach/level-axis   body: { level_axis_label: string | null }
//
// Cómo llama el coach a su eje de clasificación («Nivel» por defecto). Método
// del coach (HARD RULE Nº0): null o vacío vuelve al defecto del producto.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getLevelAxisSetting, setLevelAxisLabel } from '@/lib/coach/level-axis';
import { LEVEL_AXIS_LABEL_MAX } from '@fahybrid/shared/domain/coach/level-axis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    level_axis_label: z.string().max(LEVEL_AXIS_LABEL_MAX * 2).nullable(),
  })
  .strict()
  .refine((b) => b.level_axis_label == null || b.level_axis_label.replace(/\s+/g, ' ').trim().length <= LEVEL_AXIS_LABEL_MAX, {
    message: `Como mucho ${LEVEL_AXIS_LABEL_MAX} caracteres.`,
    path: ['level_axis_label'],
  });

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getLevelAxisSetting(auth.session.coach_id));
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  return jsonOk(await setLevelAxisLabel(auth.session.coach_id, body.data.level_axis_label));
}
