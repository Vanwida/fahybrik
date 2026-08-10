import 'server-only';

// VOLVER A LA PERIODIZACIÓN (0166) — la inversa exacta de "Personalizar plan"
// (personalize-plan.ts): reactiva la secuencia (nivel×días) justo donde se
// quedó y retira el plan personal, nunca tocando lo ya ejecutado.
//
// SOLO aplica a un plan personal que viene de FORKEAR la periodización — el
// camino secundario "empezar de cero" (createPersonalMonthTemplateFromScratch)
// no tiene ninguna secuencia detrás, así que no hay adónde volver; ese caso usa
// "Borrar" (personal-plans.ts) en su lugar. La distinción es automática: se
// exige un `athlete_sequence_progress` en status='detached' — exactamente el
// que `personalizePlanForAthlete` deja al forkear, y solo ese camino lo crea.
//
// GRANULARIDAD DEL CURSOR: `athlete_sequence_progress.current_position` sabe en
// qué ITEM de la secuencia estaba el atleta, no en qué SEMANA de ese item —
// ningún sitio del motor de secuencias trackea eso (assignSequenceToAthlete /
// advanceSequenceForAthlete tampoco reanudan a mitad de un microciclo). Por eso
// "volver" rematerializa el microciclo actual desde su semana 1, empezando esta
// semana — no intenta adivinar la semana exacta en la que el atleta iba cuando
// se personalizó. Se documenta aquí porque es la única pérdida de fidelidad de
// la operación (el contenido SÍ es exacto; el punto de la semana dentro de él,
// no).
//
// ORDEN DE OPERACIONES (por qué importa): el plan personal se retira ANTES de
// rematerializar la secuencia, nunca al revés — exactamente como personalizar
// recorta/cierra el recibo VIEJO antes de crear el nuevo. 0166 rechazaría dos
// athlete_month_assignments solapados para el mismo atleta si se hiciera en el
// orden contrario.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import {
  AssignSequenceError,
  loadSequenceById,
  itemAtPosition,
  materializeItem,
} from './assign-sequence';
import { retirePersonalPlan, type RetirePersonalPlanResult } from './personal-plans';
import type { InstantiateMonthResult } from './instantiate-program';

export class RevertPersonalPlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'RevertPersonalPlanError';
  }
}

export type RevertPersonalPlanResult = {
  sequence_id: number;
  /** 1-indexed position within the sequence resumed at (unchanged from before
   *  the athlete was personalized — the cursor was preserved, not reset). */
  position: number;
  materialized_month_template_id: number;
  materialization: InstantiateMonthResult;
  /** What happened to the retired personal plan — sessions kept vs removed. */
  retired: RetirePersonalPlanResult;
};

type Phase1Outcome = {
  sequenceId: number;
  position: number;
  monthTemplateId: number;
  weekStart: string;
  retired: RetirePersonalPlanResult;
};

/**
 * Can this athlete's CURRENT plan be reverted? True only when it's personal AND
 * a detached sequence cursor exists to resume — the exact condition the mutating
 * call below re-checks under lock. Read-only, used by the ficha to decide
 * whether to show "Volver a la periodización" at all (per the UX rule: a button
 * that doesn't apply is never shown disabled with an error after — it's not
 * shown).
 */
export async function canRevertToSequence(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<boolean> {
  const client = params.client ?? defaultSql;
  const athlete_id = Number(params.athlete_id);
  const current = await getCurrentMicrociclo({ athlete_id, client });
  if (!current || current.template_athlete_id == null) return false;
  const rows = await client<Array<{ id: string }>>`
    select id::text from athlete_sequence_progress
    where athlete_id = ${athlete_id} and status = 'detached'
    limit 1
  `;
  return rows.length > 0;
}

export async function revertPersonalPlanForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<RevertPersonalPlanResult> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  if (!owned[0]) {
    throw new RevertPersonalPlanError('not_found', 'Atleta no encontrado', 404);
  }

  // ── Fase 1 (bajo el MISMO advisory lock que personalizar/borrar usan para
  //    este atleta): valida en fresco + retira el plan personal. ────────────
  const outcome: Phase1Outcome = await client.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    const current = await getCurrentMicrociclo({
      athlete_id,
      client: tx as unknown as Parameters<typeof getCurrentMicrociclo>[0]['client'],
    });
    if (!current || current.template_athlete_id == null) {
      throw new RevertPersonalPlanError(
        'not_personal',
        'Este atleta no tiene un plan personal activo ahora mismo — no hay nada de lo que volver.',
        409,
      );
    }

    const detached = await tx<
      Array<{ id: string; sequence_id: string; current_position: number }>
    >`
      select id::text, sequence_id::text, current_position
      from athlete_sequence_progress
      where athlete_id = ${athlete_id} and coach_id = ${coach_id} and status = 'detached'
      limit 1
    `;
    const progress = detached[0];
    if (!progress) {
      throw new RevertPersonalPlanError(
        'no_sequence_to_resume',
        'Este plan personal se creó desde cero, no viene de la periodización por nivel×días — no hay secuencia a la que volver. Puedes borrarlo en su lugar.',
        409,
      );
    }

    const sequence = await loadSequenceById(Number(progress.sequence_id), coach_id, tx as unknown as Sql);
    const item = sequence ? itemAtPosition(sequence, progress.current_position) : null;
    if (!sequence || sequence.items.length === 0 || !item) {
      throw new RevertPersonalPlanError(
        'sequence_gone',
        'La secuencia de este atleta cambió y ya no tiene el microciclo donde se quedó — no se puede volver automáticamente.',
        409,
      );
    }

    // Retira el plan personal ANTES de reactivar la secuencia (ver comentario
    // de cabecera: el orden evita un solape transitorio que 0166 rechazaría).
    const retired = await retirePersonalPlan({
      tx: tx as unknown as TransactionClient,
      coach_id,
      athlete_id,
      month_template_id: Number(current.month_template_id),
    });

    await tx`
      update athlete_sequence_progress
      set status = 'active', updated_at = now()
      where id = ${Number(progress.id)}
    `;

    return {
      sequenceId: Number(progress.sequence_id),
      position: progress.current_position,
      monthTemplateId: Number(item.month_template_id),
      weekStart: current.week_start,
      retired,
    };
  });

  // ── Fase 2 (fuera del lock, su propia transacción — instantiateMonthFrom-
  //    Template siempre abre la suya, ver personalize-plan.ts para la misma
  //    restricción de postgres.js). Rematerializa el item actual de la
  //    secuencia desde su semana 1, empezando ESTA semana (ver comentario de
  //    cabecera sobre la granularidad del cursor). ──────────────────────────
  let materialization: InstantiateMonthResult;
  try {
    materialization = await materializeItem({
      coachId: coach_id,
      athleteId: athlete_id,
      monthTemplateId: outcome.monthTemplateId,
      startDate: outcome.weekStart,
      client,
    });
  } catch (err) {
    if (err instanceof AssignSequenceError) {
      throw new RevertPersonalPlanError(err.code, err.message, err.status);
    }
    throw err;
  }

  return {
    sequence_id: outcome.sequenceId,
    position: outcome.position,
    materialized_month_template_id: outcome.monthTemplateId,
    materialization,
    retired: outcome.retired,
  };
}
