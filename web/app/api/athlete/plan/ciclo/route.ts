import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { resolvePlanPath, resolveEndPolicy } from '@/lib/plan/camino';
import { getNextRace, getTargetRace } from '@/lib/races/next-race';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/athlete/plan/ciclo — el ciclo del atleta, espina-first, para la
// pantalla de plan-ciclo del móvil (propuesta en
// web/components/design-twin/screens/plan-ciclo/). Sin query params: siempre
// EL atleta autenticado, siempre hoy. Contrato fijado:
//
//   camino      → PlanPathDTO (shared/domain/plan-path.ts) o null sin ningún
//                 tramo asignado. Misma espina que ya usa la sección «camino»
//                 de una nota del coach (lib/plan/camino.ts) — no se reescribe.
//   al_acabar   → program_sequences.end_policy VERBATIM ('repeat' | 'level_up'
//                 | 'stop', el CHECK real de la 0059; solo 'repeat' existe hoy
//                 en producción, pero el contrato no lo asume) cuando el atleta
//                 camina una secuencia ACTIVA; null si no camina ninguna.
//   carrera     → la carrera objetivo (getTargetRace), y si no hay ninguna
//                 marcada objetivo, la próxima con fecha >= hoy (getNextRace,
//                 el MISMO helper que ya usa GET /api/athlete/plan/week);
//                 null sin ninguna carrera futura.
//
// AUTH: bearer del atleta, igual que el resto de /api/athlete/* (copiado de
// app/api/athlete/plan/week/route.ts).
export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const [camino, al_acabar, target_race, next_race] = await Promise.all([
    resolvePlanPath({ athlete_id: auth.athlete_id }),
    resolveEndPolicy({ athlete_id: auth.athlete_id }),
    getTargetRace(auth.athlete_id),
    getNextRace(auth.athlete_id),
  ]);

  // Objetivo primero; si no hay ninguna marcada, la próxima que caiga en el
  // calendario. Puede ser la MISMA carrera (getTargetRace ⊆ getNextRace).
  const race = target_race ?? next_race;
  const carrera = race
    ? { name: race.name, date: race.race_date, goal_time_s: race.goal_time_seconds }
    : null;

  return jsonOk({ camino, al_acabar, carrera });
}
