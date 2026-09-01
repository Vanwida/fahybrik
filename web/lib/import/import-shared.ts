import 'server-only';

// Shared by every import-proposal branch (xlsx/paste, AI-generate, photo): the
// ONE error shape the route (app/api/coach/import/proposal/route.ts) catches,
// and the ONE ownership check every branch runs before touching a coach's
// microcycle. Split out of proposal-service.ts (where both used to live
// inline) so a branch module like photo-proposal.ts can use them without an
// import back into proposal-service.ts — this is a leaf: nothing here imports
// any branch module, so there is no cycle in either direction.

import type { Sql } from '@/lib/db';

export class ImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export async function assertMicrocycleOwned(
  coach_id: number | bigint,
  microcycle_id: number | bigint,
  client: Sql,
): Promise<void> {
  const rows = await client<Array<{ id: string }>>`
    select id::text from program_month_templates
    where id = ${Number(microcycle_id)} and coach_id = ${Number(coach_id)}
    limit 1
  `;
  if (!rows[0]) {
    throw new ImportError('not_found', 'Este microciclo no existe o no es tuyo.', 404);
  }
}
