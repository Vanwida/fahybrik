import 'server-only';

// ACCIONES EN BLOQUE sobre atletas (§4.8) — POST /api/coach/athletes/bulk.
//
// Cada acción reusa el servicio de UN atleta (nada de caminos paralelos):
//   · set_level          → setAthleteLevel (todos en una transacción: todo o nada)
//   · pause / resume     → pauseAthlete / resumeAthlete (ciclo de vida, cada uno
//                          en la suya: un atleta ya pausado se salta con motivo)
//   · add_to_group       → addMembers (el lote de «Asignar»: previa + deshacer)
//   · remove_from_group  → removeMembers
// Tenencia primero: si un solo atleta no es del coach, no se toca NINGUNO.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  BulkAthleteResult,
  BulkAthletesInput,
  BulkAthletesResponse,
} from '@fahybrid/shared/schema/bulk';
import { AthleteLevelError, setAthleteLevel } from '@/lib/dashboard/athletes/level';
import { LifecycleError, pauseAthlete, resumeAthlete } from './athlete-lifecycle';
import { addMembers, removeMembers } from './groups';

export class BulkAthletesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BulkAthletesError';
  }
}

async function assertAllOwned(client: Sql, coach_id: number, ids: number[]): Promise<void> {
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where coach_id = ${coach_id} and id = any(${ids}::bigint[])
  `;
  if (owned.length !== ids.length) {
    const n = ids.length - owned.length;
    throw new BulkAthletesError(
      'athlete_not_found',
      `${n} de los atletas ${n === 1 ? 'no es tuyo o no existe' : 'no son tuyos o no existen'}. Quítalos de la selección; no se ha cambiado nada.`,
      404,
    );
  }
}

const ok = (id: number): BulkAthleteResult => ({ athlete_id: String(id), ok: true, code: null, message: null });
const no = (id: number, code: string, message: string): BulkAthleteResult => ({
  athlete_id: String(id),
  ok: false,
  code,
  message,
});

function summary(action: BulkAthletesInput['action'], results: BulkAthleteResult[]): BulkAthletesResponse {
  return {
    action,
    changed: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function runBulkAthletes(params: {
  coach_id: number | bigint;
  user_id: number | bigint | null;
  input: BulkAthletesInput;
  client?: Sql;
}): Promise<BulkAthletesResponse> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const input = params.input;
  const ids = [...new Set(input.athlete_ids.map(Number))];
  await assertAllOwned(client, coachId, ids);

  switch (input.action) {
    case 'set_level': {
      try {
        await client.begin(async (raw) => {
          for (const id of ids) {
            await setAthleteLevel({
              coach_id: coachId,
              athlete_id: id,
              level_id: Number(input.level_id),
              client: raw as unknown as Sql,
            });
          }
        });
      } catch (err) {
        if (err instanceof AthleteLevelError) {
          throw new BulkAthletesError(
            'level_not_found',
            `${err.message} No se ha cambiado nada.`,
            err.status,
          );
        }
        throw err;
      }
      return summary(input.action, ids.map(ok));
    }

    case 'pause':
    case 'resume': {
      const results: BulkAthleteResult[] = [];
      for (const id of ids) {
        try {
          if (input.action === 'pause') {
            await pauseAthlete({
              athlete_id: BigInt(id),
              reason: input.reason,
              note: input.note,
              end_date: input.end_date,
              requested_by: 'coach',
              coach_id: BigInt(coachId),
              by_user_id: params.user_id == null ? null : BigInt(params.user_id),
            });
          } else {
            await resumeAthlete({ athlete_id: BigInt(id) });
          }
          results.push(ok(id));
        } catch (err) {
          if (!(err instanceof LifecycleError)) throw err;
          const code =
            err.code === 'invalid_transition' ? (input.action === 'pause' ? 'not_active' : 'not_paused') : err.code;
          const message =
            code === 'not_active'
              ? 'No está activo (ya está pausado o de baja): se ha saltado.'
              : code === 'not_paused'
                ? 'No está pausado: se ha saltado.'
                : err.message;
          results.push(no(id, code, message));
        }
      }
      return summary(input.action, results);
    }

    case 'add_to_group': {
      const assign = await addMembers({
        coach_id: coachId,
        user_id: params.user_id,
        group_id: Number(input.group_id),
        input: {
          athlete_ids: ids.map(String),
          start_date: input.start_date,
          on_conflict: input.on_conflict,
          delivery: input.delivery,
          dry_run: input.dry_run,
        },
        client,
      });
      const byId = new Map((assign.applied?.results ?? []).map((r) => [r.athlete_id, r]));
      const results = assign.preview.athletes.map((a) => {
        const applied = byId.get(a.id);
        if (applied) {
          return applied.status === 'applied' ? ok(Number(a.id)) : no(Number(a.id), applied.status, applied.reason ?? '');
        }
        return a.blocked ? no(Number(a.id), a.blocked.code, a.blocked.message) : ok(Number(a.id));
      });
      return { ...summary(input.action, results), assign };
    }

    case 'remove_from_group': {
      const removal = await removeMembers({
        coach_id: coachId,
        group_id: input.group_id == null ? null : Number(input.group_id),
        athlete_ids: ids,
        client,
      });
      const results = [
        ...removal.removed.map((r) => ok(Number(r.athlete_id))),
        ...removal.skipped.map((s) => no(Number(s.athlete_id), 'not_member', s.reason)),
      ];
      return { ...summary(input.action, results), group_removal: removal };
    }
  }
}
