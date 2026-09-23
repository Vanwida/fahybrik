import 'server-only';

// Qué niveles se pueden ELEGIR. Un nivel retirado (`athlete_levels.archived_at`,
// 0259) sale de todo selector y de toda validación de «poner este nivel», pero
// se queda en quien ya lo lleva: por eso cada selector pasa en `keep` el valor
// actual de lo que edita (el nivel del atleta, del grupo, del programa), y cada
// validación deja pasar el nivel que ya estaba puesto.
//
// Las lecturas que RESUELVEN el nivel actual (el nombre en una fila, la ficha,
// el contexto de un grupo) no pasan por aquí: esas tienen que encontrar también
// el retirado.

import type { Sql, TransactionClient } from '@/lib/db';

type Client = Sql | TransactionClient;
import { sql as defaultSql } from '@/lib/db';

export interface LevelOption {
  id: string;
  /** Corto («N3»): lo que sale en la fila. */
  name: string;
  /** Largo («Rendimiento»): lo que ayuda al elegir. */
  label: string;
  /** Retirado: solo aparece porque es el valor actual de lo que se edita. */
  archived: boolean;
}

type Id = string | number | bigint | null | undefined;

function ids(values: readonly Id[]): number[] {
  return [...new Set(values.filter((v): v is string | number | bigint => v != null).map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0,
  );
}

/** Los niveles activos del coach, en su orden, más los retirados de `keep`. */
export async function listLevelOptions(
  coach_id: number | bigint,
  opts: { keep?: readonly Id[]; client?: Client } = {},
): Promise<LevelOption[]> {
  const client = opts.client ?? defaultSql;
  const keep = ids(opts.keep ?? []);
  return await client<LevelOption[]>`
    select id::text as id, name, label, (archived_at is not null) as archived
    from athlete_levels
    where coach_id = ${Number(coach_id)}
      and (archived_at is null or id = any(${keep}::bigint[]))
    order by (archived_at is not null), sort_order, id
  `;
}

export type LevelCheck =
  | { ok: true; level: { id: string; name: string } }
  | { ok: false; reason: 'not_found' | 'archived'; message: string };

/**
 * ¿Se puede poner este nivel? Tiene que ser del coach y estar activo — o ser el
 * que ya estaba puesto (`current`): retirar un nivel no obliga a cambiárselo a
 * nadie. El mensaje dice cuáles se pueden elegir.
 */
export async function checkAssignableLevel(
  client: Client,
  coach_id: number | bigint,
  level_id: Id,
  current: readonly Id[] = [],
): Promise<LevelCheck> {
  const cid = Number(coach_id);
  const want = level_id == null ? NaN : Number(level_id);
  const rows = Number.isInteger(want) && want > 0
    ? await client<Array<{ id: string; name: string; archived: boolean }>>`
        select id::text, name, (archived_at is not null) as archived
        from athlete_levels where id = ${want} and coach_id = ${cid} limit 1
      `
    : [];
  const row = rows[0];
  if (row && (!row.archived || ids(current).includes(want))) {
    return { ok: true, level: { id: row.id, name: row.name } };
  }
  const active = await listLevelOptions(cid, { client });
  const choose = active.length > 0
    ? `Puedes elegir: ${active.map((l) => l.name).join(', ')}.`
    : 'No tienes niveles activos.';
  return row
    ? { ok: false, reason: 'archived', message: `«${row.name}» está retirado. ${choose}` }
    : { ok: false, reason: 'not_found', message: `Ese nivel no es tuyo. ${choose}` };
}
