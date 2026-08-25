import 'server-only';

// REDIMENSIONAR UN TRAMO EN SITIO — separado de personal-plan-chain-reflow.ts
// a propósito: alargar o acortar un tramo cuya fecha de INICIO no cambia no
// es lo mismo que moverlo entero a otra fecha (eso es lo que hace el reflow,
// para reordenar o para los tramos que vienen DETRÁS de éste). Confundir las
// dos cosas tiene un bug concreto: si alargar se tratara como "borrar el
// tramo entero y rematerializarlo", una sesión ya ejecutada en la semana 1
// bloquearía añadir una semana 5 al final — que no tiene sentido, alargar
// nunca toca lo de atrás. Aquí sólo se materializan/borran las semanas de la
// PUNTA que de verdad cambian; el resto no se toca ni se re-lee.

import type { Sql } from '@/lib/db';
import { withOwnOrAmbientTx } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { instantiateWeekIntoMicrocycle } from './instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import { tramoSafety, PersonalChainError } from './personal-plan-chain-reflow';
import { recordAudit, type Actor, type AuditChannel } from '@/lib/audit/record-edit';

export type ResizeInPlaceResult = { end_date: string; week_count: number };

/**
 * Alarga o acorta EN SITIO la materialización de un tramo. `null` cuando el
 * tramo todavía no está materializado (un contenedor recién creado sin
 * asignación) — no hay nada que redimensionar en la base de datos, el
 * llamador no necesita hacer nada más.
 *
 * Debe llamarse DESPUÉS de que `program_month_weeks`/`program_week_templates`
 * ya reflejen el nº de semanas NUEVO (el llamador ya corrió
 * `appendEmptyWeekToMonth`/`removeWeekFromMonth`).
 *
 * ALARGAR: materializa ÚNICAMENTE las semanas nuevas (las de la plantilla que
 * el recibo todavía no cubre), empezando justo donde el tramo terminaba —
 * las semanas que ya había no se tocan. ACORTAR: borra sólo los últimos
 * microciclos (el llamador ya comprobó que están libres de ejecutadas;
 * re-comprobado aquí, defensivo) — el resto se queda exactamente como estaba.
 */
export async function resizeAssignmentInPlace(params: {
  coach_id: number;
  athlete_id: number;
  month_template_id: number;
  /** Quién redimensiona — entra en la fila de auditoría (audit_log). */
  actor: Actor;
  /** Superficie de origen de la escritura (0165). Omitido = panel del coach. */
  channel?: AuditChannel;
  client: Sql;
}): Promise<ResizeInPlaceResult | null> {
  const { coach_id, athlete_id, month_template_id, actor, channel, client } = params;

  const assignmentRows = await client<
    Array<{ id: string; start_date: string; end_date: string; microcycle_ids: string[] | null }>
  >`
    select id::text, to_char(start_date, 'YYYY-MM-DD') as start_date,
           to_char(end_date, 'YYYY-MM-DD') as end_date, microcycle_ids
    from athlete_month_assignments
    where athlete_id = ${athlete_id} and month_template_id = ${month_template_id}
    limit 1
  `;
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  const templateWeeks = await client<Array<{ position: number; week_template_id: string }>>`
    select position, week_template_id::text from program_month_weeks
    where month_template_id = ${month_template_id}
    order by position asc
  `;
  const currentMicroIds = (assignment.microcycle_ids ?? []).map(Number);
  const oldCount = currentMicroIds.length;
  const newCount = templateWeeks.length;
  const startMonday = mondayOfWeek(parseIsoDate(assignment.start_date));

  if (newCount === oldCount) {
    const rows = await client<Array<{ end_date: string }>>`
      select to_char(end_date, 'YYYY-MM-DD') as end_date from athlete_month_assignments
      where id = ${Number(assignment.id)}
    `;
    return { end_date: rows[0]!.end_date, week_count: newCount };
  }

  if (newCount > oldCount) {
    const result = await withOwnOrAmbientTx(client, async (txRaw) => {
      const tx = txRaw as unknown as Sql;
      const newMicroIds: number[] = [];
      for (let wi = oldCount; wi < newCount; wi++) {
        const weekStart = addDays(startMonday, wi * 7);
        const res = await instantiateWeekIntoMicrocycle({
          client: tx,
          coach_id,
          athlete_id,
          week_template_id: Number(templateWeeks[wi]!.week_template_id),
          week_start: weekStart,
          week_number: wi + 1,
        });
        newMicroIds.push(Number(res.microcycle_id));
      }
      const allMicroIds = [...currentMicroIds, ...newMicroIds];
      const newEnd = isoDateString(addDays(startMonday, newCount * 7 - 1));
      // Recuenta sobre TODOS los microciclos del tramo (viejos + nuevos) en vez
      // de sumar por incremento — igual que personalize-plan.ts al recortar el
      // recibo viejo: una columna derivada que se queda obsoleta miente peor
      // que no existir, y recontar desde la verdad no depende de que el valor
      // anterior fuera correcto.
      const totalCount = await tx<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments where microcycle_id = any(${allMicroIds}::bigint[])
      `;
      await tx`
        update athlete_month_assignments
        set microcycle_ids = ${allMicroIds}::bigint[],
            end_date = ${newEnd}::date,
            assignment_count = ${totalCount[0]?.n ?? 0}
        where id = ${Number(assignment.id)}
      `;

      // Auditoría DENTRO de esta transacción — es un commit REAL distinto del
      // de updatePersonalTramoMeta (que ya audita el nombre/nº de semanas
      // objetivo del contenedor en la suya propia): esta es la que de verdad
      // materializa/borra sesiones sobre el recibo. Alargar no borra nada, así
      // que no hay número de sesiones que reportar aquí.
      await recordAudit(tx, {
        entity_type: 'program_month_templates',
        entity_id: BigInt(month_template_id),
        action: 'update',
        actor,
        ...(channel ? { channel } : {}),
        diff: {
          athlete_id,
          coach_id,
          resize: 'grow',
          week_count_before: oldCount,
          week_count_after: newCount,
          end_date_before: assignment.end_date,
          end_date_after: newEnd,
        },
      });

      return { end_date: newEnd };
    });
    await markFutureWeeksDraft({
      coach_id,
      athlete_id,
      start_date: assignment.start_date,
      week_count: newCount,
      client,
    });
    return { end_date: result.end_date, week_count: newCount };
  }

  // ACORTAR.
  const removedIds = currentMicroIds.slice(newCount);
  const keptIds = currentMicroIds.slice(0, newCount);
  const safety = await tramoSafety(client, removedIds);
  if (safety.executed_count > 0) {
    throw new PersonalChainError(
      'has_executed_sessions',
      'Las últimas semanas ya tienen sesiones hechas — no se pueden quitar.',
      409,
    );
  }
  const newEnd = isoDateString(addDays(startMonday, newCount * 7 - 1));
  await withOwnOrAmbientTx(client, async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    let deletedSessions = 0;
    if (removedIds.length > 0) {
      const deletedRows = await tx<Array<{ id: string }>>`
        delete from workout_assignments where microcycle_id = any(${removedIds}::bigint[])
        returning id
      `;
      deletedSessions = deletedRows.length;
      await tx`delete from microcycles where id = any(${removedIds}::bigint[])`;
    }
    // Igual que personalize-plan.ts al recortar el recibo viejo: `assignment_count`
    // se RECUENTA sobre lo que sobrevive, nunca se resta a ojo — una columna
    // derivada que se queda obsoleta miente peor que no existir.
    const survivorCount = await tx<Array<{ n: number }>>`
      select count(*)::int as n from workout_assignments where microcycle_id = any(${keptIds}::bigint[])
    `;
    await tx`
      update athlete_month_assignments
      set microcycle_ids = ${keptIds}::bigint[],
          end_date = ${newEnd}::date,
          assignment_count = ${survivorCount[0]?.n ?? 0}
      where id = ${Number(assignment.id)}
    `;

    // Auditoría DENTRO de esta transacción — ver el comentario de la rama
    // ALARGAR arriba. `preserved_sessions` es siempre 0 aquí: `tramoSafety`
    // ya rechazó la operación entera (arriba, fuera de esta tx) si alguna de
    // las semanas a quitar tenía algo ejecutado, así que si llegamos aquí
    // ninguna de las borradas lo estaba.
    await recordAudit(tx, {
      entity_type: 'program_month_templates',
      entity_id: BigInt(month_template_id),
      action: 'update',
      actor,
      ...(channel ? { channel } : {}),
      diff: {
        athlete_id,
        coach_id,
        resize: 'shrink',
        week_count_before: oldCount,
        week_count_after: newCount,
        end_date_before: assignment.end_date,
        end_date_after: newEnd,
        deleted_sessions: deletedSessions,
        preserved_sessions: 0,
      },
    });
  });
  return { end_date: newEnd, week_count: newCount };
}
