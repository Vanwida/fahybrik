import 'server-only';

// GRUPOS (§4.5) — el servicio. Un grupo es un conjunto de atletas con su plan (una
// cadena ordenada de programas). Por debajo, `program_sequences` + sus ítems + un
// cursor por miembro (`athlete_sequence_progress`). Lectura en ./groups-read.ts.
//
// Reglas del dominio que viven aquí:
//   · Un atleta está como mucho en UN grupo: entrar en otro le saca del anterior
//     (su cursor queda 'left'); lo que ya tenía materializado sigue hasta su fin
//     o se encadena/sustituye según elija el coach al añadir.
//   · Entrar en un grupo = recibir el programa en el que ESTÁ el grupo, en su
//     semana (alineado), por el mismo motor y lote deshacible que «Asignar».
//   · Reordenar la cadena conserva la identidad de cada programa (`item_id`) y
//     mueve los cursores con ella: nadie cambia de programa por un reordenado.
//     Quitar de la cadena el programa que alguien está haciendo se rechaza.
//   · Salir de un grupo NO borra nada: conserva su plan hasta que acabe.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { checkAssignableLevel } from '@/lib/coach/level-options';
import type {
  GroupCreateInput,
  GroupDetail,
  GroupMembersInput,
  GroupPatchInput,
  GroupRemoveResult,
  GroupSummary,
} from '@fahybrid/shared/schema/groups';
import type { AssignResponse } from '@fahybrid/shared/schema/assign-many';
import { loadPrograms } from './assign-many-plan';
import { runGroupJoin } from './assign-many';
import { getGroup, listGroups } from './groups-read';

export { getGroup, listGroups, groupDisplayName } from './groups-read';

export class GroupError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GroupError';
  }
}

type Ref = { program_id: string; item_id?: string };

/** El nivel de la regla: del coach y activo, o el que el grupo ya tenía (retirar no obliga a cambiarlo). */
async function assertLevel(tx: Sql, coach_id: number, level_id: string | null | undefined, current: string | null = null): Promise<void> {
  if (level_id == null) return;
  const check = await checkAssignableLevel(tx, coach_id, level_id, [current]);
  if (!check.ok) throw new GroupError('level_not_found', `${check.message} También puede ir sin nivel.`, 422);
}

/** Traduce los choques de la base a una frase que dice qué hacer. */
function translateDbError(err: unknown, input: { name?: string | null }): never {
  const e = err as { code?: string; constraint_name?: string; constraint?: string };
  const constraint = e.constraint_name ?? e.constraint ?? '';
  if (e.code === '23505' && constraint === 'program_sequences_name_uq') {
    throw new GroupError('name_taken', `Ya tienes un grupo que se llama «${input.name ?? ''}». Elige otro nombre.`, 409);
  }
  if (e.code === '23505' && constraint === 'program_sequences_cell_uq') {
    throw new GroupError(
      'rule_taken',
      'Ya hay un grupo con ese nivel y esos días (regla automática). Cambia el nivel o los días, o edita ese grupo.',
      409,
    );
  }
  if (e.code === '23514' && constraint === 'program_sequences_level_up_rule_chk') {
    throw new GroupError(
      'level_up_needs_rule',
      '«Subir de nivel» al acabar necesita que el grupo tenga nivel y días. Pónselos o elige «Repetir» o «Parar».',
      422,
    );
  }
  throw err;
}

/**
 * Deja la cadena del grupo EXACTAMENTE como `refs` (en ese orden), conservando la
 * identidad de los programas que siguen (por `item_id`, o por programa y orden de
 * aparición si no viene) y moviendo con ellos los cursores de los miembros.
 */
async function setGroupProgramsTx(tx: Sql, coach_id: number, group_id: number, refs: Ref[]): Promise<void> {
  const programs = await loadPrograms(tx, coach_id, refs.map((r) => Number(r.program_id)));
  for (const r of refs) {
    const p = programs.get(Number(r.program_id));
    if (!p) {
      throw new GroupError(
        'program_not_found',
        'Uno de los programas no está en tu biblioteca (o es el plan personal de un atleta). Elige programas de la biblioteca.',
        422,
      );
    }
    if (p.weeks === 0) {
      throw new GroupError('empty_program', `«${p.name}» no tiene semanas: añádele al menos una antes de meterlo en un grupo.`, 422);
    }
  }

  const old = await tx<Array<{ id: string; position: number; month_template_id: string }>>`
    select id::text, position, month_template_id::text from program_sequence_items
    where sequence_id = ${group_id} order by position for update
  `;
  const claimed = new Set<string>();
  const plan = refs.map((r, i) => {
    let keep = r.item_id ? old.find((o) => o.id === r.item_id) : undefined;
    if (r.item_id && !keep) {
      throw new GroupError('item_not_found', 'Un programa de la cadena ya no existe. Recarga el grupo y vuelve a guardar.', 409);
    }
    if (keep && (claimed.has(keep.id) || keep.month_template_id !== r.program_id)) keep = undefined;
    if (!keep && !r.item_id) {
      keep = old.find((o) => !claimed.has(o.id) && o.month_template_id === r.program_id && !refs.some((x) => x.item_id === o.id));
    }
    if (keep) claimed.add(keep.id);
    return { ref: r, keep, position: i + 1 };
  });
  const removed = old.filter((o) => !claimed.has(o.id));

  // Nadie puede quedarse haciendo un programa que ya no está en la cadena.
  if (removed.length > 0) {
    const busy = await tx<Array<{ position: number; n: number }>>`
      select current_position as position, count(*)::int as n from athlete_sequence_progress
      where sequence_id = ${group_id} and status = 'active'
        and current_position = any(${removed.map((r) => r.position)}::int[])
      group by current_position
    `;
    if (busy.length > 0) {
      const first = busy[0]!;
      const name = programs.get(Number(removed.find((r) => r.position === first.position)!.month_template_id))?.name
        ?? (await tx<Array<{ name: string }>>`
          select m.name from program_month_templates m
          join program_sequence_items i on i.month_template_id = m.id
          where i.sequence_id = ${group_id} and i.position = ${first.position}
        `)[0]?.name ?? 'ese programa';
      throw new GroupError(
        'program_in_use',
        `«${name}» lo ${first.n === 1 ? 'está haciendo 1 atleta' : `están haciendo ${first.n} atletas`} del grupo ahora: no se puede quitar de la cadena. Espera a que acaben o sácalos del grupo.`,
        409,
      );
    }
  }

  const moves = plan.filter((p) => p.keep && p.keep.position !== p.position);
  if (removed.length > 0) {
    await tx`delete from program_sequence_items where id = any(${removed.map((r) => Number(r.id))}::bigint[])`;
  }
  // Dos pasadas para no chocar con el único (sequence_id, position) al reordenar.
  for (const m of moves) {
    await tx`update program_sequence_items set position = ${m.position + 1000} where id = ${Number(m.keep!.id)}`;
  }
  for (const m of moves) {
    await tx`update program_sequence_items set position = ${m.position} where id = ${Number(m.keep!.id)}`;
  }
  for (const p of plan.filter((x) => !x.keep)) {
    await tx`
      insert into program_sequence_items (sequence_id, position, month_template_id)
      values (${group_id}, ${p.position}, ${Number(p.ref.program_id)})
    `;
  }
  // Los cursores (activos y los de «volver al grupo») siguen a su programa.
  for (const m of moves) {
    await tx`
      update athlete_sequence_progress set current_position = ${m.position + 1000}, updated_at = now()
      where sequence_id = ${group_id} and status in ('active', 'detached') and current_position = ${m.keep!.position}
    `;
  }
  if (moves.length > 0) {
    await tx`
      update athlete_sequence_progress set current_position = current_position - 1000
      where sequence_id = ${group_id} and current_position > 1000
    `;
  }
  await tx`update program_sequences set updated_at = now() where id = ${group_id}`;
}

export async function createGroup(
  coach_id: number | bigint,
  input: GroupCreateInput,
  client: Sql = defaultSql,
): Promise<GroupSummary> {
  const coach = Number(coach_id);
  let id = 0;
  try {
    await client.begin(async (raw) => {
      const tx = raw as unknown as Sql;
      await assertLevel(tx, coach, input.level_id);
      const rows = await tx<Array<{ id: string }>>`
        insert into program_sequences (
          coach_id, name, level_id, days_per_week, end_policy, progression_pct, progression_applies_to
        ) values (
          ${coach}, ${input.name}, ${input.level_id == null ? null : Number(input.level_id)},
          ${input.days_per_week ?? null}, ${input.end_policy}, ${input.progression_pct ?? null},
          ${input.progression_applies_to ?? null}
        )
        returning id::text
      `;
      id = Number(rows[0]!.id);
      if (input.programs.length > 0) await setGroupProgramsTx(tx, coach, id, input.programs);
    });
  } catch (err) {
    if (err instanceof GroupError) throw err;
    translateDbError(err, input);
  }
  return (await listGroups(coach, client)).find((g) => g.id === String(id))!;
}

export async function updateGroup(
  coach_id: number | bigint,
  group_id: number,
  patch: GroupPatchInput,
  client: Sql = defaultSql,
): Promise<GroupDetail> {
  const coach = Number(coach_id);
  try {
    await client.begin(async (raw) => {
      const tx = raw as unknown as Sql;
      const found = await tx<Array<{ id: string; level_id: string | null }>>`
        select id::text, level_id::text from program_sequences where id = ${group_id} and coach_id = ${coach} for update
      `;
      if (!found[0]) throw new GroupError('group_not_found', 'No encuentro ese grupo entre los tuyos.', 404);
      if (patch.level_id !== undefined) await assertLevel(tx, coach, patch.level_id, found[0].level_id);
      const has = (k: keyof GroupPatchInput) => patch[k] !== undefined;
      if (has('name') || has('level_id') || has('days_per_week') || has('end_policy') || has('progression_pct')) {
        await tx`
          update program_sequences set
            name = case when ${has('name')} then ${patch.name ?? null} else name end,
            level_id = case when ${has('level_id')} then ${patch.level_id == null ? null : Number(patch.level_id)}::bigint else level_id end,
            days_per_week = case when ${has('days_per_week')} then ${patch.days_per_week ?? null}::smallint else days_per_week end,
            end_policy = case when ${has('end_policy')} then ${patch.end_policy ?? 'repeat'} else end_policy end,
            progression_pct = case when ${has('progression_pct')} then ${patch.progression_pct ?? null}::numeric else progression_pct end,
            progression_applies_to = case when ${has('progression_applies_to')} then ${patch.progression_applies_to ?? null} else progression_applies_to end,
            updated_at = now()
          where id = ${group_id}
        `;
      }
      if (patch.programs) await setGroupProgramsTx(tx, coach, group_id, patch.programs);
    });
  } catch (err) {
    if (err instanceof GroupError) throw err;
    translateDbError(err, patch);
  }
  return (await getGroup(coach, group_id, client))!;
}

/** Renombrar (atajo de `updateGroup`). */
export function renameGroup(coach_id: number | bigint, group_id: number, name: string, client: Sql = defaultSql) {
  return updateGroup(coach_id, group_id, { name }, client);
}

/** Dejar la cadena de programas del grupo en este orden (atajo de `updateGroup`). */
export function setGroupPrograms(coach_id: number | bigint, group_id: number, programs: Ref[], client: Sql = defaultSql) {
  return updateGroup(coach_id, group_id, { programs }, client);
}

/**
 * Borrar un grupo. Con atletas dentro se rechaza: hay que sacarlos o moverlos
 * antes (borrarlo los dejaría sin saber qué les toca después).
 */
export async function deleteGroup(coach_id: number | bigint, group_id: number, client: Sql = defaultSql): Promise<void> {
  const coach = Number(coach_id);
  await client.begin(async (raw) => {
    const tx = raw as unknown as Sql;
    const found = await tx<Array<{ n: number }>>`
      select (select count(*)::int from athlete_sequence_progress
               where sequence_id = ps.id and status = 'active') as n
      from program_sequences ps where ps.id = ${group_id} and ps.coach_id = ${coach} for update
    `;
    if (!found[0]) throw new GroupError('group_not_found', 'No encuentro ese grupo entre los tuyos.', 404);
    if (found[0].n > 0) {
      throw new GroupError(
        'group_has_members',
        `Este grupo tiene ${found[0].n} ${found[0].n === 1 ? 'atleta' : 'atletas'}. Sácalos o muévelos a otro grupo antes de borrarlo.`,
        409,
      );
    }
    await tx`delete from program_sequences where id = ${group_id}`;
  });
}

/** Añadir atletas: el mismo motor (y lote deshacible) que «Asignar», alineado con el grupo. */
export async function addMembers(params: {
  coach_id: number | bigint;
  user_id?: number | bigint | null;
  group_id: number;
  input: Omit<GroupMembersInput, 'action'>;
  client?: Sql;
}): Promise<AssignResponse> {
  return runGroupJoin({
    coach_id: params.coach_id,
    user_id: params.user_id,
    group_id: params.group_id,
    athlete_ids: params.input.athlete_ids.map(Number),
    start_date: params.input.start_date,
    start_position: params.input.start_position,
    start_week: params.input.start_week,
    on_conflict: params.input.on_conflict,
    delivery: params.input.delivery,
    dry_run: params.input.dry_run,
    client: params.client,
  });
}

/**
 * Sacar atletas del grupo (o, sin grupo, del que estén). No borra nada: cada uno
 * conserva lo que ya tiene materializado hasta que acabe (`plan_until`), y deja de
 * recibir los programas siguientes del grupo. Todos tienen que ser del coach.
 */
export async function removeMembers(params: {
  coach_id: number | bigint;
  group_id: number | null;
  athlete_ids: number[];
  client?: Sql;
}): Promise<GroupRemoveResult> {
  const client = params.client ?? defaultSql;
  const coach = Number(params.coach_id);
  const ids = [...new Set(params.athlete_ids)];
  return client.begin(async (raw) => {
    const tx = raw as unknown as Sql;
    const owned = await tx<Array<{ id: string }>>`
      select id::text from athletes where coach_id = ${coach} and id = any(${ids}::bigint[])
    `;
    if (owned.length !== ids.length) {
      throw new GroupError('athlete_not_found', 'Alguno de los atletas no es tuyo o no existe; no se ha sacado a nadie.', 404);
    }
    if (params.group_id != null) {
      const g = await tx`select 1 from program_sequences where id = ${params.group_id} and coach_id = ${coach}`;
      if (g.length === 0) throw new GroupError('group_not_found', 'No encuentro ese grupo entre los tuyos.', 404);
    }
    const left = await tx<Array<{ athlete_id: string; plan_until: string | null }>>`
      update athlete_sequence_progress asp set status = 'left', updated_at = now()
      where asp.coach_id = ${coach} and asp.status = 'active' and asp.athlete_id = any(${ids}::bigint[])
        and (${params.group_id}::bigint is null or asp.sequence_id = ${params.group_id}::bigint)
      returning asp.athlete_id::text,
        (select to_char(max(end_date), 'YYYY-MM-DD') from athlete_month_assignments ama
          where ama.athlete_id = asp.athlete_id) as plan_until
    `;
    const out = new Set(left.map((l) => l.athlete_id));
    return {
      removed: left.map((l) => ({ athlete_id: l.athlete_id, plan_until: l.plan_until })),
      skipped: ids
        .filter((id) => !out.has(String(id)))
        .map((id) => ({
          athlete_id: String(id),
          reason: params.group_id != null ? 'No está en este grupo.' : 'No está en ningún grupo.',
        })),
    };
  });
}
