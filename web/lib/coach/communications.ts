import 'server-only';

// El COMUNICADO, lado coach: escribirlo, guardarlo como plantilla, publicarlo a
// sus atletas y ver quién lo ha hecho (docs/DECISIONS.md, 2026-08-09).
//
// Lo que el coach escribe es su MÉTODO y va tal cual a la tabla; lo que este
// módulo impone es MECANISMO: que un protocolo tenga pasos, que una pregunta
// tenga entre dos y cuatro opciones con su consecuencia, que una tarea tenga
// fecha, y que solo se publique a atletas de SU roster. Nada de esto es opinión
// de entrenador — es lo que hace que el tipo signifique lo que dice.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  QUESTION_MAX_OPTIONS,
  QUESTION_MIN_OPTIONS,
  type CoachAthleteCommunicationDTO,
  type CoachCommunicationDTO,
  type CoachCommunicationDetailDTO,
  type CommunicationRecipientDTO,
  type CommunicationView,
  type CreateCommunicationInput,
  type UpdateCommunicationInput,
  claimsAttention,
  communicationState,
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
import { notifyCommunicationPublished } from './communications-notify';

type TrackedRow = CommunicationRow & {
  recipients: number;
  seen: number;
  done: number;
  answered: number;
};

/** El agregado de seguimiento de UN comunicado, calculado en la propia consulta
 *  (la lista del coach no puede ser un N+1 sobre destinatarios). */
const trackingColumns = (client: DbClient) => client`
  select count(*)::int              as recipients,
         count(r.seen_at)::int      as seen,
         count(r.done_at)::int      as done,
         count(r.answered_at)::int  as answered
  from coach_communication_recipients r
  where r.communication_id = c.id
`;

function rowToDto(row: TrackedRow, items: CoachCommunicationDTO['items']): CoachCommunicationDTO {
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
    is_template: row.is_template,
    status: row.status,
    published_at: iso(row.published_at),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    items,
    tracking: {
      recipients: row.recipients,
      seen: row.seen,
      done: row.done,
      answered: row.answered,
    },
  };
}

/**
 * Las filas de la tabla hija que le tocan a cada tipo. Es UN sitio y no cinco:
 * los pasos de un protocolo, las opciones de una pregunta y las secciones de una
 * nota son la misma lista ordenada, y lo único que cambia es qué columnas usa.
 *
 * `checkable` sólo lo elige el coach en un PROTOCOLO. Fuera de ahí se escribe
 * `true` y es inerte: una opción se elige y una sección se lee, y ninguna de las
 * dos se marca (migración 0162).
 */
function itemRowsFor(input: CreateCommunicationInput) {
  if (input.kind === 'task' || input.kind === 'focus') return [];
  if (input.kind === 'question') {
    return input.items.map((option, index) => ({
      position: index + 1,
      label: null as string | null,
      content: option.content,
      consequence: option.consequence ?? null,
      checkable: true,
    }));
  }
  if (input.kind === 'protocol') {
    return input.items.map((paso, index) => ({
      position: index + 1,
      label: paso.label ?? null,
      content: paso.content,
      consequence: null as string | null,
      checkable: paso.checkable,
    }));
  }
  return input.items.map((seccion, index) => ({
    position: index + 1,
    label: seccion.label,
    content: seccion.content,
    consequence: null as string | null,
    checkable: true,
  }));
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

export async function listCommunications(args: {
  coach_id: number | bigint;
  view: CommunicationView;
  sql?: Sql;
}): Promise<CoachCommunicationDTO[]> {
  const client = args.sql ?? defaultSql;
  // Las tres vistas del coach son excluyentes: la biblioteca (plantillas), lo
  // que aún no ha salido (borradores) y lo que ya está en la app del atleta
  // (publicados, incluidos los archivados — siguen siendo su historial).
  const viewPredicate =
    args.view === 'templates'
      ? client`c.is_template = true`
      : args.view === 'drafts'
        ? client`c.is_template = false and c.status = 'draft'`
        : client`c.is_template = false and c.status in ('published', 'archived')`;

  const rows = await client<TrackedRow[]>`
    select ${communicationColumns(client)},
           t.recipients, t.seen, t.done, t.answered
    from coach_communications c
    left join lateral (${trackingColumns(client)}) t on true
    where c.coach_id = ${args.coach_id as number} and ${viewPredicate}
    order by coalesce(c.published_at, c.updated_at) desc, c.id desc
  `;

  const items = await loadItemsByCommunication(
    client,
    rows.map((r) => r.id),
  );
  return rows.map((row) => rowToDto(row, items.get(row.id) ?? []));
}

/**
 * Lo que el coach le ha comunicado a UN atleta, con el estado de ese atleta.
 *
 * Es la lectura de la FICHA (docs/DECISIONS.md 2026-08-09, corrección de Alex:
 * no hay pestaña global — con cien atletas el coach piensa en EL atleta, no en
 * la feature). Incluye lo archivado a propósito: la ficha es el historial de lo
 * que le dijo, no solo lo que sigue vivo en su bandeja.
 */
export async function listCommunicationsForAthlete(args: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  sql?: Sql;
}): Promise<CoachAthleteCommunicationDTO[]> {
  const client = args.sql ?? defaultSql;

  // El atleta tiene que ser SUYO. Sin esto, un id ajeno devolvería una lista
  // vacía y parecería que a ese atleta no se le ha comunicado nada.
  const owned = await client<{ id: string }[]>`
    select id::text as id from athletes
    where id = ${args.athlete_id as number} and coach_id = ${args.coach_id as number}
    limit 1
  `;
  if (!owned[0]) throw new CommunicationError('not_found', 'Atleta no encontrado', 404);

  type AthleteRow = TrackedRow & {
    recipient_id: string;
    seen_at: Date | null;
    done_at: Date | null;
    answered_item_id: string | null;
    answered_at: Date | null;
  };

  const rows = await client<AthleteRow[]>`
    select ${communicationColumns(client)},
           t.recipients, t.seen, t.done, t.answered,
           r.id::text as recipient_id,
           r.seen_at, r.done_at,
           r.answered_item_id::text as answered_item_id,
           r.answered_at
    from coach_communication_recipients r
    join coach_communications c on c.id = r.communication_id
    left join lateral (${trackingColumns(client)}) t on true
    where r.athlete_id = ${args.athlete_id as number}
      and c.coach_id = ${args.coach_id as number}
    order by c.published_at desc, c.id desc
  `;

  const items = await loadItemsByCommunication(
    client,
    rows.map((r) => r.id),
  );
  const marks = await loadMarksByRecipient(
    client,
    rows.map((r) => r.recipient_id),
  );

  return rows.map((row): CoachAthleteCommunicationDTO => {
    const seen_at = iso(row.seen_at);
    const done_at = iso(row.done_at);
    const answered_at = iso(row.answered_at);
    const state = communicationState({ seen_at, done_at, answered_at });
    return {
      ...rowToDto(row, items.get(row.id) ?? []),
      athlete_state: {
        athlete_id: String(args.athlete_id),
        state,
        seen_at,
        done_at,
        answered_item_id: row.answered_item_id,
        answered_at,
        marked_item_ids: marks.get(row.recipient_id) ?? [],
        // Un comunicado archivado ya no reclama nada: el coach lo retiró.
        claims_attention: row.status === 'archived' ? false : claimsAttention(row.kind, state),
      },
    };
  });
}

/** Un comunicado del coach con el detalle atleta a atleta de quién lo ha hecho. */
export async function getCommunication(args: {
  coach_id: number | bigint;
  id: string | number;
  sql?: Sql;
}): Promise<CoachCommunicationDetailDTO> {
  const client = args.sql ?? defaultSql;
  const rows = await client<TrackedRow[]>`
    select ${communicationColumns(client)},
           t.recipients, t.seen, t.done, t.answered
    from coach_communications c
    left join lateral (${trackingColumns(client)}) t on true
    where c.id = ${String(args.id)}::bigint and c.coach_id = ${args.coach_id as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw notFound();

  const items = await loadItemsByCommunication(client, [row.id]);
  const recipients = await client<
    {
      athlete_id: string;
      athlete_full_name: string;
      seen_at: Date | null;
      done_at: Date | null;
      answered_item_id: string | null;
      answered_at: Date | null;
      marked_items: number;
    }[]
  >`
    select r.athlete_id::text as athlete_id,
           a.full_name as athlete_full_name,
           r.seen_at, r.done_at,
           r.answered_item_id::text as answered_item_id,
           r.answered_at,
           (
             select count(*)::int from coach_communication_item_marks m
             where m.recipient_id = r.id
           ) as marked_items
    from coach_communication_recipients r
    join athletes a on a.id = r.athlete_id
    where r.communication_id = ${row.id}::bigint
    order by a.full_name asc
  `;

  const detail: CommunicationRecipientDTO[] = recipients.map((r) => ({
    athlete_id: r.athlete_id,
    athlete_full_name: r.athlete_full_name,
    state: communicationState({
      seen_at: iso(r.seen_at),
      done_at: iso(r.done_at),
      answered_at: iso(r.answered_at),
    }),
    seen_at: iso(r.seen_at),
    done_at: iso(r.done_at),
    answered_item_id: r.answered_item_id,
    answered_at: iso(r.answered_at),
    marked_items: r.marked_items,
  }));

  return { ...rowToDto(row, items.get(row.id) ?? []), recipients: detail };
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

async function insertItems(
  tx: TransactionClient,
  communication_id: string,
  input: CreateCommunicationInput,
): Promise<void> {
  const rows = itemRowsFor(input).map((r) => ({ ...r, communication_id }));
  if (rows.length === 0) return;
  await tx`
    insert into coach_communication_items ${tx(
      rows,
      'communication_id',
      'position',
      'label',
      'content',
      'consequence',
      'checkable',
    )}
  `;
}

/** Los campos que solo existen en un tipo. Se escriben null en los demás para
 *  que la fila no pueda contradecir a su propio tipo. */
function kindOnlyFields(input: CreateCommunicationInput) {
  return {
    final_note: input.kind === 'protocol' ? (input.final_note ?? null) : null,
    due_date: input.kind === 'task' ? input.due_date : null,
    blocks: input.kind === 'question' ? input.blocks : false,
  };
}

export async function createCommunication(args: {
  coach_id: number | bigint;
  input: CreateCommunicationInput;
  sql?: Sql;
}): Promise<CoachCommunicationDetailDTO> {
  const client = args.sql ?? defaultSql;
  const { input } = args;
  const extra = kindOnlyFields(input);

  const id = await client.begin(async (tx) => {
    const inserted = await tx<{ id: string }[]>`
      insert into coach_communications (
        coach_id, kind, title, body, final_note,
        anchor_kind, anchor_ref, due_date, expires_at, blocks, is_template
      ) values (
        ${args.coach_id as number}, ${input.kind}, ${input.title}, ${input.body ?? null},
        ${extra.final_note}, ${input.anchor_kind},
        ${input.anchor_kind === 'general' ? null : (input.anchor_ref ?? null)},
        ${extra.due_date}, ${input.expires_at ?? null}, ${extra.blocks}, ${input.is_template}
      )
      returning id::text as id
    `;
    const newId = inserted[0]!.id;
    await insertItems(tx, newId, input);
    return newId;
  });

  return getCommunication({ coach_id: args.coach_id, id, sql: client });
}

/**
 * Editar reescribe el comunicado entero, items incluidos. Solo sobre borradores
 * y plantillas: lo publicado ya lo ha leído alguien, y cambiarle el suelo a un
 * atleta que ya marcó tres pasos es corromper su historial, no editar.
 */
export async function updateCommunication(args: {
  coach_id: number | bigint;
  id: string | number;
  input: UpdateCommunicationInput;
  sql?: Sql;
}): Promise<CoachCommunicationDetailDTO> {
  const client = args.sql ?? defaultSql;
  const { input } = args;
  const extra = kindOnlyFields(input);

  await client.begin(async (tx) => {
    const rows = await tx<{ id: string; status: string; is_template: boolean }[]>`
      select id::text as id, status, is_template
      from coach_communications
      where id = ${String(args.id)}::bigint and coach_id = ${args.coach_id as number}
      for update
    `;
    const row = rows[0];
    if (!row) throw notFound();
    if (row.status !== 'draft') {
      throw new CommunicationError(
        'already_published',
        'Un comunicado publicado ya no se edita: archívalo y publica uno nuevo',
        409,
      );
    }

    await tx`
      update coach_communications set
        kind = ${input.kind},
        title = ${input.title},
        body = ${input.body ?? null},
        final_note = ${extra.final_note},
        anchor_kind = ${input.anchor_kind},
        anchor_ref = ${input.anchor_kind === 'general' ? null : (input.anchor_ref ?? null)},
        due_date = ${extra.due_date},
        expires_at = ${input.expires_at ?? null},
        blocks = ${extra.blocks},
        is_template = ${input.is_template},
        updated_at = now()
      where id = ${row.id}::bigint
    `;
    await tx`delete from coach_communication_items where communication_id = ${row.id}::bigint`;
    await insertItems(tx, row.id, input);
  });

  return getCommunication({ coach_id: args.coach_id, id: args.id, sql: client });
}

/**
 * Un borrador se borra de verdad (no lo ha visto nadie); lo publicado se
 * ARCHIVA — desaparece de la bandeja del atleta pero el coach conserva quién lo
 * hizo. Borrar de verdad lo publicado se llevaría por delante ese historial.
 */
export async function deleteCommunication(args: {
  coach_id: number | bigint;
  id: string | number;
  sql?: Sql;
}): Promise<{ id: string; outcome: 'deleted' | 'archived' }> {
  const client = args.sql ?? defaultSql;
  return client.begin(async (tx) => {
    const rows = await tx<{ id: string; status: string }[]>`
      select id::text as id, status from coach_communications
      where id = ${String(args.id)}::bigint and coach_id = ${args.coach_id as number}
      for update
    `;
    const row = rows[0];
    if (!row) throw notFound();

    if (row.status === 'draft') {
      await tx`delete from coach_communications where id = ${row.id}::bigint`;
      return { id: row.id, outcome: 'deleted' as const };
    }
    await tx`
      update coach_communications set status = 'archived', updated_at = now()
      where id = ${row.id}::bigint
    `;
    return { id: row.id, outcome: 'archived' as const };
  });
}
