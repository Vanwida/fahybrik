import 'server-only';

// LA CADENA DE UN ATLETA, PARA EL COACH — la espina real de
// `web/lib/plan/camino.ts` (`resolvePlanPath`, la MISMA que dibuja la nota y
// el móvil del atleta), enriquecida con lo único que un coach necesita para
// EDITARLA: qué tramo es suyo para tocar (personal, `program_month_templates
// .athlete_id` = este atleta) y cuál es sólo de biblioteca (se lee, no se
// toca desde aquí); y por tramo personal, cuánto tiene ya ejecutado, cuánto
// pendiente, y hasta dónde se puede acortar sin rozar lo ejecutado.
//
// "REUTILIZA LA ESPINA Y plan-path.ts QUE YA EXISTEN" — literal: este archivo
// NO recalcula fechas, rótulos de semana ni tono. Llama a `resolvePlanPath` y
// le añade columnas encima, uniendo por los `assignment_id`/`month_template_id`
// que ese resolver ya expone.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { resolvePlanPath } from '@/lib/plan/camino';
import type { PlanPathSegmentDTO } from '@fahybrid/shared/domain/plan-path';
import { tramoSafety, PersonalChainError } from './personal-plan-chain-reflow';
import { MICROCICLO_MIN_WEEKS, MICROCICLO_MAX_WEEKS } from './personal-plans';

export { PersonalChainError, MICROCICLO_MIN_WEEKS, MICROCICLO_MAX_WEEKS };

/** Un nodo de la cadena tal y como lo necesita el coach: todo lo de la espina
 *  (`PlanPathSegmentDTO`) + de quién es y qué se le puede hacer. */
export type PersonalChainNode = PlanPathSegmentDTO & {
  /** El microciclo detrás es personal de ESTE atleta (no de biblioteca). Sólo
   *  estos llevan controles — un nodo de biblioteca se ve, no se edita aquí. */
  is_personal: boolean;
  executed_count: number;
  pending_count: number;
  /** Suelo real de "acortar" (ver `tramoSafety`). `null` en un nodo de
   *  biblioteca — no aplica, no se edita. */
  min_week_count: number | null;
  /** Pendientes por semana, índice 0 = primera semana del tramo. `[]` en un
   *  nodo de biblioteca. Deja que el editor de duración sume el sufijo que
   *  se recortaría y diga un número real antes de acortar. */
  pending_by_week: number[];
  can_rename: boolean;
  can_resize: boolean;
  can_move_up: boolean;
  can_move_down: boolean;
  can_delete: boolean;
};

/**
 * La cadena de un atleta, lista para pintar Y para decidir qué botón enseñar
 * en cada nodo. `[]` cuando el atleta no tiene ningún plan asignado todavía —
 * el mismo `null`→`[]` que ya hace `resolvePlanPath` (nada que dibujar).
 */
export async function resolvePersonalPlanChain(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<PersonalChainNode[]> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);

  const path = await resolvePlanPath({ athlete_id, sql: client });
  if (!path || path.segments.length === 0) return [];

  const monthIds = Array.from(new Set(path.segments.map((s) => Number(s.month_template_id))));
  const ownershipRows = await client<Array<{ id: string; athlete_id: string | null }>>`
    select id::text, athlete_id::text as athlete_id
    from program_month_templates
    where id = any(${monthIds}::bigint[]) and coach_id = ${coach_id}
  `;
  const isOwnedPersonal = new Map(
    ownershipRows.map((r) => [Number(r.id), r.athlete_id != null && Number(r.athlete_id) === athlete_id]),
  );

  const assignmentIds = Array.from(new Set(path.segments.map((s) => Number(s.assignment_id))));
  const microRows = await client<Array<{ assignment_id: string; microcycle_ids: string[] | null }>>`
    select id::text as assignment_id, microcycle_ids
    from athlete_month_assignments
    where id = any(${assignmentIds}::bigint[])
  `;
  const microByAssignment = new Map(
    microRows.map((r) => [Number(r.assignment_id), (r.microcycle_ids ?? []).map(Number)]),
  );

  const personalAt = (i: number) => isOwnedPersonal.get(Number(path.segments[i]!.month_template_id)) === true;

  const nodes: PersonalChainNode[] = [];
  for (let i = 0; i < path.segments.length; i++) {
    const seg = path.segments[i]!;
    const personal = personalAt(i);
    const microIds = microByAssignment.get(Number(seg.assignment_id)) ?? [];
    const safety = personal
      ? await tramoSafety(client, microIds)
      : { executed_count: 0, pending_count: 0, min_week_count: 0, pending_by_week: [] };
    const prevIsChainable = i > 0 && personalAt(i - 1);
    const nextIsChainable = i < path.segments.length - 1 && personalAt(i + 1);

    nodes.push({
      ...seg,
      is_personal: personal,
      executed_count: safety.executed_count,
      pending_count: safety.pending_count,
      min_week_count: personal ? safety.min_week_count : null,
      pending_by_week: safety.pending_by_week,
      can_rename: personal,
      can_resize: personal,
      can_move_up: personal && prevIsChainable,
      can_move_down: personal && nextIsChainable,
      can_delete: personal,
    });
  }

  // Un swap sólo es seguro si NINGUNO de los dos implicados tiene nada
  // ejecutado — segunda pasada, una vez se conoce el executed_count de todos
  // (incluido el propio: un tramo con historial tampoco se mueve a sí mismo).
  for (let i = 0; i < nodes.length; i++) {
    const self = nodes[i]!;
    if (self.executed_count > 0) {
      self.can_move_up = false;
      self.can_move_down = false;
      continue;
    }
    if (self.can_move_up && nodes[i - 1]!.executed_count > 0) self.can_move_up = false;
    if (self.can_move_down && nodes[i + 1]!.executed_count > 0) self.can_move_down = false;
  }

  return nodes;
}
