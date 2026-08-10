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
  attachCamino,
  attachGraficas,
  communicationColumns,
  iso,
  loadItemsByCommunication,
  loadLinkedForAthlete,
  loadMarksByRecipient,
  needsCamino,
  needsGrafica,
  notFound,
  type CommunicationRow,
  type DbClient,
} from '@/lib/communications/store';
import { resolveGraficas } from '@/lib/communications/grafica';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import { resolvePlanPath } from '@/lib/plan/camino';

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
  const linked = await loadLinkedForAthlete(
    client,
    rows.flatMap((r) => (r.linked_communication_id ? [r.linked_communication_id] : [])),
    args.athlete_id,
  );

  // Su camino, una vez para toda la bandeja y sólo si alguna nota lo pide. Sin
  // plan activo viaja null y la app no lo pinta: un camino de cero pasos sería
  // decirle que su plan está vacío cuando lo que pasa es que aún no empieza.
  const pideCamino = [...items.values()].some(needsCamino);
  const camino = pideCamino
    ? await resolvePlanPath({ athlete_id: args.athlete_id, sql: client })
    : null;

  // Y sus barras de tiempo en zonas, una consulta por PERIODO distinto (no por
  // sección): el feedback del coach suele mirar el mismo trozo de calendario en
  // todas sus gráficas.
  const graficas = [...items.values()].some(needsGrafica)
    ? await resolveGraficas({ grupos: items.values(), athlete_id: args.athlete_id, sql: client })
    : new Map<string, ZoneChartDTO>();

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
      audio_url: row.audio_url,
      audio_seconds: row.audio_seconds,
      // Publicado por definición (lo filtra la consulta): nunca es null aquí.
      published_at: iso(row.published_at)!,
      coach_name: row.coach_name,
      items: attachGraficas(attachCamino(items.get(row.id) ?? [], camino), graficas),
      state,
      seen_at,
      done_at,
      answered_item_id: row.answered_item_id,
      answered_at,
      marked_item_ids: marks.get(row.recipient_id) ?? [],
      claims_attention: claimsAttention(row.kind, state),
      // El enlace sólo viaja si el enlazado también es suyo: si no, le estaría
      // enseñando que existe algo que no puede abrir.
      linked: row.linked_communication_id
        ? (linked.get(row.linked_communication_id) ?? null)
        : null,
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
 * entero. Decir «hecho» de un protocolo marca todos sus pasos CON CASILLA — si
 * no, la pantalla del atleta y la del coach contarían cosas distintas del mismo
 * hecho. Los pasos de lectura no se tocan: no tienen nada que marcar.
 *
 * Un protocolo sin ninguna casilla también se admite aquí, por el mismo camino
 * que una tarea: su «hecho» es declarado y no derivado. La app del atleta hoy no
 * se lo ofrece (leerlo es el acto), pero el endpoint no lo prohíbe.
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
          and i.checkable
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
 * Sólo se marca lo que lleva casilla: un paso de lectura no es un paso a medias,
 * es un paso que no se marca, y admitirlo aquí inventaría un estado que el
 * atleta no puede ver ni retirar.
 *
 * El `done_at` del protocolo se DERIVA de aquí y no se declara aparte: está
 * hecho cuando lo están todos sus pasos con casilla, y deja de estarlo si el
 * atleta se desmarca uno. Un «hecho» declarado por un lado y unos pasos a medias
 * por otro serían dos verdades sobre el mismo hecho.
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
  const paso = await requireItem(client, recipient.communication_id, args.item_id);
  if (!paso.checkable) {
    throw new CommunicationError(
      'not_checkable',
      'Ese paso es para leerlo: no lleva casilla',
      409,
    );
  }

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
 * EL «HECHO» DE UN PROTOCOLO, Y DÓNDE SE DECIDE: aquí, en un solo sitio.
 *
 * Se deriva de los pasos CON CASILLA (`checkable`, migración 0162): se sella
 * cuando no queda ninguno sin marcar y se retira en cuanto vuelve a quedar uno.
 * Los pasos de lectura no cuentan — nunca se marcan, así que contarlos dejaría
 * el protocolo abierto para siempre.
 *
 * Un protocolo SIN ninguna casilla deja de derivarse: no hay nada de lo que
 * derivar. Su `done_at` se queda como esté, y el único que puede ponerlo es el
 * «hecho» explícito (`force`), igual que en una tarea. Por eso el caso sin
 * casillas se resuelve ANTES que la derivación: si cayera en ella, cada acto
 * posterior le borraría el hecho que declaró el atleta.
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
          where i.communication_id = r.communication_id and i.checkable
        ) = 0 then r.done_at
        when not exists (
          select 1 from coach_communication_items i
          where i.communication_id = r.communication_id
            and i.checkable
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
): Promise<{ id: string; checkable: boolean }> {
  const rows = await client<{ id: string; checkable: boolean }[]>`
    select id::text as id, checkable from coach_communication_items
    where id = ${String(item_id)}::bigint and communication_id = ${communication_id}::bigint
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new CommunicationError('unknown_item', 'Esa opción no es de este comunicado', 400);
  }
  return row;
}
