import 'server-only';

// EL ALTA PONE EN PIE EL PLAN — los dos caminos que puede tomar `commitIntake`
// (`intake.ts`) cuando el coach firma un alta, y nada más. Vive fuera de
// `intake.ts` porque aquel módulo ya es el commit entero (perfil, sugerencias,
// avisos, bienvenida) y esto es otra cosa: qué microciclos existen después.
//
//   · MODO COMPARTIDO (`shared`) — ya no vive aquí: el alta asigna su grupo o un
//     programa por el motor de asignar a varios (`intake-commit.ts`). El viejo
//     «primer microciclo de la biblioteca» (el de id más bajo, sin elegir) se
//     retiró: DECISIONS 2026-09-23 «El alta dice qué plan recibe».
//   · MODO PERSONAL (`personal`) — `materializePersonalChain` crea la cadena de
//     tramos que el coach escribió en el alta como microciclos PROPIOS de ese
//     atleta, encadenados sin hueco.
//
// Los tramos personales nacen en BORRADOR PRIVADO del coach
// (`markWeeksAsPrivateDraft`): están vacíos hasta que él los escriba.

import type { Sql } from '@/lib/db';
import { IntakeError } from './intake-error';
import type { IntakeBlockSpec } from './intake-schema';

// Number of days per microcycle (week). Local mirror of the assign-draft route
// constant so first-block weeks are stepped identically.
const DAYS_PER_WEEK = 7;

// =============================================================================
// Cadena de microciclos PERSONALES (camino «plan solo para él»)
// =============================================================================

export type PersonalChainResult = {
  tramos: Array<{
    month_template_id: string;
    name: string;
    week_count: number;
    start_date: string;
    end_date: string;
  }>;
  /** athlete_month_assignments.id del PRIMER tramo de la cadena. */
  first_assignment_id: string | null;
  /** Lunes de todas las semanas de la cadena, en orden. */
  week_starts: string[];
};

/**
 * Crea la cadena de microciclos personales que el coach escribió en el alta.
 *
 * NO hay maquinaria nueva aquí: cada tramo se crea con `addPersonalTramoToChain`
 * (`personal-plan-chain-mutations`), exactamente la misma operación que usa el
 * panel «Añadir microciclo» de la ficha — contenedor propio del atleta
 * (`insertEmptyPersonalMonthTemplate`), materialización con fecha, detach de la
 * secuencia si la hubiera, y su fila de auditoría dentro de la transacción. Lo
 * único que el alta aporta es DÓNDE empieza el primero: un atleta recién dado de
 * alta no tiene cadena a la que encadenar, así que arranca el lunes de esta
 * semana (el mismo ancla que usa el camino compartido).
 *
 * Después se marcan TODAS las semanas como borrador privado del coach: los
 * contenedores nacen vacíos, y el contrato del alta es que el coach revisa antes
 * de que el atleta vea nada. `addPersonalTramoToChain` deja la primera semana de
 * cada tramo publicada (entrega escalonada, que es lo correcto cuando el tramo
 * ya trae sesiones); aquí se corrige por arriba en lugar de complicar esa
 * función, y el upsert de `markWeekDraft` lo hace idempotente.
 */
export async function materializePersonalChain(params: {
  coach_id: bigint | number;
  coach_user_id: bigint | number;
  athlete_id: bigint | number;
  specs: IntakeBlockSpec[];
  now: Date;
  client: Sql;
}): Promise<PersonalChainResult> {
  const { addPersonalTramoToChain, PersonalChainError } = await import(
    '@/lib/dashboard/coach/personal-plan-chain-mutations'
  );
  const { isoDateString, mondayOfWeek } = await import('@fahybrid/shared/domain/dates');
  const { coachActor } = await import('@/lib/audit/record-edit');

  const actor = coachActor({ user_id: BigInt(params.coach_user_id) });
  const startIso = isoDateString(mondayOfWeek(params.now));

  const tramos: PersonalChainResult['tramos'] = [];
  const week_starts: string[] = [];
  let first_assignment_id: string | null = null;

  for (const spec of params.specs) {
    let added: Awaited<ReturnType<typeof addPersonalTramoToChain>>;
    try {
      added = await addPersonalTramoToChain({
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        payload: { name: spec.type, week_count: spec.weeks },
        actor,
        start_date_when_empty: startIso,
        client: params.client,
      });
    } catch (err) {
      // Traducido al error del alta para que la pantalla enseñe el motivo real
      // (fechas solapadas, contenedor inservible) en vez de un 500 mudo.
      if (err instanceof PersonalChainError) {
        throw new IntakeError(err.code, err.message, err.status);
      }
      throw err;
    }

    if (first_assignment_id == null) {
      first_assignment_id = added.materialization.month_assignment_id;
    }
    tramos.push({
      month_template_id: added.month_template_id,
      name: added.name,
      week_count: added.week_count,
      start_date: added.start_date,
      end_date: added.end_date,
    });
    week_starts.push(
      ...(await markWeeksAsPrivateDraft({
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        start_date: added.materialization.start_date,
        week_count: added.materialization.microcycle_ids.length,
        client: params.client,
      })),
    );
  }

  return { tramos, first_assignment_id, week_starts };
}

/**
 * Marca `week_count` semanas consecutivas desde `start_date` como BORRADOR
 * PRIVADO del coach (`delivery_mode = 'manual'`: el cron de publicación no las
 * suelta nunca solo). Es el contrato del alta en los DOS modos — el coach revisa
 * antes de que el atleta vea nada — y por eso vive en un sitio, no en dos.
 */
export async function markWeeksAsPrivateDraft(params: {
  coach_id: bigint | number;
  athlete_id: bigint | number;
  start_date: string;
  week_count: number;
  client: Sql;
}): Promise<string[]> {
  const { markWeekDraft, DELIVERY_MODE } = await import('./publish-week');
  const { addDays, isoDateString, mondayOfWeek, parseIsoDate } = await import(
    '@fahybrid/shared/domain/dates'
  );

  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const weekStarts: string[] = [];
  for (let i = 0; i < params.week_count; i += 1) {
    const weekStart = isoDateString(addDays(startMonday, i * DAYS_PER_WEEK));
    await markWeekDraft({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      week_start: weekStart,
      delivery_mode: DELIVERY_MODE.manual,
      client: params.client,
    });
    weekStarts.push(weekStart);
  }
  return weekStarts;
}
