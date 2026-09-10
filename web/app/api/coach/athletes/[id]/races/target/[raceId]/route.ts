import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/coach/athletes/[id]/races/target/[raceId] — forbidden (FH-106).
// The athlete owns target removal; coaches see goals read-only on the panel.
export async function DELETE() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  return jsonError(
    'forbidden',
    'Solo el atleta puede quitar sus objetivos desde la app.',
    403,
  );
}
