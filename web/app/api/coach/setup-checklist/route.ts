// GET /api/coach/setup-checklist → { checklist: SetupChecklist }
//
// Los primeros pasos del coach, calculados de sus datos (lib/coach/setup-checklist).
// Lo leen la tarjeta de Hoy (primer uso), Ajustes y el «Setup n/9» de la barra.

import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const checklist = await loadSetupChecklist(auth.session.coach_id);
  if (!checklist) return jsonError('not_found', 'Coach no encontrado', 404);
  return jsonOk({ checklist });
}
