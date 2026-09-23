// Mensajes — el cargador de la bandeja del coach (servidor).
//
// Cuatro consultas en paralelo, todas con dueño, sea cual sea el número de hilos:
//   1. los hilos del coach con su atleta, nivel, último mensaje y sin leer
//      (y, con búsqueda, el mensaje más reciente que casa);
//   2. la espera de cada hilo — `loadAwaitingReply`, la misma lectura del motor;
//   3. lo que el coach hizo con cada espera — `coach_alert_overrides` de
//      `message_unanswered` (lo escriben «Hecho» y «Posponer», aquí y en Hoy);
//   4. su umbral de espera (`message_unanswered_hours`).
// Antes esta pantalla cargaba el roster entero (~317 consultas) para pintar un
// panel de contexto; ahora el contexto se pide solo para el hilo abierto.
//
// Un hilo solo sale si el atleta sigue siendo del coach (`a.coach_id`), igual que
// la puerta del chat (`resolveThread`): nunca una fila que no se pueda abrir.

import 'server-only';
import type { PendingQuery, Row } from 'postgres';
import { COACH_THRESHOLD_SPEC } from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { humanPreview } from '@/lib/chat/schema';
import { loadAwaitingReply } from '@/lib/coach/attention/awaiting-reply';
import { resolveCoachThresholds } from '@/lib/coach/signal-thresholds';
import { searchTokens } from '@/lib/coach/search';
import { threadState, type ReplyOverride } from './mensajes-inbox';
import type { MensajesInbox, MensajesThread } from './mensajes-types';

type Fragment = PendingQuery<Row[]>;

interface ThreadRow {
  thread_id: string;
  athlete_id: string;
  athlete_name: string;
  avatar_url: string | null;
  level_label: string | null;
  unread: number;
  last_body: string | null;
  last_at: Date | null;
  last_role: 'athlete' | 'coach' | null;
  name_match: boolean;
  match_body: string | null;
  match_at: Date | null;
  match_role: 'athlete' | 'coach' | null;
}

async function loadThreadRows(client: Sql, coach_id: number, tokens: string[]): Promise<ThreadRow[]> {
  const searching = tokens.length > 0;
  const allIn = (expr: Fragment) =>
    client`not exists (select 1 from unnest(${tokens}::text[]) tok where strpos(${expr}, tok) = 0)`;
  const nameNorm = client`fahybrid_normalize_term(a.full_name)`;
  const bodyNorm = client`fahybrid_normalize_term(m.body)`;

  return client<ThreadRow[]>`
    select t.id::text as thread_id,
           a.id::text as athlete_id,
           a.full_name as athlete_name,
           a.avatar_url,
           lv.name as level_label,
           t.unread_for_coach as unread,
           lm.body as last_body, lm.at as last_at, lm.role as last_role,
           ${searching ? allIn(nameNorm) : client`false`} as name_match,
           mm.body as match_body, mm.at as match_at, mm.role as match_role
    from chat_threads t
    join athletes a on a.id = t.athlete_id and a.coach_id = t.coach_id
    left join athlete_levels lv on lv.id = a.level_id and lv.coach_id = a.coach_id
    left join lateral (
      select coalesce(m.body, '[' || coalesce(m.attachment_kind, 'attach') || ']') as body,
             m.created_at as at, m.sender_role::text as role
      from chat_messages m
      where m.thread_id = t.id and m.deleted_at is null
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    left join lateral (
      select m.body, m.created_at as at, m.sender_role::text as role
      from chat_messages m
      where ${searching ? client`true` : client`false`}
        and m.thread_id = t.id and m.deleted_at is null and m.body is not null
        and ${searching ? allIn(bodyNorm) : client`true`}
      order by m.created_at desc, m.id desc
      limit 1
    ) mm on true
    where t.coach_id = ${coach_id}
      and (${!searching} or ${searching ? allIn(nameNorm) : client`false`} or mm.at is not null)
    order by coalesce(mm.at, lm.at) desc nulls last, a.full_name
  `;
}

async function loadReplyOverrides(client: Sql, coach_id: number): Promise<Map<string, ReplyOverride>> {
  const rows = await client<
    Array<{ athlete_id: string; snoozed_until: Date | null; dismissed_at: Date | null; override_kind: 'snooze' | 'done' | null }>
  >`
    select o.athlete_id::text as athlete_id, o.snoozed_until, o.dismissed_at, o.override_kind
    from coach_alert_overrides o
    join athletes a on a.id = o.athlete_id and a.coach_id = ${coach_id}
    where o.coach_id = ${coach_id} and o.signal_kind = 'message_unanswered'
  `;
  return new Map(rows.map((r) => [r.athlete_id, r]));
}

/**
 * La bandeja entera del coach (o, con `q`, los hilos cuyo atleta o algún mensaje
 * casa con la búsqueda: sin tildes, sin mayúsculas, todas las palabras).
 */
export async function loadMensajesInbox(params: {
  coach_id: bigint | number;
  q?: string | null;
  now?: Date;
  client?: Sql;
}): Promise<MensajesInbox> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const q = params.q?.trim() ? params.q.trim().slice(0, 120) : null;
  const tokens = q ? searchTokens(q) : [];

  const [rows, awaiting, overrides, thresholds] = await Promise.all([
    loadThreadRows(client, coach_id, tokens),
    loadAwaitingReply({ coach_id, client }),
    loadReplyOverrides(client, coach_id),
    resolveCoachThresholds(coach_id, client).catch(() => null),
  ]);

  const threads: MensajesThread[] = rows.map((r) => {
    const aw = awaiting.get(r.athlete_id);
    const waiting =
      aw && aw.count > 0 && aw.since && aw.last_at
        ? { since: aw.since, last_at: aw.last_at, count: aw.count }
        : null;
    const { state, snoozed_until } = threadState(waiting, overrides.get(r.athlete_id) ?? null, now);
    return {
      thread_id: r.thread_id,
      athlete_id: r.athlete_id,
      athlete_name: r.athlete_name,
      avatar_url: r.avatar_url,
      level_label: r.level_label,
      last_message:
        r.last_at && r.last_role
          ? { preview: humanPreview(r.last_body ?? ''), at: r.last_at.toISOString(), from: r.last_role }
          : null,
      unread: r.unread,
      waiting: waiting
        ? { since: waiting.since.toISOString(), last_at: waiting.last_at.toISOString(), count: waiting.count }
        : null,
      state,
      snoozed_until,
      match:
        r.match_at && r.match_role && r.match_body
          ? { preview: r.match_body, at: r.match_at.toISOString(), from: r.match_role }
          : null,
    };
  });

  return {
    generated_at: now.toISOString(),
    threshold_hours: thresholds?.message_unanswered_hours ?? COACH_THRESHOLD_SPEC.message_unanswered_hours.default,
    q,
    threads,
  };
}
