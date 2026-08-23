import 'server-only';

// ENCADENAR TRAMOS PERSONALES — lo que faltaba tras 0164/0166: "Personalizar
// plan" y "Nuevo" (personal-plans.ts) sólo sabían crear UN tramo. Un plan de
// verdad son varios seguidos («Base» 3 sem → «Descarga» 1 → «Build» 3 → …), y
// hasta ahora no había forma de encadenarlos, reordenarlos, cambiarles la
// duración ni borrar uno de en medio sin romper las fechas de los siguientes.
//
// AÑADIR y EDITAR viven aquí; REORDENAR y BORRAR viven en
// `personal-plan-chain-reorder.ts` (mismo advisory lock, sólo separado para no
// pasar de 500 líneas por archivo — este módulo los re-exporta para que quien
// importe `personal-plan-chain-mutations` siga teniendo las cuatro).
//
// Las cuatro comparten SIEMPRE el mismo advisory lock por atleta
// (`hashtext('athlete_plan_mutation')`) que personalize-plan.ts / revert-
// personal-plan.ts / personal-plans.ts ya usan — así ninguna corre a la vez
// que otra sobre el mismo atleta. Reordenar y borrar comparten el reflow de
// `personal-plan-chain-reflow.ts` (relocalizan un tramo ENTERO a otra fecha);
// alargar/acortar el propio tramo usa en cambio `personal-plan-chain-resize.ts`
// (redimensiona en sitio, sin mover su fecha de inicio) y sólo reusa el
// reflow para lo que viene DETRÁS de él.

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  instantiateMonthFromTemplate,
  InstantiateProgramError,
  type InstantiateMonthResult,
} from './instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import { appendEmptyWeekToMonth, removeWeekFromMonth } from './program-months';
import { resizeAssignmentInPlace } from './personal-plan-chain-resize';
import { insertEmptyPersonalMonthTemplate } from './personal-plans';
import {
  MICROCICLO_MIN_WEEKS,
  MICROCICLO_ABSOLUTE_MAX_WEEKS,
} from '@fahybrid/shared/domain/coach/program-months';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import {
  loadPersonalTramoChain,
  tramoSafety,
  planPersonalReflow,
  applyPersonalReflow,
  PersonalChainError,
  type PersonalTramoRow,
} from './personal-plan-chain-reflow';
import { recordAudit, type Actor, type AuditChannel } from '@/lib/audit/record-edit';

export { PersonalChainError };

// ─────────────────────────────────────────────────────────────────────────
// AÑADIR UN TRAMO A CONTINUACIÓN
// ─────────────────────────────────────────────────────────────────────────

export const addPersonalTramoSchema = z.object({
  name: z.string().trim().min(1).max(200),
  week_count: z.coerce.number().int().min(MICROCICLO_MIN_WEEKS).max(MICROCICLO_ABSOLUTE_MAX_WEEKS),
});
export type AddPersonalTramoInput = z.infer<typeof addPersonalTramoSchema>;

export type AddPersonalTramoResult = {
  month_template_id: string;
  name: string;
  week_count: number;
  start_date: string;
  end_date: string;
  sequence_detached: boolean;
  materialization: InstantiateMonthResult;
};

/**
 * Añade un microciclo personal NUEVO al final de la cadena de este atleta:
 * nombre + nº de semanas, y empieza justo el día después de que acabe lo
 * último que tenga asignado (personal o de biblioteca — la cadena se lee por
 * fecha, no por origen). Sin nada asignado todavía no hay "anterior" al que
 * encadenar: 409 explícito, no un hueco silencioso… salvo que el llamador diga
 * dónde empieza el primero (`start_date_when_empty`, ver abajo).
 *
 * Detach de la secuencia nivel×días si seguía activa — igual que "Personalizar
 * plan" (0164): un microciclo personal nuevo es el coach llevando el plan a
 * mano de aquí en adelante, y dejar la secuencia activa la expondría a
 * avanzar sola más tarde y chocar con estas fechas (0166).
 */
export async function addPersonalTramoToChain(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  payload: unknown;
  /** Quién añade el tramo — entra en la fila de auditoría (audit_log). */
  actor: Actor;
  /** Superficie de origen de la escritura (0165). Omitido = panel del coach. */
  channel?: AuditChannel;
  /**
   * Dónde arranca el tramo cuando el atleta TODAVÍA no tiene nada asignado.
   * Desde la ficha no existe (no hay fecha que elegir, y encadenar a la nada es
   * un hueco silencioso → 409 `no_chain_yet`), pero en el ALTA sí: un atleta
   * recién dado de alta empieza esta semana y el primer tramo de su cadena nace
   * de ahí. Se normaliza al lunes de su semana, como el resto de la cadena.
   * Omitido = comportamiento de siempre, 409 si no hay cadena.
   */
  start_date_when_empty?: string;
  client?: Sql;
}): Promise<AddPersonalTramoResult> {
  const parsed = addPersonalTramoSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new PersonalChainError('invalid_payload', parsed.error.message, 400);
  }
  const body = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);

  type Phase1Outcome = { monthId: number; startIso: string; sequenceDetached: boolean };
  const outcome: Phase1Outcome = await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    const owned = await tx<Array<{ id: string }>>`
      select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
    `;
    if (!owned[0]) {
      throw new PersonalChainError('not_found', 'Atleta no encontrado', 404);
    }

    // El zod de arriba sólo aplica el techo ABSOLUTO del sistema — aquí SÍ
    // sabemos quién es el coach, así que se comprueba su tope real
    // (`coaches.max_microcycle_weeks`, card 135).
    const maxWeeks = await loadCoachMaxMicrocicloWeeks({ coach_id, client: tx });
    if (body.week_count > maxWeeks) {
      throw new PersonalChainError(
        'week_count_too_long',
        `Un bloque tuyo no pasa de ${maxWeeks} ${maxWeeks === 1 ? 'semana' : 'semanas'}.`,
        400,
      );
    }

    const lastRows = await tx<Array<{ end_date: string | null }>>`
      select to_char(max(end_date), 'YYYY-MM-DD') as end_date
      from athlete_month_assignments
      where athlete_id = ${athlete_id}
    `;
    const lastEnd = lastRows[0]?.end_date ?? null;
    if (!lastEnd && !params.start_date_when_empty) {
      throw new PersonalChainError(
        'no_chain_yet',
        'Este atleta todavía no tiene ningún plan asignado — no hay nada a lo que encadenar. Usa «Personalizar plan» o asígnale una secuencia primero.',
        409,
      );
    }
    // end_date de CUALQUIER asignación cae siempre en domingo (instantiateMonth
    // FromTemplate materializa semanas completas desde un lunes) — +1 día ya es
    // lunes; mondayOfWeek queda como guarda defensiva, no como corrección real.
    // Sin cadena previa manda la fecha de arranque que dio el llamador (alta).
    const startIso = lastEnd
      ? isoDateString(mondayOfWeek(addDays(parseIsoDate(lastEnd), 1)))
      : isoDateString(mondayOfWeek(parseIsoDate(params.start_date_when_empty!)));

    const created = await insertEmptyPersonalMonthTemplate({
      tx: tx as unknown as TransactionClient,
      coach_id,
      athlete_id,
      name: body.name,
      week_count: body.week_count,
    });

    const detachRows = await tx<Array<{ id: string }>>`
      update athlete_sequence_progress
      set status = 'detached', updated_at = now()
      where athlete_id = ${athlete_id} and status = 'active'
      returning id::text
    `;

    // Auditoría DENTRO de la transacción (ver personalize-plan.ts): mismo
    // entity_type que el resto de la familia de tramos, para que el
    // historial de un month_template_id se lea entero sin importar por qué
    // camino nació (fork, desde cero, o encadenado aquí).
    await recordAudit(tx, {
      entity_type: 'program_month_templates',
      entity_id: BigInt(created.id),
      action: 'create',
      actor: params.actor,
      ...(params.channel ? { channel: params.channel } : {}),
      diff: {
        athlete_id,
        coach_id,
        name: body.name,
        week_count: body.week_count,
        start_date: startIso,
        chained_after_end: lastEnd,
        sequence_detached: detachRows.length > 0,
      },
    });

    return { monthId: Number(created.id), startIso, sequenceDetached: detachRows.length > 0 };
  });

  let materialization: InstantiateMonthResult;
  try {
    materialization = await instantiateMonthFromTemplate({
      coach_id,
      athlete_id,
      month_template_id: outcome.monthId,
      start_date: outcome.startIso,
      client,
    });
  } catch (err) {
    if (err instanceof InstantiateProgramError) {
      throw new PersonalChainError(err.code, err.message, err.status);
    }
    throw err;
  }
  await markFutureWeeksDraft({
    coach_id,
    athlete_id,
    start_date: materialization.start_date,
    week_count: materialization.microcycle_ids.length,
    client,
  });

  return {
    month_template_id: String(outcome.monthId),
    name: body.name,
    week_count: body.week_count,
    start_date: materialization.start_date,
    end_date: materialization.end_date,
    sequence_detached: outcome.sequenceDetached,
    materialization,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// EDITAR NOMBRE Y/O DURACIÓN
// ─────────────────────────────────────────────────────────────────────────

export const updatePersonalTramoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    week_count: z.coerce
      .number()
      .int()
      .min(MICROCICLO_MIN_WEEKS)
      .max(MICROCICLO_ABSOLUTE_MAX_WEEKS)
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.week_count !== undefined, {
    message: 'Debes enviar un nombre o un nº de semanas nuevo',
  });
export type UpdatePersonalTramoInput = z.infer<typeof updatePersonalTramoSchema>;

export type UpdatePersonalTramoResult = {
  month_template_id: string;
  name: string;
  week_count: number;
  start_date: string | null;
  end_date: string | null;
  /** Otros tramos de la cadena que tuvieron que recolocarse detrás de éste. */
  reflowed: Array<{ month_template_id: string; name: string; start_date: string; end_date: string }>;
};

/**
 * Renombra y/o cambia la duración de un microciclo PERSONAL ya en la cadena.
 * Alargar añade semanas vacías al final (`appendEmptyWeekToMonth`, reusado tal
 * cual del editor de microciclos); acortar quita las últimas
 * (`removeWeekFromMonth`) — pero SÓLO hasta el suelo real de "acortar"
 * (`tramoSafety`): si alguna de las semanas que se quitarían ya tiene algo
 * ejecutado, se rechaza con el número exacto, nunca se limita en silencio.
 *
 * El tramo en sí se redimensiona EN SITIO (`resizeAssignmentInPlace`): su
 * fecha de inicio nunca cambia, así que una sesión ejecutada en su primera
 * semana no puede bloquear alargarlo por el final. Sólo lo que viene DETRÁS
 * en la cadena se recoloca de verdad (mismo motor que reordenar/borrar) — y
 * sólo cuando el tramo ya estaba materializado y su duración cambió.
 */
export async function updatePersonalTramoMeta(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  payload: unknown;
  /** Quién edita el tramo — entra en la fila de auditoría (audit_log). */
  actor: Actor;
  /** Superficie de origen de la escritura (0165). Omitido = panel del coach. */
  channel?: AuditChannel;
  client?: Sql;
}): Promise<UpdatePersonalTramoResult> {
  const parsed = updatePersonalTramoSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new PersonalChainError('invalid_payload', parsed.error.message, 400);
  }
  const patch = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const month_template_id = Number(params.month_template_id);

  type Phase1Outcome = {
    name: string;
    targetWeekCount: number;
    delta: number;
    mineStartDate: string | null;
    rest: PersonalTramoRow[];
  };
  const outcome: Phase1Outcome = await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    const rows = await tx<Array<{ name: string }>>`
      select name from program_month_templates
      where id = ${month_template_id} and coach_id = ${coach_id} and athlete_id = ${athlete_id}
      limit 1
    `;
    if (!rows[0]) {
      throw new PersonalChainError(
        'not_found',
        'Este microciclo personal no existe o no es de este atleta',
        404,
      );
    }
    const currentName = rows[0].name;
    const newName = patch.name ?? currentName;
    if (patch.name !== undefined) {
      await tx`
        update program_month_templates set name = ${patch.name}, updated_at = now()
        where id = ${month_template_id}
      `;
    }

    const weekRows = await tx<Array<{ week_template_id: string }>>`
      select week_template_id::text from program_month_weeks
      where month_template_id = ${month_template_id}
      order by position asc
    `;
    const currentWeekCount = weekRows.length;
    const targetWeekCount = patch.week_count ?? currentWeekCount;
    const delta = targetWeekCount - currentWeekCount;

    // Sólo al ALARGAR hay algo nuevo que comprobar contra el tope real del
    // coach (`coaches.max_microcycle_weeks`, card 135) — acortar nunca puede
    // acercarse más al techo, y un tramo ya existente que quedó por encima de
    // un tope bajado después no se bloquea por un simple cambio de nombre.
    if (delta > 0) {
      const maxWeeks = await loadCoachMaxMicrocicloWeeks({ coach_id, client: tx });
      if (targetWeekCount > maxWeeks) {
        throw new PersonalChainError(
          'week_count_too_long',
          `Un bloque tuyo no pasa de ${maxWeeks} ${maxWeeks === 1 ? 'semana' : 'semanas'}.`,
          400,
        );
      }
    }

    const chain = await loadPersonalTramoChain({ coach_id, athlete_id, client: tx });
    const mine = chain.find((t) => t.month_template_id === month_template_id) ?? null;
    const rest = mine ? chain.filter((t) => t.start_date > mine.start_date) : [];

    if (delta < 0 && mine) {
      const safety = await tramoSafety(tx, mine.microcycle_ids);
      if (targetWeekCount < safety.min_week_count) {
        throw new PersonalChainError(
          'shrink_blocked_by_history',
          `«${currentName}» ya tiene sesiones hechas en sus últimas semanas — no puedes bajar de ${safety.min_week_count} ${safety.min_week_count === 1 ? 'semana' : 'semanas'}.`,
          409,
        );
      }
    }

    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        await appendEmptyWeekToMonth({ coach_id, month_id: month_template_id, client: tx });
      }
    } else if (delta < 0) {
      const toRemove = weekRows.slice(delta); // las últimas |delta| en posición.
      for (const w of toRemove) {
        await removeWeekFromMonth({
          coach_id,
          month_id: month_template_id,
          week_id: Number(w.week_template_id),
          client: tx,
        });
      }
    }

    // Auditoría DENTRO de esta transacción: cubre el nombre y el nº de
    // semanas OBJETIVO del contenedor (program_month_templates +
    // program_month_weeks, lo que esta fase realmente escribió). El
    // redimensionado EN SITIO del recibo (athlete_month_assignments,
    // incluidas las sesiones que se borran al acortar) vive en su propia
    // transacción — resizeAssignmentInPlace (personal-plan-chain-resize.ts)
    // — y audita ahí, con su propia fila, porque es un commit real distinto
    // (ver el comentario de ese archivo). reflow_candidates son los tramos
    // que, SI el resize seguido tiene éxito, se recolocarán detrás de éste
    // — un plan, no todavía un hecho confirmado por esta fila.
    await recordAudit(tx, {
      entity_type: 'program_month_templates',
      entity_id: BigInt(month_template_id),
      action: 'update',
      actor: params.actor,
      ...(params.channel ? { channel: params.channel } : {}),
      diff: {
        athlete_id,
        coach_id,
        name_before: currentName,
        name_after: newName,
        week_count_before: currentWeekCount,
        week_count_after: targetWeekCount,
        reflow_candidates: rest.map((t) => t.month_template_id),
      },
    });

    return { name: newName, targetWeekCount, delta, mineStartDate: mine?.start_date ?? null, rest };
  });

  if (outcome.delta === 0 || outcome.mineStartDate == null) {
    // Sin cambio de tamaño, o el contenedor todavía no está materializado
    // (un borrador sin fecha) — nada que redimensionar ni recolocar.
    const finalRow = await client<Array<{ start_date: string | null; end_date: string | null }>>`
      select to_char(min(start_date), 'YYYY-MM-DD') as start_date,
             to_char(max(end_date), 'YYYY-MM-DD') as end_date
      from athlete_month_assignments where month_template_id = ${month_template_id}
    `;
    return {
      month_template_id: String(month_template_id),
      name: outcome.name,
      week_count: outcome.targetWeekCount,
      start_date: finalRow[0]?.start_date ?? null,
      end_date: finalRow[0]?.end_date ?? null,
      reflowed: [],
    };
  }

  const resized = await resizeAssignmentInPlace({
    coach_id,
    athlete_id,
    month_template_id,
    actor: params.actor,
    channel: params.channel,
    client,
  });
  const newEnd = resized?.end_date ?? null;

  let reflowed: UpdatePersonalTramoResult['reflowed'] = [];
  if (outcome.rest.length > 0 && newEnd) {
    const desired = outcome.rest.map((t) => ({
      month_template_id: t.month_template_id,
      name: t.name,
      week_count: t.week_count,
    }));
    const current = new Map<number, PersonalTramoRow>(outcome.rest.map((t) => [t.month_template_id, t]));
    const anchorStart = isoDateString(addDays(parseIsoDate(newEnd), 1));
    const steps = await planPersonalReflow({ client, anchor_start: anchorStart, desired, current });
    const { moved } = await applyPersonalReflow({ coach_id, athlete_id, steps, client });
    reflowed = moved.map((m) => ({
      month_template_id: String(m.month_template_id),
      name: m.name,
      start_date: m.new_start,
      end_date: m.new_end,
    }));
  }

  return {
    month_template_id: String(month_template_id),
    name: outcome.name,
    week_count: outcome.targetWeekCount,
    start_date: outcome.mineStartDate,
    end_date: newEnd,
    reflowed,
  };
}

// Reordenar (intercambio con el vecino) y borrar de la cadena viven en
// `personal-plan-chain-reorder.ts` — mismo advisory lock, mismo reflow;
// separado sólo para no pasar de 500 líneas por archivo.
export {
  moveDirectionSchema,
  movePersonalTramoInChain,
  deletePersonalTramoFromChain,
  type MoveDirectionInput,
  type MovePersonalTramoResult,
  type DeletePersonalTramoResult,
} from './personal-plan-chain-reorder';
