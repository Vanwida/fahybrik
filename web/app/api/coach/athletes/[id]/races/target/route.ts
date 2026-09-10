import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/races/target — forbidden (FH-106).
// The athlete owns target selection; coaches see goals read-only on the panel.
export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);
  return jsonError(
    'forbidden',
    'Solo el atleta puede fijar su carrera objetivo desde la app.',
    403,
  );
}
