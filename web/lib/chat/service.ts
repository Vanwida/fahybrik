// Chat service — EL módulo de chat. Uno solo.
//
// El coach y el atleta escriben en el mismo hilo, así que comparten tabla, DTO,
// reglas de no-leídos y canal de tiempo real. Hasta el 26-jul había dos módulos
// paralelos (este y `lib/dashboard/chat`) y de ahí salían todos los fallos del
// chat del dashboard: el envío del coach no publicaba al canal en vivo, no leía
// las columnas de adjunto y aplicaba un tope de texto distinto. Ese módulo está
// borrado; lo que hacía de más vive aquí abajo, en la sección "coach".
//
// El hilo entre un coach y un atleta se crea solo en el primer acceso — ninguno
// de los dos lados tiene que "abrir" una conversación.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { attachmentPreview } from './schema';
import type { ChatAttachmentKind, ChatSenderRole, MessageDTO, SendMessageInput } from './schema';
import { notifyOpposite } from './notify';
import { publishMessage, type ChatScope } from './pubsub';

// Postgres `timestamptz::text` renders `2026-05-29 11:06:13.234292+00` — a space
// instead of `T` and a `+00` offset. That is NOT valid ISO 8601, so the iOS
// JSONDecoder (.iso8601) rejects it and the whole chat payload fails to decode.
// Normalize any wire-bound timestamp to strict ISO 8601 with a `Z` zulu suffix
// and millisecond precision, which both the iOS decoder and the `messageDtoSchema`
// (z.string().datetime) accept. Cursors keep the raw Postgres text (full µs
// precision) — they are opaque strings to the client and `::timestamptz` re-parses
// either form.
export function toWireIso(pgText: string | null): string | null {
  if (pgText == null) return null;
  // Postgres renders the zone as `+00` / `+02` (no minutes), which `new Date()`
  // rejects. Normalize to `T` separator and a `+HH:MM` offset before parsing.
  const normalized = pgText
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return pgText; // defensive: leave untouched if unparseable
  return d.toISOString();
}

// Raw row shape returned by the chat message SELECTs. `created_at` / `read_at` /
// `edited_at` are Postgres `timestamptz::text`; `created_at` doubles as the
// opaque paging/poll cursor (full µs precision) before `toWireIso` normalizes it.
//
// `sender_role` se lee a pelo de la columna: es obligatoria desde la 0136. NO se
// re-deriva del `sender_user_id`, que miente en la cuenta donde el coach es su
// propio atleta (mismo user_id por los dos lados).
type MessageRow = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  sender_role: ChatSenderRole;
  body: string | null;
  attachment_url: string | null;
  attachment_kind: string | null;
  attachment_meta: unknown;
  created_at: string;
  read_at: string | null;
  edited_at: string | null;
};

/** Columnas del DTO de mensaje, cualificadas por `m`. Una sola lista para las
 *  cuatro consultas que devuelven mensajes: si un día se añade un campo al DTO,
 *  no puede quedarse fuera de una de ellas.
 *
 *  Es una FÁBRICA, no una constante: cada llamada devuelve un fragmento nuevo,
 *  así que ninguna consulta comparte objeto con otra. Y va cualificada porque una
 *  de esas consultas cruza con `chat_threads`, donde `id` y `created_at` también
 *  existen: sin el prefijo, Postgres las rechaza por ambiguas. */
const messageColumns = (client: Sql) => client`
  m.id::text, m.thread_id::text, m.sender_user_id::text, m.sender_role, m.body,
  m.attachment_url, m.attachment_kind, m.attachment_meta::jsonb as attachment_meta,
  m.created_at::text, m.read_at::text, m.edited_at::text
`;

function rowToMessageDto(r: MessageRow): MessageDTO {
  return {
    id: r.id,
    thread_id: r.thread_id,
    sender_user_id: r.sender_user_id,
    sender_role: r.sender_role,
    body: r.body,
    attachment_url: r.attachment_url,
    attachment_kind: (r.attachment_kind as ChatAttachmentKind | null) ?? null,
    attachment_meta: (r.attachment_meta as Record<string, unknown> | null) ?? null,
    created_at: toWireIso(r.created_at)!,
    read_at: toWireIso(r.read_at),
    edited_at: toWireIso(r.edited_at),
  };
}

// -----------------------------------------------------------------------------
// Hilos
// -----------------------------------------------------------------------------

/** Una conversación en la lista del coach. */
export type CoachThreadSummary = {
  thread_id: string;
  athlete_id: string;
  athlete_full_name: string;
  last_message_at: string | null;
  /** Texto del último mensaje, o `[image]`/`[voice]`… cuando es un adjunto sin texto. */
  last_message_body: string | null;
  unread_count: number;
};

/** Vista previa del último mensaje del hilo `t` — su texto, o el tipo de adjunto
 *  entre corchetes cuando no lleva texto. Fábrica (fragmento nuevo por llamada)
 *  para que las dos listas, la del coach y la del atleta, no puedan divergir. */
export const lastMessagePreview = (client: Sql) => client`
  select coalesce(m.body, '[' || coalesce(m.attachment_kind, 'attach') || ']')
  from chat_messages m
  where m.thread_id = t.id and m.deleted_at is null
  order by m.created_at desc
  limit 1
`;

export async function listThreadsForCoach(args: {
  sql?: Sql;
  coach_id: number | bigint;
}): Promise<CoachThreadSummary[]> {
  const client = args.sql ?? defaultSql;
  return client<CoachThreadSummary[]>`
    select t.id::text as thread_id,
           t.athlete_id::text as athlete_id,
           a.full_name as athlete_full_name,
           t.last_message_at::text as last_message_at,
           (${lastMessagePreview(client)}) as last_message_body,
           t.unread_for_coach as unread_count
    from chat_threads t
    join athletes a on a.id = t.athlete_id
    where t.coach_id = ${args.coach_id as unknown as number}
    order by t.last_message_at desc nulls last
  `;
}

/**
 * Idempotente: devuelve el hilo único (coach_id, athlete_id), creándolo en la
 * primera llamada. Dos llamadas concurrentes convergen al mismo id porque el
 * insert va `on conflict do nothing` contra la restricción única y re-selecciona
 * si pierde la carrera.
 */
export async function getOrCreateThread(args: {
  sql?: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
}): Promise<{ thread_id: string; coach_id: number | bigint; athlete_id: number | bigint }> {
  const client = args.sql ?? defaultSql;
  const { coach_id, athlete_id } = args;

  const inserted = await client<{ id: string }[]>`
    insert into chat_threads (coach_id, athlete_id)
    values (${coach_id as unknown as number}, ${athlete_id as unknown as number})
    on conflict (coach_id, athlete_id) do nothing
    returning id::text
  `;
  if (inserted[0]) return { thread_id: inserted[0].id, coach_id, athlete_id };

  const existing = await client<{ id: string }[]>`
    select id::text from chat_threads
    where coach_id = ${coach_id as unknown as number}
      and athlete_id = ${athlete_id as unknown as number}
    limit 1
  `;
  if (!existing[0]) {
    throw new Error('chat_threads upsert race lost — row not found after conflict');
  }
  return { thread_id: existing[0].id, coach_id, athlete_id };
}

/** El hilo del atleta con SU coach (el de `athletes.coach_id`). Null si el
 *  atleta no existe o no tiene coach asignado. */
export async function getOrCreateThreadForAthlete(args: {
  sql?: Sql;
  athlete_id: bigint;
}): Promise<{ thread_id: string; coach_id: bigint } | null> {
  const client = args.sql ?? defaultSql;
  const rows = await client<{ coach_id: string }[]>`
    select coach_id::text as coach_id from athletes
    where id = ${args.athlete_id as unknown as number}
    limit 1
  `;
  const coachIdText = rows[0]?.coach_id;
  if (!coachIdText) return null;
  const coach_id = BigInt(coachIdText);
  const t = await getOrCreateThread({ sql: client, coach_id, athlete_id: args.athlete_id });
  return { thread_id: t.thread_id, coach_id };
}

/**
 * Comprueba que un hilo pertenece al coach dado. Devuelve el athlete_id cuando
 * sí, null cuando no. Es la puerta de todo endpoint de coach por hilo.
 */
export async function getCoachThread(args: {
  sql?: Sql;
  thread_id: string;
  coach_id: number | bigint;
}): Promise<{ thread_id: string; athlete_id: bigint } | null> {
  const client = args.sql ?? defaultSql;
  if (!/^\d+$/.test(args.thread_id)) return null;
  const rows = await client<{ id: string; athlete_id: string }[]>`
    select id::text, athlete_id::text
    from chat_threads
    where id = ${args.thread_id}::bigint
      and coach_id = ${args.coach_id as unknown as number}
    limit 1
  `;
  if (!rows[0]) return null;
  return { thread_id: rows[0].id, athlete_id: BigInt(rows[0].athlete_id) };
}

// -----------------------------------------------------------------------------
// Mensajes
// -----------------------------------------------------------------------------

// EL CURSOR DEL CHAT ES UN ID DE MENSAJE, NUNCA UNA HORA
// ------------------------------------------------------
// Parece más natural paginar por `created_at`, y así estaba. No funciona:
// postgres.js RECORTA a milisegundos cualquier timestamptz que viaje como
// parámetro, mientras que la columna guarda microsegundos. Verificado contra una
// rama de Neon: un corte de `17:29:29.561668+00` llega a la base como
// `17:29:29.561+00`.
//
// Con el corte recortado HACIA ABAJO, un `created_at < cursor` se salta en
// silencio todo lo que cayó entre el milisegundo y el microsegundo real, así que
// tirar del historial hacia atrás perdía mensajes sin dar ningún error.
//
// `id` es `bigint generated always as identity`: exacto, monótono y ya ordenado
// por inserción. Para el cliente el cursor es una cadena opaca, así que qué lleva
// dentro es asunto de este módulo.

/** Cuántos mensajes devuelve una página, con su tope duro. */
function pageLimit(requested: number | undefined): number {
  return Math.min(Math.max(requested ?? 50, 1), 200);
}

/** Un cursor válido es un id de mensaje. Cualquier otra cosa se ignora (se
 *  devuelve la página más reciente) en vez de reventar con un error de SQL. */
function parseCursor(cursor: string | null | undefined): string | null {
  return cursor && /^\d+$/.test(cursor) ? cursor : null;
}

export async function listMessages(args: {
  sql?: Sql;
  thread_id: string | bigint;
  cursor: string | null;
  limit?: number;
}): Promise<{ messages: MessageDTO[]; next_cursor: string | null }> {
  const client = args.sql ?? defaultSql;
  const limit = pageLimit(args.limit);
  const cursor = parseCursor(args.cursor);
  const rows = cursor
    ? await client<MessageRow[]>`
        select ${messageColumns(client)}
        from chat_messages m
        where m.thread_id = ${args.thread_id as unknown as string}::bigint
          and m.deleted_at is null
          and m.id < ${cursor}::bigint
        order by m.id desc
        limit ${limit + 1}
      `
    : await client<MessageRow[]>`
        select ${messageColumns(client)}
        from chat_messages m
        where m.thread_id = ${args.thread_id as unknown as string}::bigint
          and m.deleted_at is null
        order by m.id desc
        limit ${limit + 1}
      `;
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? sliced[sliced.length - 1]!.id : null;
  return { messages: sliced.map(rowToMessageDto), next_cursor };
}

// Un mensaje por id — lo usa el stream SSE para recomponer el DTO completo tras
// un NOTIFY (que solo lleva ids). Null si no existe o está borrado.
export async function getMessageById(
  client: Sql,
  message_id: string,
): Promise<MessageDTO | null> {
  const rows = await client<MessageRow[]>`
    select ${messageColumns(client)}
    from chat_messages m
    where m.id = ${message_id}::bigint
      and m.deleted_at is null
    limit 1
  `;
  return rows[0] ? rowToMessageDto(rows[0]) : null;
}

// Author-scoped soft delete. Sets `deleted_at` ONLY when the message belongs to
// `thread_id` AND was authored by `sender_user_id` (the caller) AND isn't already
// deleted. Ownership is enforced in the WHERE clause, so a client can never
// delete another author's message or reach into another thread. Returns true iff
// a row was flagged. Soft (not hard) delete keeps history/audit intact; every
// read path already filters `deleted_at is null`, so it drops from both sides.
export async function softDeleteOwnMessage(args: {
  sql?: Sql;
  thread_id: string | bigint;
  message_id: string;
  sender_user_id: bigint;
}): Promise<boolean> {
  const client = args.sql ?? defaultSql;
  const rows = await client<{ id: string }[]>`
    update chat_messages
       set deleted_at = now()
     where id = ${args.message_id}::bigint
       and thread_id = ${args.thread_id as unknown as string}::bigint
       and sender_user_id = ${args.sender_user_id as unknown as number}
       and deleted_at is null
    returning id::text
  `;
  return rows.length > 0;
}

/**
 * El id del último mensaje que existe. Es el punto de partida del sondeo del SSE:
 * "desde aquí, cuéntame lo que llegue". Cero cuando la tabla está vacía.
 */
export async function latestMessageId(client: Sql = defaultSql): Promise<string> {
  const rows = await client<{ id: string }[]>`
    select coalesce(max(id), 0)::text as id from chat_messages
  `;
  return rows[0]?.id ?? '0';
}

/**
 * Mensajes nuevos de TODO lo que el principal puede ver, posteriores a `after`
 * (un id de mensaje), del más viejo al más nuevo.
 *
 * Filtra por coach/atleta y NO por una lista de hilos fijada al conectar: si el
 * atleta escribe por primera vez y su hilo nace en ese momento, el mensaje entra
 * igual. Esa lista fija era justamente el agujero de la versión anterior.
 *
 * Alimenta el sondeo interno del SSE cuando LISTEN/NOTIFY no está disponible. El
 * `cursor` devuelto es el id de la última fila para el siguiente ciclo, o null si
 * no llegó nada (el llamante conserva el suyo).
 */
export async function listNewMessagesForScope(args: {
  sql?: Sql;
  scope: ChatScope;
  after: string;
  limit?: number;
}): Promise<{ messages: MessageDTO[]; cursor: string | null }> {
  const client = args.sql ?? defaultSql;
  const limit = pageLimit(args.limit);
  const after = parseCursor(args.after) ?? '0';
  const owner = args.scope.role === 'coach' ? client`t.coach_id` : client`t.athlete_id`;
  const rows = await client<MessageRow[]>`
    select ${messageColumns(client)}
    from chat_messages m
    join chat_threads t on t.id = m.thread_id
    where ${owner} = ${args.scope.id as unknown as number}
      and m.deleted_at is null
      and m.id > ${after}::bigint
    order by m.id asc
    limit ${limit}
  `;
  const cursor = rows.length > 0 ? rows[rows.length - 1]!.id : null;
  return { messages: rows.map(rowToMessageDto), cursor };
}

export async function sendMessage(args: {
  sql?: Sql;
  thread_id: string | bigint;
  sender_user_id: bigint;
  sender_role: ChatSenderRole;
  input: SendMessageInput;
}): Promise<MessageDTO> {
  const client = args.sql ?? defaultSql;
  const { thread_id, sender_user_id, sender_role, input } = args;
  const inserted = await client<MessageRow[]>`
    insert into chat_messages as m (
      thread_id, sender_user_id, sender_role, body, attachment_url, attachment_kind, attachment_meta
    ) values (
      ${thread_id as unknown as string}::bigint,
      ${sender_user_id as unknown as number},
      ${sender_role},
      ${input.body ?? null},
      ${input.attachment_url ?? null},
      ${input.attachment_kind ?? null},
      ${input.attachment_meta ? client.json(input.attachment_meta) : null}
    )
    returning ${messageColumns(client)}
  `;
  const row = inserted[0]!;

  // Sella el hilo y sube el contador de no-leídos del OTRO lado. El `returning`
  // trae los dueños del hilo, que es lo que necesita el canal en vivo para saber
  // a quién repartir sin volver a preguntar por ellos.
  //
  // La hora se lee de la fila recién insertada en vez de reenviarla desde aquí:
  // un timestamptz que viaja como parámetro pierde los microsegundos (ver el
  // bloque del cursor más arriba), y el hilo acabaría con una marca de tiempo
  // ligeramente anterior a su propio último mensaje.
  const bumped = await client<{ coach_id: string; athlete_id: string }[]>`
    update chat_threads t
    set last_message_at = m.created_at,
        unread_for_athlete = t.unread_for_athlete + ${sender_role === 'coach' ? 1 : 0},
        unread_for_coach   = t.unread_for_coach   + ${sender_role === 'athlete' ? 1 : 0},
        updated_at = now()
    from chat_messages m
    where t.id = ${thread_id as unknown as string}::bigint
      and m.id = ${row.id}::bigint
    returning t.coach_id::text, t.athlete_id::text
  `;

  // Reparto: aviso en la app + push al destinatario. Best-effort.
  notifyOpposite({
    sql: client,
    thread_id: BigInt(row.thread_id),
    sender_user_id,
    sender_role,
    preview:
      input.body && input.body.trim().length > 0
        ? input.body
        : attachmentPreview(input.attachment_kind ?? null),
  }).catch(() => undefined);

  // Publica a los streams SSE de todas las instancias (Postgres NOTIFY). El aviso
  // solo lleva ids; el suscriptor recompone el DTO. Best-effort — el mensaje ya
  // está guardado y los sondeos de respaldo cubren cualquier pérdida.
  const owners = bumped[0];
  if (owners) {
    void publishMessage({
      thread_id: row.thread_id,
      message_id: row.id,
      coach_id: owners.coach_id,
      athlete_id: owners.athlete_id,
    }).catch(() => undefined);
  }

  return rowToMessageDto(row);
}

/**
 * Marca como leídos los mensajes del hilo hasta `up_to_message_id` y pone a cero
 * el contador del lector.
 *
 * Solo toca los mensajes del OTRO lado: `read_at` significa "el destinatario lo
 * ha leído", así que sellar los tuyos propios al abrir el hilo pintaría un doble
 * check falso en la pantalla del otro.
 */
export async function markRead(args: {
  sql?: Sql;
  thread_id: string | bigint;
  reader_role: ChatSenderRole;
  up_to_message_id: string;
}): Promise<{ marked: number }> {
  const client = args.sql ?? defaultSql;
  const { thread_id, reader_role } = args;
  const upTo = parseCursor(args.up_to_message_id);
  if (!upTo) return { marked: 0 };

  // El corte tiene que existir DENTRO de este hilo. Sin esta comprobación, un id
  // inventado y muy alto marcaría la conversación entera como leída.
  const exists = await client<{ id: string }[]>`
    select id::text from chat_messages
    where id = ${upTo}::bigint
      and thread_id = ${thread_id as unknown as string}::bigint
    limit 1
  `;
  if (!exists[0]) return { marked: 0 };

  // Se corta por id, no por hora: un timestamptz que viaja como parámetro pierde
  // los microsegundos, y con el corte recortado hacia abajo el propio mensaje del
  // corte se quedaba fuera. O sea que el mensaje MÁS RECIENTE del otro lado, que
  // es justo el que importa, nunca llegaba a marcarse como leído.
  const updated = await client<{ id: string }[]>`
    update chat_messages
    set read_at = now()
    where thread_id = ${thread_id as unknown as string}::bigint
      and id <= ${upTo}::bigint
      and read_at is null
      and sender_role <> ${reader_role}
    returning id::text
  `;

  // El contador del lector se pone a cero pase lo que pase: aunque no quedara
  // nada por sellar, el hilo ya está visto.
  if (reader_role === 'coach') {
    await client`
      update chat_threads set unread_for_coach = 0, updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  } else {
    await client`
      update chat_threads set unread_for_athlete = 0, updated_at = now()
      where id = ${thread_id as unknown as string}::bigint
    `;
  }
  return { marked: updated.length };
}

// El pub/sub SSE vive en `./pubsub` (Postgres LISTEN/NOTIFY, entre instancias).
// `sendMessage` publica por ahí; la ruta del stream se suscribe por ahí.
