import 'server-only';

// El COMUNICADO, lado atleta: su bandeja y los actos que la cierran
// (docs/DECISIONS.md, 2026-08-09).
//
// La bandeja existe porque hoy un push perdido es un mensaje perdido: lo que el
// coach manda vive en un hilo de chat que se entierra solo. Aquí lo que reclama
// algo sube, y lo que ya se cerró baja — pero nada desaparece hasta que el coach
// lo archiva o caduca.
//
// Cada acto es del TIPO que lo admite y de nadie más: se marcan los pasos de un
// protocolo, se responde una pregunta, se cierra una tarea. Pedir «hecho» sobre
// una nota no es un caso raro que haya que tolerar: es una llamada equivocada.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  claimsAttention,
  communicationState,
  sortInbox,
  type AthleteCommunicationDTO,
  type CommunicationKind,
  type CommunicationState,
} from '@fahybrid/shared/domain/coach-communications';
import {
  CommunicationError,
  communicationColumns,
  iso,
  loadItemsByCommunication,
  loadMarksByRecipient,
  notFound,
  type CommunicationRow,
  type DbClient,
} from '@/lib/communications/store';

type InboxRow = CommunicationRow & {
  coach_name: string | null;
  recipient_id: string;
  seen_at: Date | null;
  done_at: Date | null;
  answered_item_id: string | null;
  answered_at: Date | null;
};

/**
 * La bandeja: lo que el coach le ha publicado a ESTE atleta y sigue vivo.
 *
 * Vivo = publicado, no archivado y no caducado. El foco no caduca nunca (lo
 * garantiza el esquema), así que siempre está. El orden lo pone el dominio
 * compartido — es contrato, no una decisión de esta consulta.
 */
export async function listAthleteCommunications(args: {
  athlete_id: number | bigint;
  sql?: Sql;
}): Promise<AthleteCommunicationDTO[]> {
  const client = args.sql ?? defaultSql;
  const rows = await client<InboxRow[]>`
    select ${communicationColumns(client)},
           co.full_name as coach_name,
           r.id::text as recipient_id,
           r.seen_at, r.done_at,
           r.answered_item_id::text as answered_item_id,
           r.answered_at
    from coach_communication_recipients r
    join coach_communications c on c.id = r.communication_id
    left join coaches co on co.id = c.coach_id
    where r.athlete_id = ${args.athlete_id as number}
      and c.status = 'published'
      and (c.expires_at is null or c.expires_at > now())
  `;
  if (rows.length === 0) return [];

  const items = await loadItemsByCommunication(
    client,
    rows.map((r) => r.id),
  );
  const marks = await loadMarksByRecipient(
    client,
    rows.map((r) => r.recipient_id),
  );

  const inbox = rows.map((row): AthleteCommunicationDTO => {
    const seen_at = iso(row.seen_at);
    const done_at = iso(row.done_at);
    const answered_at = iso(row.answered_at);
    const state = communicationState({ seen_at, done_at, answered_at });
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      final_note: row.final_note,
      anchor_kind: row.anchor_kind,
      anchor_ref: row.anchor_ref,
      due_date: row.due_date,
      expires_at: iso(row.expires_at),
      blocks: row.blocks,
      // Publicado por definición (lo filtra la consulta): nunca es null aquí.
      published_at: iso(row.published_at)!,
      coach_name: row.coach_name,
      items: items.get(row.id) ?? [],
      state,
      seen_at,
      done_at,
      answered_item_id: row.answered_item_id,
      answered_at,
      marked_item_ids: marks.get(row.recipient_id) ?? [],
      claims_attention: claimsAttention(row.kind, state),
    };
  });

  return sortInbox(inbox);
}

// -----------------------------------------------------------------------------
// Los actos del atleta
// -----------------------------------------------------------------------------

type Recipient = {
  recipient_id: string;
  communication_id: string;
  kind: CommunicationKind;
};

/**
 * El destinatario que soy yo, o 404.
 *
 * Un comunicado del que no eres destinatario NO existe para ti: se responde 404
 * y no 403 a propósito, porque un 403 confirmaría que ese id es de alguien.
 */
async function requireRecipient(
  client: DbClient,
  athlete_id: number | bigint,
  communication_id: string | number,
): Promise<Recipient> {
  const rows = await client<Recipient[]>`
    select r.id::text as recipient_id, c.id::text as communication_id, c.kind
    from coach_communication_recipients r
    join coach_communications c on c.id = r.communication_id
    where r.communication_id = ${String(communication_id)}::bigint
      and r.athlete_id = ${athlete_id as number}
      and c.status = 'published'
    limit 1
  `;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

/** El estado del destinatario tal y como queda tras el acto. */
export type RecipientStateDTO = {
  communication_id: string;
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  marked_item_ids: string[];
};

async function readRecipientState(
  client: DbClient,
  recipient: Recipient,
): Promise<RecipientStateDTO> {
  const rows = await client<
    {
      seen_at: Date | null;
      done_at: Date | null;
      answered_item_id: string | null;
      answered_at: Date | null;
    }[]
  >`
    select seen_at, done_at, answered_item_id::text as answered_item_id, answered_at
    from coach_communication_recipients where id = ${recipient.recipient_id}::bigint
  `;
  const row = rows[0]!;
  const marks = await loadMarksByRecipient(client, [recipient.recipient_id]);
  const seen_at = iso(row.seen_at);
  const done_at = iso(row.done_at);
  const answered_at = iso(row.answered_at);
  return {
    communication_id: recipient.communication_id,
    state: communicationState({ seen_at, done_at, answered_at }),
    seen_at,
    done_at,
    answered_item_id: row.answered_item_id,
    answered_at,
    marked_item_ids: marks.get(recipient.recipient_id) ?? [],
  };
}

/** Visto. Se sella la PRIMERA vez y no se vuelve a tocar: la fecha en que lo
 *  abriste es un hecho, no un contador de aperturas. */
export async function markCommunicationSeen(args: {
  athlete_id: number | bigint;
  communication_id: string | number;
  sql?: Sql;
}): Promise<RecipientStateDTO> {
  const client = args.sql ?? defaultSql;
  const recipient = await requireRecipient(client, args.athlete_id, args.communication_id);
  await client`
    update coach_communication_recipients set seen_at = now()
    where id = ${recipient.recipient_id}::bigint and seen_at is null
  `;
  return readRecipientState(client, recipient);
}

/**
 * Hecho. Solo lo que pide un acto que se cierra: una tarea, o un protocolo
 * entero. Decir «hecho» de un protocolo marca TODOS sus pasos — si no, la
 * pantalla del atleta y la del coach contarían cosas distintas del mismo hecho.
 *
 * Una pregunta se cierra respondiendo, no diciendo «hecho»; una nota y un foco
 * no se cierran: leerlos era el acto.
 */
export async function markCommunicationDone(args: {
  athlete_id: number | bigint;
  communication_id: string | number;
  sql?: Sql;
}): Promise<RecipientStateDTO> {
  const client = args.sql ?? defaultSql;
  const recipient = await requireRecipient(client, args.athlete_id, args.communication_id);
  if (recipient.kind !== 'task' && recipient.kind !== 'protocol') {
    throw new CommunicationError(
      'not_actionable',
      recipient.kind === 'question'
        ? 'Una pregunta se cierra respondiendo'
        : 'Este comunicado no se marca como hecho',
      409,
    );
  }

  await client.begin(async (tx) => {
    if (recipient.kind === 'protocol') {
      await tx`
        insert into coach_communication_item_marks (recipient_id, item_id)
        select ${recipient.recipient_id}::bigint, i.id
        from coach_communication_items i
        where i.communication_id = ${recipient.communication_id}::bigint
        on conflict (recipient_id, item_id) do nothing
      `;
    }
    await stampDone(tx, recipient.recipient_id, true);
  });

  return readRecipientState(client, recipient);
}

/** Responder una pregunta: la opción elegida es de ESTE comunicado, o no vale. */
export async function answerCommunication(args: {
  athlete_id: number | bigint;
  communication_id: string | number;
  item_id: string | number;
  sql?: Sql;
}): Promise<RecipientStateDTO> {
  const client = args.sql ?? defaultSql;
  const recipient = await requireRecipient(client, args.athlete_id, args.communication_id);
  if (recipient.kind !== 'question') {
    throw new CommunicationError('not_a_question', 'Este comunicado no se responde', 409);
  }
  await requireItem(client, recipient.communication_id, args.item_id);

  await client`
    update coach_communication_recipients set
      answered_item_id = ${String(args.item_id)}::bigint,
      answered_at = now(),
      seen_at = coalesce(seen_at, now())
    where id = ${recipient.recipient_id}::bigint
  `;
  return readRecipientState(client, recipient);
}

/**
 * Marcar (o desmarcar) UN paso de un protocolo. La fila EXISTE = ese paso está
 * hecho, así que desmarcar la borra.
 *
 * El `done_at` del protocolo se DERIVA de aquí y no se declara aparte: está
 * hecho cuando lo están todos sus pasos, y deja de estarlo si el atleta se
 * desmarca uno. Un «hecho» declarado por un lado y unos pasos a medias por otro
 * serían dos verdades sobre el mismo hecho.
 */
export async function setCommunicationItemMark(args: {
  athlete_id: number | bigint;
  communication_id: string | number;
  item_id: string | number;
  done: boolean;
  sql?: Sql;
}): Promise<RecipientStateDTO> {
  const client = args.sql ?? defaultSql;
  const recipient = await requireRecipient(client, args.athlete_id, args.communication_id);
  if (recipient.kind !== 'protocol') {
    throw new CommunicationError(
      'not_a_protocol',
      'Solo un protocolo se marca paso a paso',
      409,
    );
  }
  await requireItem(client, recipient.communication_id, args.item_id);

  await client.begin(async (tx) => {
    if (args.done) {
      await tx`
        insert into coach_communication_item_marks (recipient_id, item_id)
        values (${recipient.recipient_id}::bigint, ${String(args.item_id)}::bigint)
        on conflict (recipient_id, item_id) do nothing
      `;
    } else {
      await tx`
        delete from coach_communication_item_marks
        where recipient_id = ${recipient.recipient_id}::bigint
          and item_id = ${String(args.item_id)}::bigint
      `;
    }
    // Marcar un paso también es abrirlo: si el atleta empieza, ya lo ha visto.
    await tx`
      update coach_communication_recipients set seen_at = coalesce(seen_at, now())
      where id = ${recipient.recipient_id}::bigint
    `;
    await stampDone(tx, recipient.recipient_id, false);
  });

  return readRecipientState(client, recipient);
}

/**
 * El `done_at` derivado de los pasos marcados: se sella cuando no queda ninguno
 * sin marcar y se retira en cuanto vuelve a quedar uno. `force` es el «hecho»
 * explícito, que llega justo después de marcarlos todos.
 */
async function stampDone(
  tx: TransactionClient,
  recipient_id: string,
  force: boolean,
): Promise<void> {
  await tx`
    update coach_communication_recipients r set
      done_at = case
        when ${force}::boolean then coalesce(r.done_at, now())
        when (
          select count(*) from coach_communication_items i
          where i.communication_id = r.communication_id
        ) > 0 and not exists (
          select 1 from coach_communication_items i
          where i.communication_id = r.communication_id
            and not exists (
              select 1 from coach_communication_item_marks m
              where m.recipient_id = r.id and m.item_id = i.id
            )
        ) then coalesce(r.done_at, now())
        else null
      end,
      seen_at = coalesce(r.seen_at, now())
    where r.id = ${recipient_id}::bigint
  `;
}

/** Un item que no es de este comunicado no es una opción inválida: es otro
 *  comunicado, y contestarlo desde aquí sería escribir en la fila de otro. */
async function requireItem(
  client: DbClient,
  communication_id: string,
  item_id: string | number,
): Promise<void> {
  const rows = await client<{ id: string }[]>`
    select id::text as id from coach_communication_items
    where id = ${String(item_id)}::bigint and communication_id = ${communication_id}::bigint
    limit 1
  `;
  if (!rows[0]) {
    throw new CommunicationError('unknown_item', 'Esa opción no es de este comunicado', 400);
  }
}
