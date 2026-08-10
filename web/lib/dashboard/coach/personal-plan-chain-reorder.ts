import 'server-only';

// REORDENAR Y BORRAR DE LA CADENA — separado de personal-plan-chain-mutations.ts
// (que crea y redimensiona) sólo para no pasar de 500 líneas por archivo; las
// dos operaciones de aquí comparten el mismo advisory lock por atleta
// (`hashtext('athlete_plan_mutation')`) que el resto del plan personal, y el
// mismo reflow (`personal-plan-chain-reflow.ts`) — reordenar y borrar son las
// dos operaciones que de verdad RELOCALIZAN un tramo entero a otra fecha (a
// diferencia de editar duración, que redimensiona en sitio sin mover la
// fecha de inicio — ver personal-plan-chain-resize.ts).

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { retirePersonalPlan, type RetirePersonalPlanResult } from './personal-plans';
import {
  loadPersonalTramoChain,
  planPersonalReflow,
  applyPersonalReflow,
  PersonalChainError,
  type PersonalTramoRow,
  type ReflowStep,
} from './personal-plan-chain-reflow';

export { PersonalChainError };

// ─────────────────────────────────────────────────────────────────────────
// REORDENAR (intercambio con el vecino)
// ─────────────────────────────────────────────────────────────────────────

export const moveDirectionSchema = z.object({ direction: z.enum(['up', 'down']) });
export type MoveDirectionInput = z.infer<typeof moveDirectionSchema>;

export type MovePersonalTramoResult = {
  moved: Array<{ month_template_id: string; name: string; start_date: string; end_date: string }>;
};

/**
 * Intercambia un microciclo personal con su vecino inmediato en la cadena
 * (arriba/abajo) — el "arrastrar" del editor se reduce a llamar esto varias
 * veces, un paso cada vez, igual que ya hace `CadenaEspina` con las secuencias
 * (`components/v2/periodizacion/secuencias`). Como los dos tramos conservan su
 * propio nº de semanas, el hueco combinado no cambia: nada MÁS ALLÁ del par
 * intercambiado se recoloca nunca. Ninguno de los dos se mueve si cualquiera
 * de los dos ya tiene algo ejecutado.
 */
export async function movePersonalTramoInChain(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<MovePersonalTramoResult> {
  const parsed = moveDirectionSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new PersonalChainError('invalid_payload', parsed.error.message, 400);
  }
  const { direction } = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const month_template_id = Number(params.month_template_id);

  type Phase1Outcome = { steps: ReflowStep[] };
  const outcome: Phase1Outcome = await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    const chain = await loadPersonalTramoChain({ coach_id, athlete_id, client: tx });
    const idx = chain.findIndex((t) => t.month_template_id === month_template_id);
    if (idx < 0) {
      throw new PersonalChainError(
        'not_found',
        'Este microciclo personal no existe o no es de este atleta',
        404,
      );
    }
    const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
    const neighbor = chain[neighborIdx];
    if (!neighbor) {
      throw new PersonalChainError(
        'no_neighbor',
        direction === 'up' ? 'Ya es el primero de la cadena.' : 'Ya es el último de la cadena.',
        409,
      );
    }

    const [first, second] = idx < neighborIdx ? [chain[idx]!, neighbor] : [neighbor, chain[idx]!];
    const desired = [
      { month_template_id: second.month_template_id, name: second.name, week_count: second.week_count },
      { month_template_id: first.month_template_id, name: first.name, week_count: first.week_count },
    ];
    const current = new Map<number, PersonalTramoRow>([
      [first.month_template_id, first],
      [second.month_template_id, second],
    ]);
    const steps = await planPersonalReflow({ client: tx, anchor_start: first.start_date, desired, current });
    return { steps };
  });

  const { moved } = await applyPersonalReflow({ coach_id, athlete_id, steps: outcome.steps, client });
  return {
    moved: moved.map((m) => ({
      month_template_id: String(m.month_template_id),
      name: m.name,
      start_date: m.new_start,
      end_date: m.new_end,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// BORRAR DE LA CADENA
// ─────────────────────────────────────────────────────────────────────────

export type DeletePersonalTramoResult = RetirePersonalPlanResult & {
  /** True cuando además se recolocaron los tramos siguientes (sólo posible
   *  cuando el borrado no dejó ninguna sesión ejecutada huérfana detrás). */
  reflowed: boolean;
  reflowed_tramos: Array<{ month_template_id: string; name: string; start_date: string; end_date: string }>;
};

/**
 * Borra un microciclo personal de la cadena — mismo mecanismo de siempre
 * (`retirePersonalPlan`: lo pendiente desaparece, lo ejecutado se conserva
 * huérfano, el recibo y la plantilla se retiran siempre). La diferencia con
 * el "Borrar" suelto del panel de planes: aquí, si el borrado NO dejó nada
 * ejecutado huérfano, los tramos siguientes se recolocan hacia atrás para
 * cerrar el hueco. Si sí dejó algo (el atleta ya vivió parte de este tramo),
 * el hueco se deja tal cual — recolocar encima empujaría a los siguientes a
 * chocar en silencio con esa historia real (ver personal-plan-chain-reflow.ts).
 */
export async function deletePersonalTramoFromChain(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  client?: Sql;
}): Promise<DeletePersonalTramoResult> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const month_template_id = Number(params.month_template_id);

  type Phase1Outcome = { retired: RetirePersonalPlanResult; steps: ReflowStep[] };
  const outcome: Phase1Outcome = await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    const chain = await loadPersonalTramoChain({ coach_id, athlete_id, client: tx });
    const idx = chain.findIndex((t) => t.month_template_id === month_template_id);
    if (idx < 0) {
      throw new PersonalChainError(
        'not_found',
        'Este microciclo personal no existe o no es de este atleta',
        404,
      );
    }
    const target = chain[idx]!;
    const rest = chain.slice(idx + 1);

    const retired = await retirePersonalPlan({
      tx: txRaw as unknown as TransactionClient,
      coach_id,
      athlete_id,
      month_template_id,
    });

    let steps: ReflowStep[] = [];
    if (retired.preserved_sessions === 0 && rest.length > 0) {
      const desired = rest.map((t) => ({
        month_template_id: t.month_template_id,
        name: t.name,
        week_count: t.week_count,
      }));
      const current = new Map<number, PersonalTramoRow>(rest.map((t) => [t.month_template_id, t]));
      steps = await planPersonalReflow({ client: tx, anchor_start: target.start_date, desired, current });
    }

    return { retired, steps };
  });

  if (outcome.steps.length === 0) {
    return { ...outcome.retired, reflowed: false, reflowed_tramos: [] };
  }
  const { moved } = await applyPersonalReflow({ coach_id, athlete_id, steps: outcome.steps, client });
  return {
    ...outcome.retired,
    reflowed: true,
    reflowed_tramos: moved.map((m) => ({
      month_template_id: String(m.month_template_id),
      name: m.name,
      start_date: m.new_start,
      end_date: m.new_end,
    })),
  };
}
