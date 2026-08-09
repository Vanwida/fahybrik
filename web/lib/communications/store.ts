import 'server-only';

// La capa de lectura compartida del COMUNICADO (docs/DECISIONS.md, 2026-08-09).
//
// El coach y el atleta miran la MISMA entidad desde dos lados: él la escribe y
// mira quién la ha hecho, ella la recibe y la cierra. Las columnas, el mapeo a
// DTO y la carga de la lista ordenada de items viven aquí una sola vez para que
// las dos vistas no puedan divergir — que es exactamente el fallo que tuvo el
// chat cuando el coach y el atleta tenían cada uno su módulo.

import type { Sql, TransactionClient } from '@/lib/db';
import type {
  CommunicationAnchor,
  CommunicationItemDTO,
  CommunicationKind,
  CommunicationStatus,
} from '@fahybrid/shared/domain/coach-communications';

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
  c.blocks, c.is_template, c.status, c.published_at, c.created_at, c.updated_at
`;

export type ItemRow = {
  id: string;
  communication_id: string;
  position: number;
  label: string | null;
  content: string;
  consequence: string | null;
};

export function rowToItemDto(r: ItemRow): CommunicationItemDTO {
  return {
    id: r.id,
    position: r.position,
    label: r.label,
    content: r.content,
    consequence: r.consequence,
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
           position, label, content, consequence
    from coach_communication_items
    where communication_id = any(${communicationIds}::bigint[])
    order by communication_id, position
  `;
  for (const row of rows) {
    const list = grouped.get(row.communication_id);
    if (list) list.push(rowToItemDto(row));
    else grouped.set(row.communication_id, [rowToItemDto(row)]);
  }
  return grouped;
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

/** ISO estricto con `Z` — lo que acepta el decodificador de iOS. */
export const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());
