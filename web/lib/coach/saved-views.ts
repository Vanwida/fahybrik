import 'server-only';

// VISTAS GUARDADAS de Atletas (§4.8): nombre + cadena de consulta de la URL de
// Atletas, del club (coach_id). Las de serie viven en shared/schema/saved-views.ts
// y no se guardan. Orden: `position`, y a igualdad, la más antigua primero.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  SavedView,
  SavedViewCreateInput,
  SavedViewPatchInput,
} from '@fahybrid/shared/schema/saved-views';

/** Tope por club: cordura (una fila de pastillas no aguanta más), no método. */
export const SAVED_VIEWS_MAX = 50;

export class SavedViewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SavedViewError';
  }
}

type Row = { id: string; name: string; query: string; position: number; created_at: string; updated_at: string };

const toView = (r: Row): SavedView => ({ ...r });

/** Columnas de una vista, con las fechas en ISO 8601 (UTC). */
const columns = (sql: Sql) => sql`
  id::text, name, query, position,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
  to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
`;

function translate(err: unknown, name: string | undefined): never {
  const e = err as { code?: string; constraint_name?: string };
  if (e.code === '23505' && e.constraint_name === 'coach_saved_views_name_uq') {
    throw new SavedViewError('name_taken', `Ya tienes una vista que se llama «${name ?? ''}». Elige otro nombre.`, 409);
  }
  throw err;
}

export async function listSavedViews(coach_id: number | bigint, client: Sql = defaultSql): Promise<SavedView[]> {
  const rows = await client<Row[]>`
    select ${columns(client)}
    from coach_saved_views where coach_id = ${Number(coach_id)}
    order by position, id
  `;
  return rows.map(toView);
}

export async function createSavedView(
  coach_id: number | bigint,
  input: SavedViewCreateInput,
  client: Sql = defaultSql,
): Promise<SavedView> {
  const coach = Number(coach_id);
  try {
    return await client.begin(async (raw) => {
      const tx = raw as unknown as Sql;
      await tx`select pg_advisory_xact_lock(hashtext('coach_saved_views'), ${coach}::int)`;
      const count = await tx<Array<{ n: number; next: number }>>`
        select count(*)::int as n, coalesce(max(position) + 1, 0)::int as next
        from coach_saved_views where coach_id = ${coach}
      `;
      if ((count[0]?.n ?? 0) >= SAVED_VIEWS_MAX) {
        throw new SavedViewError(
          'too_many_views',
          `Ya tienes ${SAVED_VIEWS_MAX} vistas guardadas. Borra alguna antes de guardar otra.`,
          409,
        );
      }
      const rows = await tx<Row[]>`
        insert into coach_saved_views (coach_id, name, query, position)
        values (${coach}, ${input.name}, ${input.query}, ${input.position ?? count[0]?.next ?? 0})
        returning ${columns(tx)}
      `;
      return toView(rows[0]!);
    });
  } catch (err) {
    if (err instanceof SavedViewError) throw err;
    translate(err, input.name);
  }
}

export async function updateSavedView(
  coach_id: number | bigint,
  id: number,
  patch: SavedViewPatchInput,
  client: Sql = defaultSql,
): Promise<SavedView> {
  const has = (k: keyof SavedViewPatchInput) => patch[k] !== undefined;
  let rows: Row[];
  try {
    rows = await client<Row[]>`
      update coach_saved_views set
        name = case when ${has('name')} then ${patch.name ?? ''} else name end,
        query = case when ${has('query')} then ${patch.query ?? ''} else query end,
        position = case when ${has('position')} then ${patch.position ?? 0}::int else position end,
        updated_at = now()
      where id = ${id} and coach_id = ${Number(coach_id)}
      returning ${columns(client)}
    `;
  } catch (err) {
    translate(err, patch.name);
  }
  if (!rows[0]) throw new SavedViewError('view_not_found', 'No encuentro esa vista entre las tuyas.', 404);
  return toView(rows[0]);
}

export async function deleteSavedView(coach_id: number | bigint, id: number, client: Sql = defaultSql): Promise<void> {
  const rows = await client`delete from coach_saved_views where id = ${id} and coach_id = ${Number(coach_id)} returning id`;
  if (rows.length === 0) throw new SavedViewError('view_not_found', 'No encuentro esa vista entre las tuyas.', 404);
}
