import 'server-only';

// «Por responder» — el último mensaje del hilo es del ATLETA. No «sin leer»:
// abrir un hilo no es contestarlo (auditoría del panel, informe B H9/M1: la
// pregunta de una atleta leída y sin respuesta desaparecía de todas las colas).
//
// Una consulta para todos los hilos de un coach: por atleta, cuántos mensajes
// suyos hay después de la última respuesta del coach, desde cuándo espera (el
// más antiguo de ellos), cuándo escribió por última vez (la identidad: si vuelve
// a escribir tras un «hecho», es otra espera) y cuántos siguen sin leer.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { threadState, type ReplyOverride } from '@/lib/dashboard/v2/mensajes-inbox';

export interface AwaitingReply {
  /** Mensajes del atleta tras la última respuesta del coach (0 = nada que responder). */
  count: number;
  /** El más antiguo de esos mensajes — desde cuándo espera. */
  since: Date | null;
  /** El más reciente — si escribe otra vez, es una espera nueva. */
  last_at: Date | null;
  /** Mensajes del atleta sin leer (el badge «sin leer»). */
  unread: number;
}

export async function loadAwaitingReply(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  client?: Sql;
}): Promise<Map<string, AwaitingReply>> {
  const client = params.client ?? defaultSql;
  const ids = params.athlete_ids ? [...new Set(params.athlete_ids.map((x) => Number(x)))] : null;
  const rows = await client<
    Array<{ athlete_id: string; n: number; since: Date | null; last_at: Date | null; unread: number }>
  >`
    select
      ct.athlete_id::text as athlete_id,
      coalesce(aw.n, 0)::int as n,
      aw.since,
      aw.last_at,
      (
        select count(*) from chat_messages m
        where m.thread_id = ct.id
          and m.deleted_at is null
          and m.sender_role = 'athlete'
          and m.read_at is null
      )::int as unread
    from chat_threads ct
    left join lateral (
      select max(m.created_at) as at
      from chat_messages m
      where m.thread_id = ct.id and m.deleted_at is null and m.sender_role = 'coach'
    ) lc on true
    left join lateral (
      select count(*)::int as n, min(m.created_at) as since, max(m.created_at) as last_at
      from chat_messages m
      where m.thread_id = ct.id
        and m.deleted_at is null
        and m.sender_role = 'athlete'
        and (lc.at is null or m.created_at > lc.at)
    ) aw on true
    where ct.coach_id = ${Number(params.coach_id)}
      and (${ids}::bigint[] is null or ct.athlete_id = any(${ids}::bigint[]))
  `;
  const out = new Map<string, AwaitingReply>();
  for (const r of rows) {
    out.set(r.athlete_id, {
      count: r.n,
      since: r.n > 0 ? r.since : null,
      last_at: r.n > 0 ? r.last_at : null,
      unread: r.unread,
    });
  }
  return out;
}

export interface ReplyState extends AwaitingReply {
  /** Por responder de verdad: hay espera y el coach no la ha dado por hecha ni pospuesto. */
  open: boolean;
}

/**
 * El estado de respuesta de cada hilo del coach (atleta → espera), con lo que el coach hizo
 * con cada espera (`coach_alert_overrides` de `message_unanswered`: «Hecho» y
 * «Posponer», en Mensajes o en Hoy) ya aplicado por `threadState` — la misma
 * regla que la bandeja de Mensajes y su insignia. Solo atletas que siguen siendo
 * del coach. Dos consultas, sea cual sea el número de hilos.
 *
 * Es la fuente de «Por responder» en Hoy (su filtro) y en Atletas (la columna):
 * una espera cuenta aquí desde el primer minuto; el umbral de horas del coach
 * solo decide cuándo esa espera pasa a ser algo que «te necesita» hoy.
 */
export async function loadReplyStates(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  now?: Date;
  client?: Sql;
}): Promise<Map<string, ReplyState>> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const [awaiting, overrides] = await Promise.all([
    loadAwaitingReply({ coach_id, athlete_ids: params.athlete_ids, client }),
    // Los atletas del coach, con su override de la espera si lo hay.
    client<Array<{ athlete_id: string } & ReplyOverride>>`
      select a.id::text as athlete_id, o.snoozed_until, o.dismissed_at, o.override_kind
      from athletes a
      left join coach_alert_overrides o
        on o.athlete_id = a.id and o.coach_id = a.coach_id and o.signal_kind = 'message_unanswered'
      where a.coach_id = ${coach_id}
    `,
  ]);
  const byAthlete = new Map(overrides.map((o) => [o.athlete_id, o]));
  const own = new Set(byAthlete.keys());
  const out = new Map<string, ReplyState>();
  for (const [athlete_id, aw] of awaiting) {
    if (!own.has(athlete_id)) continue;
    const open =
      aw.count > 0 &&
      aw.last_at != null &&
      threadState({ last_at: aw.last_at }, byAthlete.get(athlete_id) ?? null, now).state === 'por_responder';
    out.set(athlete_id, { ...aw, open });
  }
  return out;
}

/** Solo los hilos por responder (ver `loadReplyStates`). */
export function openReplies(states: ReadonlyMap<string, ReplyState>): Map<string, ReplyState> {
  return new Map([...states].filter(([, s]) => s.open));
}
