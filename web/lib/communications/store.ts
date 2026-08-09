import 'server-only';

// La capa de lectura compartida del COMUNICADO (docs/DECISIONS.md, 2026-08-09).
//
// El coach y el atleta miran la MISMA entidad desde dos lados: él la escribe y
// mira quién la ha hecho, ella la recibe y la cierra. Las columnas, el mapeo a
// DTO y la carga de la lista ordenada de items viven aquí una sola vez para que
// las dos vistas no puedan divergir — que es exactamente el fallo que tuvo el
// chat cuando el coach y el atleta tenían cada uno su módulo.

import type { Sql, TransactionClient } from '@/lib/db';
import {
  communicationState,
  type CommunicationAnchor,
  type CommunicationDisplay,
  type CommunicationItemDTO,
  type CommunicationKind,
  type CommunicationSegmentDTO,
  type CommunicationStatus,
  type LinkedCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';

/** Pool o transacción: todo helper de aquí sirve para los dos. */
export type DbClient = Sql | TransactionClient;

/** Error de dominio con código y status HTTP, para que la ruta no los invente. */
export class CommunicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CommunicationError';
  }
}

export const notFound = () =>
  new CommunicationError('not_found', 'Comunicado no encontrado', 404);

/** ISO estricto con `Z` — lo que acepta el decodificador de iOS. */
export const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export type CommunicationRow = {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: Date | null;
  blocks: boolean;
  is_template: boolean;
  status: CommunicationStatus;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  linked_communication_id: string | null;
};

/**
 * Las columnas del comunicado, cualificadas por `c`. Es una FÁBRICA (fragmento
 * nuevo por llamada) porque postgres.js no permite reutilizar el mismo fragmento
 * en dos consultas. `due_date` va a texto a propósito: es un día del calendario,
 * y convertirlo a `Date` lo movería de día según la zona del servidor.
 */
export const communicationColumns = (client: DbClient) => client`
  c.id::text as id, c.kind, c.title, c.body, c.final_note,
  c.anchor_kind, c.anchor_ref, c.due_date::text as due_date, c.expires_at,
  c.blocks, c.is_template, c.status, c.published_at, c.created_at, c.updated_at,
  c.linked_communication_id::text as linked_communication_id
`;

export type ItemRow = {
  id: string;
  communication_id: string;
  position: number;
  label: string | null;
  content: string;
  consequence: string | null;
  checkable: boolean;
  display: CommunicationDisplay;
};

export function rowToItemDto(r: ItemRow, segments: CommunicationSegmentDTO[] = []): CommunicationItemDTO {
  return {
    id: r.id,
    position: r.position,
    label: r.label,
    content: r.content,
    consequence: r.consequence,
    checkable: r.checkable,
    display: r.display,
    segments,
    // El camino no se lee de la tabla: se resuelve con el plan del atleta al
    // servir (`attachCamino`). Aquí siempre sale null, que es lo correcto en
    // toda lectura sin un atleta delante — la biblioteca del coach, por ejemplo.
    camino: null,
  };
}

/**
 * Los items de varios comunicados de una sola consulta, agrupados por id y ya en
 * orden. Una consulta por comunicado sería N+1 en la bandeja del atleta, que es
 * justo la lectura más caliente de toda la feature.
 */
export async function loadItemsByCommunication(
  client: DbClient,
  communicationIds: string[],
): Promise<Map<string, CommunicationItemDTO[]>> {
  const grouped = new Map<string, CommunicationItemDTO[]>();
  if (communicationIds.length === 0) return grouped;

  const rows = await client<ItemRow[]>`
    select id::text as id, communication_id::text as communication_id,
           position, label, content, consequence, checkable, display
    from coach_communication_items
    where communication_id = any(${communicationIds}::bigint[])
    order by communication_id, position
  `;
  if (rows.length === 0) return grouped;

  const segments = await loadSegmentsByItem(
    client,
    rows.filter((r) => r.display === 'reparto').map((r) => r.id),
  );

  for (const row of rows) {
    const dto = rowToItemDto(row, segments.get(row.id) ?? []);
    const list = grouped.get(row.communication_id);
    if (list) list.push(dto);
    else grouped.set(row.communication_id, [dto]);
  }
  return grouped;
}

/** Los trozos de los repartos de una tanda de items, en una sola consulta. */
async function loadSegmentsByItem(
  client: DbClient,
  itemIds: string[],
): Promise<Map<string, CommunicationSegmentDTO[]>> {
  const grouped = new Map<string, CommunicationSegmentDTO[]>();
  if (itemIds.length === 0) return grouped;

  const rows = await client<{ item_id: string; position: number; value_num: string; label: string }[]>`
    select item_id::text as item_id, position, value_num::text as value_num, label
    from coach_communication_item_segments
    where item_id = any(${itemIds}::bigint[])
    order by item_id, position
  `;
  for (const row of rows) {
    // `numeric` llega como cadena de postgres.js (no cabe siempre en un double
    // y por eso el driver no lo convierte): el número se hace aquí, una vez.
    const dto: CommunicationSegmentDTO = {
      position: row.position,
      value_num: Number(row.value_num),
      label: row.label,
    };
    const list = grouped.get(row.item_id);
    if (list) list.push(dto);
    else grouped.set(row.item_id, [dto]);
  }
  return grouped;
}

/**
 * Le pone a las secciones «camino» la espina que les toca. Es una función y no
 * un campo de la consulta porque el camino no está en la tabla: depende del
 * ATLETA que está mirando, y la misma nota publicada a diez atletas dibuja diez
 * caminos distintos.
 */
export function attachCamino(items: CommunicationItemDTO[], camino: PlanPathDTO | null): CommunicationItemDTO[] {
  if (camino === null) return items;
  return items.map((i) => (i.display === 'camino' ? { ...i, camino } : i));
}

/** ¿Hay alguna sección que necesite el plan? Decide si la consulta se hace. */
export function needsCamino(items: CommunicationItemDTO[]): boolean {
  return items.some((i) => i.display === 'camino');
}

/**
 * Los comunicados enlazados de una tanda, vistos por el COACH: son suyos, así
 * que le llegan siempre. Sin estado, porque sin un atleta delante no hay estado
 * que contar (un comunicado publicado a ocho tiene ocho).
 */
export async function loadLinkedForCoach(
  client: DbClient,
  linkedIds: string[],
): Promise<Map<string, LinkedCommunicationDTO>> {
  const found = new Map<string, LinkedCommunicationDTO>();
  const ids = [...new Set(linkedIds)];
  if (ids.length === 0) return found;

  const rows = await client<{ id: string; kind: CommunicationKind; title: string; blocks: boolean }[]>`
    select id::text as id, kind, title, blocks
    from coach_communications
    where id = any(${ids}::bigint[])
  `;
  for (const row of rows) {
    found.set(row.id, { id: row.id, kind: row.kind, title: row.title, blocks: row.blocks, state: null });
  }
  return found;
}

/**
 * Los comunicados enlazados de una tanda, vistos por UN ATLETA: sólo viajan los
 * que también son suyos, y viajan con SU estado.
 *
 * Que el filtro esté aquí y no en la pantalla es la regla entera: si el enlace
 * viajara siempre, el atleta vería que existe algo que no es suyo — y si viajara
 * sin estado, el pie de la nota le seguiría pidiendo que conteste una pregunta
 * que ya contestó.
 */
export async function loadLinkedForAthlete(
  client: DbClient,
  linkedIds: string[],
  athlete_id: number | bigint,
): Promise<Map<string, LinkedCommunicationDTO>> {
  const found = new Map<string, LinkedCommunicationDTO>();
  const ids = [...new Set(linkedIds)];
  if (ids.length === 0) return found;

  const rows = await client<
    {
      id: string;
      kind: CommunicationKind;
      title: string;
      blocks: boolean;
      seen_at: Date | null;
      done_at: Date | null;
      answered_at: Date | null;
    }[]
  >`
    select c.id::text as id, c.kind, c.title, c.blocks,
           r.seen_at, r.done_at, r.answered_at
    from coach_communications c
    join coach_communication_recipients r on r.communication_id = c.id
    where c.id = any(${ids}::bigint[])
      and r.athlete_id = ${athlete_id as number}
      and c.status = 'published'
  `;
  for (const row of rows) {
    found.set(row.id, {
      id: row.id,
      kind: row.kind,
      title: row.title,
      blocks: row.blocks,
      state: communicationState({
        seen_at: iso(row.seen_at),
        done_at: iso(row.done_at),
        answered_at: iso(row.answered_at),
      }),
    });
  }
  return found;
}

/**
 * Los pasos marcados de varios destinatarios, agrupados por destinatario. Lo
 * usan los dos lados: la bandeja del atleta (sus marcas) y la ficha del atleta
 * en el dashboard (las de ESE atleta, vistas por el coach) — una sola consulta,
 * nunca una por comunicado.
 */
export async function loadMarksByRecipient(
  client: DbClient,
  recipientIds: string[],
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (recipientIds.length === 0) return grouped;
  const rows = await client<{ recipient_id: string; item_id: string }[]>`
    select recipient_id::text as recipient_id, item_id::text as item_id
    from coach_communication_item_marks
    where recipient_id = any(${recipientIds}::bigint[])
    order by item_id
  `;
  for (const row of rows) {
    const list = grouped.get(row.recipient_id);
    if (list) list.push(row.item_id);
    else grouped.set(row.recipient_id, [row.item_id]);
  }
  return grouped;
}
