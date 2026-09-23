import 'server-only';

// Los niveles del coach (`athlete_levels`) — su lista, su orden, retirarlos y
// qué marca abre cada uno. Único lector/escritor para el editor de Ajustes ›
// Método y para la sugerencia de nivel, así que el editor y el motor no pueden
// discrepar sobre cuál es la escalera.
//
// «Nivel» es solo el nombre por defecto del eje (DECISIONS 2026-08-23): el coach
// lo llama como quiera (`coaches.level_axis_label`) y los niveles son suyos.
// Un coach nuevo empieza sin ninguno.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  LEVEL_METRICS,
  resolveLadder,
  type LadderLevel,
  type LevelCriterion,
  type LevelMetric,
  type LevelSex,
  type ResolvedRung,
} from '@fahybrid/shared/domain/coach/level-criteria';

export interface CoachLevel {
  id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
  archived_at: string | null;
  criteria_set_at: string | null;
  criteria: LevelCriterion[];
  /** Quién lo lleva: atletas, grupos, programas y bloques. */
  usage: { athletes: number; groups: number; programs: number; blocks: number };
}

export class LevelError extends Error {
  constructor(
    public readonly code: 'not_found' | 'conflict' | 'in_use' | 'bad_request',
    message: string,
  ) {
    super(message);
    this.name = 'LevelError';
  }
}

interface LevelRow {
  id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
  archived_at: string | null;
  criteria_set_at: string | null;
  athletes: number;
  groups: number;
  programs: number;
  blocks: number;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err != null && (err as { code?: string }).code === '23505';
}

/** Todos los niveles del coach (activos primero por su orden, luego los retirados). */
export async function listCoachLevels(coach_id: number | bigint, client: Sql = defaultSql): Promise<CoachLevel[]> {
  const cid = Number(coach_id);
  const [rows, crit] = await Promise.all([
    client<LevelRow[]>`
      select l.id::text, l.name, l.label, l.description, l.sort_order::int as sort_order,
             l.archived_at::text as archived_at, l.criteria_set_at::text as criteria_set_at,
             (select count(*)::int from athletes a where a.level_id = l.id and a.coach_id = ${cid}) as athletes,
             (select count(*)::int from program_sequences s where s.level_id = l.id and s.coach_id = ${cid}) as groups,
             (select count(*)::int from program_month_templates m where m.level_id = l.id and m.coach_id = ${cid}) as programs,
             (select count(*)::int from blocks b where (b.min_level_id = l.id or b.max_level_id = l.id) and b.coach_id = ${cid}) as blocks
      from athlete_levels l
      where l.coach_id = ${cid}
      order by (l.archived_at is not null), l.sort_order, l.id
    `,
    client<Array<{ level_id: string; metric: LevelMetric; sex: LevelSex | null; threshold: number }>>`
      select level_id::text, metric, sex, threshold::float8 as threshold
      from athlete_level_criteria
      where coach_id = ${cid}
      order by level_id, metric, sex nulls first
    `,
  ]);
  const byLevel = new Map<string, LevelCriterion[]>();
  for (const c of crit) {
    const list = byLevel.get(c.level_id) ?? [];
    list.push({ metric: c.metric, sex: c.sex, threshold: c.threshold });
    byLevel.set(c.level_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    label: r.label,
    description: r.description,
    sort_order: r.sort_order,
    archived_at: r.archived_at,
    criteria_set_at: r.criteria_set_at,
    criteria: byLevel.get(r.id) ?? [],
    usage: { athletes: r.athletes, groups: r.groups, programs: r.programs, blocks: r.blocks },
  }));
}

/** La escalera vigente del coach: sus niveles ACTIVOS, en orden, con los cortes que mandan. */
export async function loadCoachLadder(coach_id: number | bigint, client: Sql = defaultSql): Promise<ResolvedRung[]> {
  const levels = await listCoachLevels(coach_id, client);
  const active: LadderLevel[] = levels
    .filter((l) => l.archived_at == null)
    .map((l) => ({ id: l.id, name: l.name, criteria_set_at: l.criteria_set_at, criteria: l.criteria }));
  return resolveLadder(active);
}

async function assertOwned(client: Sql, coach_id: number, level_id: number): Promise<void> {
  const rows = await client<Array<{ id: string }>>`
    select id::text from athlete_levels where id = ${level_id} and coach_id = ${coach_id} limit 1
  `;
  if (!rows[0]) throw new LevelError('not_found', 'Ese nivel no es tuyo.');
}

/** Crear uno al final de la escalera activa. */
export async function createCoachLevel(
  coach_id: number | bigint,
  input: { name: string; label?: string | null; description?: string | null },
  client: Sql = defaultSql,
): Promise<string> {
  const cid = Number(coach_id);
  const name = input.name.trim();
  const label = (input.label ?? '').trim() || name;
  try {
    const rows = await client<Array<{ id: string }>>`
      insert into athlete_levels (coach_id, name, label, description, sort_order)
      values (
        ${cid}, ${name}, ${label}, ${input.description?.trim() || null},
        (select coalesce(max(sort_order), 0) + 1 from athlete_levels where coach_id = ${cid})
      )
      returning id::text
    `;
    return rows[0]!.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new LevelError('conflict', `Ya tienes uno que se llama «${name}».`);
    throw err;
  }
}

/** Renombrar, describir, retirar o recuperar. Cada campo solo si viene. */
export async function updateCoachLevel(
  coach_id: number | bigint,
  level_id: number,
  patch: { name?: string; label?: string; description?: string | null; archived?: boolean },
  client: Sql = defaultSql,
): Promise<void> {
  const cid = Number(coach_id);
  await assertOwned(client, cid, level_id);
  try {
    await client.begin(async (tx) => {
      if (patch.name !== undefined) {
        await tx`update athlete_levels set name = ${patch.name.trim()} where id = ${level_id} and coach_id = ${cid}`;
      }
      if (patch.label !== undefined) {
        await tx`update athlete_levels set label = ${patch.label.trim()} where id = ${level_id} and coach_id = ${cid}`;
      }
      if (patch.description !== undefined) {
        await tx`update athlete_levels set description = ${patch.description?.trim() || null} where id = ${level_id} and coach_id = ${cid}`;
      }
      if (patch.archived === true) {
        await tx`update athlete_levels set archived_at = coalesce(archived_at, now()) where id = ${level_id} and coach_id = ${cid}`;
      } else if (patch.archived === false) {
        // Vuelve al final de la escalera activa.
        await tx`
          update athlete_levels
          set archived_at = null,
              sort_order = (select coalesce(max(sort_order), 0) + 1 from athlete_levels
                            where coach_id = ${cid} and archived_at is null)
          where id = ${level_id} and coach_id = ${cid} and archived_at is not null
        `;
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new LevelError('conflict', 'Ya tienes otro con ese nombre.');
    throw err;
  }
}

/** El orden nuevo de los niveles ACTIVOS (todos, sin repetir). */
export async function reorderCoachLevels(
  coach_id: number | bigint,
  ids: readonly number[],
  client: Sql = defaultSql,
): Promise<void> {
  const cid = Number(coach_id);
  const active = await client<Array<{ id: string }>>`
    select id::text from athlete_levels where coach_id = ${cid} and archived_at is null
  `;
  const have = new Set(active.map((r) => r.id));
  const given = ids.map(String);
  if (given.length !== have.size || new Set(given).size !== given.length || given.some((id) => !have.has(id))) {
    throw new LevelError('bad_request', 'El orden tiene que incluir todos tus niveles activos, una vez cada uno.');
  }
  await client.begin(async (tx) => {
    for (const [i, id] of given.entries()) {
      await tx`update athlete_levels set sort_order = ${i + 1} where id = ${Number(id)} and coach_id = ${cid}`;
    }
  });
}

/**
 * Borrar solo lo que nadie lleva. Si lo usa alguien, se niega diciendo quién:
 * lo que toca entonces es retirarlo (sigue en quien lo tiene, sale de los
 * selectores).
 */
export async function deleteCoachLevel(coach_id: number | bigint, level_id: number, client: Sql = defaultSql): Promise<void> {
  const cid = Number(coach_id);
  await assertOwned(client, cid, level_id);
  const level = (await listCoachLevels(cid, client)).find((l) => l.id === String(level_id));
  const u = level?.usage;
  if (u && u.athletes + u.groups + u.programs + u.blocks > 0) {
    const parts = [
      u.athletes ? `${u.athletes} ${u.athletes === 1 ? 'atleta' : 'atletas'}` : null,
      u.groups ? `${u.groups} ${u.groups === 1 ? 'grupo' : 'grupos'}` : null,
      u.programs ? `${u.programs} ${u.programs === 1 ? 'programa' : 'programas'}` : null,
      u.blocks ? `${u.blocks} ${u.blocks === 1 ? 'bloque' : 'bloques'}` : null,
    ].filter(Boolean);
    throw new LevelError('in_use', `Lo usan ${parts.join(', ')}. Retíralo en vez de borrarlo.`);
  }
  await client`delete from athlete_levels where id = ${level_id} and coach_id = ${cid}`;
}

/**
 * Los cortes de un nivel: `criteria` reemplaza el conjunto entero (puede ser
 * vacío = «este nivel no se abre por marcas»); `null` vuelve al defecto del
 * producto para su posición.
 */
export async function setLevelCriteria(
  coach_id: number | bigint,
  level_id: number,
  criteria: readonly LevelCriterion[] | null,
  client: Sql = defaultSql,
): Promise<void> {
  const cid = Number(coach_id);
  await assertOwned(client, cid, level_id);
  for (const c of criteria ?? []) {
    if (!(LEVEL_METRICS as readonly string[]).includes(c.metric)) {
      throw new LevelError('bad_request', 'Marca desconocida.');
    }
  }
  await client.begin(async (tx) => {
    await tx`delete from athlete_level_criteria where level_id = ${level_id} and coach_id = ${cid}`;
    if (criteria == null) {
      await tx`update athlete_levels set criteria_set_at = null where id = ${level_id} and coach_id = ${cid}`;
      return;
    }
    for (const c of criteria) {
      await tx`
        insert into athlete_level_criteria (coach_id, level_id, metric, sex, threshold)
        values (${cid}, ${level_id}, ${c.metric}, ${c.sex}, ${c.threshold})
      `;
    }
    await tx`update athlete_levels set criteria_set_at = now() where id = ${level_id} and coach_id = ${cid}`;
  });
}
