import 'server-only';

// El COMUNICADO, lado coach: escribirlo, guardarlo como plantilla, publicarlo a
// sus atletas y ver quién lo ha hecho (docs/DECISIONS.md, 2026-08-09).
//
// Lo que el coach escribe es su MÉTODO y va tal cual a la tabla; lo que este
// módulo impone es MECANISMO: que un protocolo tenga pasos, que una pregunta
// tenga entre dos y cuatro opciones con su consecuencia, que una tarea tenga
// fecha, y que solo se publique a atletas de SU roster. Nada de esto es opinión
// de entrenador — es lo que hace que el tipo signifique lo que dice.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  type CoachAthleteCommunicationDTO,
  type CoachCommunicationDTO,
  type CoachCommunicationDetailDTO,
  type CommunicationRecipientDTO,
  type CommunicationView,
  type CreateCommunicationInput,
  type LinkedCommunicationDTO,
  type UpdateCommunicationInput,
  claimsAttention,
  communicationState,
} from '@fahybrid/shared/domain/coach-communications';
import {
  CommunicationError,
  attachCamino,
  attachGraficas,
  communicationColumns,
  iso,
  loadItemsByCommunication,
  loadLinkedForCoach,
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
import {
  audioOf,
  insertItems,
  kindOnlyFields,
  linkedOf,
  requireLinkable,
} from './communications-rows';

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

function rowToDto(
  row: TrackedRow,
  items: CoachCommunicationDTO['items'],
  linked: LinkedCommunicationDTO | null = null,
): CoachCommunicationDTO {
  return {
    id: row.id,
    linked,
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
  const linked = await loadLinkedForCoach(client, enlaces(rows));
  return rows.map((row) => rowToDto(row, items.get(row.id) ?? [], enlaceDe(row, linked)));
}

/** Los ids enlazados de una tanda, sin los que no enlazan a nada. */
function enlaces(rows: { linked_communication_id: string | null }[]): string[] {
  return rows.flatMap((r) => (r.linked_communication_id ? [r.linked_communication_id] : []));
}

/** El enlace resuelto de una fila. Ausente del mapa = no le toca verlo (es la
 *  regla del atleta) o ya no existe. */
function enlaceDe(
  row: { linked_communication_id: string | null },
  mapa: Map<string, LinkedCommunicationDTO>,
): LinkedCommunicationDTO | null {
  return row.linked_communication_id ? (mapa.get(row.linked_communication_id) ?? null) : null;
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
  const linked = await loadLinkedForCoach(client, enlaces(rows));

  // El camino de la ficha se dibuja con el plan de ESTE atleta: es lo que él va
  // a ver en su móvil, y el coach tiene que estar mirando lo mismo. Una sola
  // consulta para toda la ficha, y sólo si alguna sección la pide.
  const pideCamino = [...items.values()].some(needsCamino);
  const camino = pideCamino
    ? await resolvePlanPath({ athlete_id: args.athlete_id, sql: client })
    : null;

  // Las gráficas se resuelven con los datos de ESTE atleta por la misma razón
  // que el camino: el coach tiene que estar mirando exactamente lo que él ve.
  const graficas = [...items.values()].some(needsGrafica)
    ? await resolveGraficas({ grupos: items.values(), athlete_id: args.athlete_id, sql: client })
    : new Map<string, ZoneChartDTO>();

  return rows.map((row): CoachAthleteCommunicationDTO => {
    const seen_at = iso(row.seen_at);
    const done_at = iso(row.done_at);
    const answered_at = iso(row.answered_at);
    const state = communicationState({ seen_at, done_at, answered_at });
    return {
      ...rowToDto(
        row,
        attachGraficas(attachCamino(items.get(row.id) ?? [], camino), graficas),
        enlaceDe(row, linked),
      ),
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

  const linked = await loadLinkedForCoach(client, enlaces([row]));
  return { ...rowToDto(row, items.get(row.id) ?? [], enlaceDe(row, linked)), recipients: detail };
}

// -----------------------------------------------------------------------------
// Escritura
//
// Cómo se traduce lo escrito a filas (qué columna usa cada tipo, qué se valida
// antes de guardar) vive en `communications-rows.ts`: aquí quedan los tres actos
// —crear, editar, retirar— y sus reglas de ciclo de vida.
// -----------------------------------------------------------------------------

export async function createCommunication(args: {
  coach_id: number | bigint;
  input: CreateCommunicationInput;
  sql?: Sql;
}): Promise<CoachCommunicationDetailDTO> {
  const client = args.sql ?? defaultSql;
  const { input } = args;
  const extra = kindOnlyFields(input);

  const linked = linkedOf(input);
  const audio = audioOf(input, args.coach_id);

  const id = await client.begin(async (tx) => {
    if (linked) await requireLinkable(tx, args.coach_id, linked);
    const inserted = await tx<{ id: string }[]>`
      insert into coach_communications (
        coach_id, kind, title, body, final_note,
        anchor_kind, anchor_ref, due_date, expires_at, blocks, is_template,
        linked_communication_id, audio_url, audio_seconds
      ) values (
        ${args.coach_id as number}, ${input.kind}, ${input.title}, ${input.body ?? null},
        ${extra.final_note}, ${input.anchor_kind},
        ${input.anchor_kind === 'general' ? null : (input.anchor_ref ?? null)},
        ${extra.due_date}, ${input.expires_at ?? null}, ${extra.blocks}, ${input.is_template},
        ${linked}, ${audio.url}, ${audio.seconds}
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

    const linked = linkedOf(input);
    if (linked) await requireLinkable(tx, args.coach_id, linked);
    const audio = audioOf(input, args.coach_id);

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
        linked_communication_id = ${linked},
        audio_url = ${audio.url},
        audio_seconds = ${audio.seconds},
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
