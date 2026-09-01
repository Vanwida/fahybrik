import 'server-only';

// PUBLICAR un comunicado: comprobar su forma, repartirlo a SU roster y avisar.
//
// Vive aparte de `communications.ts` porque es el único acto de los cinco que
// sale del dashboard: los demás escriben una fila, éste crea el estado por
// atleta y manda un push. Y es el único que puede rechazar algo que ya estaba
// guardado, porque un borrador pudo quedarse a medias.
//
// La dependencia va en UN solo sentido (esto no lo importa nadie de allí), así
// que las dos mitades del servicio del coach no pueden enredarse.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  QUESTION_MAX_OPTIONS,
  QUESTION_MIN_OPTIONS,
} from '@fahybrid/shared/domain/coach-communications';
import {
  CommunicationError,
  notFound,
  type CommunicationRow,
} from '@/lib/communications/store';
import { notifyCommunicationPublished } from './communications-notify';

/** Los tipos cuya forma depende de la tabla hija: el resto se cierra en su fila. */
const KINDS_WITH_ITEMS = ['protocol', 'question', 'note'] as const;

function hasItems(kind: CommunicationRow['kind']): boolean {
  return (KINDS_WITH_ITEMS as readonly string[]).includes(kind);
}

/**
 * ¿Está el comunicado lo bastante escrito como para salir?
 *
 * Un protocolo puede ser sólo texto desde que el check es del paso (0162), así
 * que lo que se le exige es que haya ALGO que leer, no una lista de casillas.
 * Una pregunta sigue necesitando entre dos y cuatro opciones (con una no se
 * puede contestar) y una nota sus secciones.
 */
function shapeIsPublishable(row: Pick<CommunicationRow, 'kind' | 'body'>, items: number): boolean {
  if (row.kind === 'question') return items >= QUESTION_MIN_OPTIONS && items <= QUESTION_MAX_OPTIONS;
  if (row.kind === 'note') return items >= 1;
  if (row.kind === 'protocol') return items >= 1 || (row.body ?? '').trim().length > 0;
  return true;
}

export type PublishResult = {
  id: string;
  published_at: string;
  recipients: number;
  new_recipients: number;
};

export async function publishCommunication(args: {
  coach_id: number | bigint;
  id: string | number;
  athlete_ids: number[];
  sql?: Sql;
}): Promise<PublishResult> {
  const client = args.sql ?? defaultSql;

  const result = await client.begin(async (tx) => {
    const rows = await tx<
      { id: string; kind: CommunicationRow['kind']; title: string; body: string | null; status: string; is_template: boolean; published_at: Date | null }[]
    >`
      select id::text as id, kind, title, body, status, is_template, published_at
      from coach_communications
      where id = ${String(args.id)}::bigint and coach_id = ${args.coach_id as number}
      for update
    `;
    const row = rows[0];
    if (!row) throw notFound();
    if (row.is_template) {
      throw new CommunicationError(
        'template_not_publishable',
        'Una plantilla es un molde: duplícala para publicarla',
        409,
      );
    }
    if (row.status === 'archived') {
      throw new CommunicationError('archived', 'Un comunicado archivado no se publica', 409);
    }

    // La forma se comprueba AQUÍ y no solo al crear: un borrador pudo quedarse a
    // medias, y publicar una pregunta con una sola opción es publicar algo que
    // el atleta no puede contestar.
    if (hasItems(row.kind)) {
      const counted = await tx<{ n: number }[]>`
        select count(*)::int as n from coach_communication_items
        where communication_id = ${row.id}::bigint
      `;
      if (!shapeIsPublishable(row, counted[0]?.n ?? 0)) {
        throw new CommunicationError(
          'incomplete',
          'El comunicado no está completo para publicarse',
          422,
        );
      }
    }

    // Solo a SU roster. Un id ajeno no es un 403 parcial: la publicación entera
    // se rechaza, porque publicar "a casi todos" sin decirlo es peor que fallar.
    const roster = await tx<{ id: string }[]>`
      select id::text as id from athletes
      where coach_id = ${args.coach_id as number} and id = any(${args.athlete_ids}::bigint[])
    `;
    if (roster.length !== args.athlete_ids.length) {
      throw new CommunicationError(
        'unknown_athlete',
        'Algún atleta no pertenece a tu roster',
        400,
      );
    }

    const publishedAt =
      row.published_at ??
      (
        await tx<{ published_at: Date }[]>`
          update coach_communications
          set status = 'published', published_at = now(), updated_at = now()
          where id = ${row.id}::bigint
          returning published_at
        `
      )[0]!.published_at;

    // Re-publicar a más atletas es añadir destinatarios, nunca reiniciar a los
    // que ya lo tenían: `do nothing` protege el estado que ya habían dejado.
    const inserted = await tx<{ id: string }[]>`
      insert into coach_communication_recipients (communication_id, athlete_id)
      select ${row.id}::bigint, unnest(${args.athlete_ids}::bigint[])
      on conflict (communication_id, athlete_id) do nothing
      returning id::text as id
    `;
    const total = await tx<{ n: number }[]>`
      select count(*)::int as n from coach_communication_recipients
      where communication_id = ${row.id}::bigint
    `;

    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      published_at: publishedAt.toISOString(),
      recipients: total[0]?.n ?? 0,
      new_recipients: inserted.length,
    };
  });

  // El aviso va DESPUÉS de que la transacción cierre: un push lento no puede
  // sostener abierta la fila del comunicado, y si el envío falla la publicación
  // sigue siendo válida (la bandeja es el canal durable, el push la cortesía).
  await notifyCommunicationPublished({
    sql: client,
    communication_id: result.id,
    kind: result.kind,
    title: result.title,
    body: result.body,
    athlete_ids: args.athlete_ids,
  });

  return {
    id: result.id,
    published_at: result.published_at,
    recipients: result.recipients,
    new_recipients: result.new_recipients,
  };
}
