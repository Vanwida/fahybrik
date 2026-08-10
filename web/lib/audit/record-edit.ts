import type { Sql, TransactionClient } from '../db';
import { toJsonValue } from '../json-column';

// Authorship registry — write side (see migration 0114). Two layers:
//   COLD  recordAudit()  → one append-only audit_log row (permanent history).
//   HOT   recordEdit()   → sets the entity's denormalized last-edited columns AND
//                          appends the audit row, in one call (the common "coach
//                          edited X" path). Creates set created_by inline in their
//                          own INSERT (they build the row anyway) + recordAudit.
//
// An actor is (kind, user_id?): user_id is null exactly when kind is ai/system/lead.

export type AuditAction = 'create' | 'update' | 'delete' | 'restore';
export type ActorKind = 'coach' | 'athlete' | 'ai' | 'system' | 'lead';

/**
 * POR DÓNDE entró la escritura (migración 0165). El actor dice QUIÉN; el canal
 * dice desde qué superficie, que es otra pregunta: el mismo coach toca el plan
 * desde el panel o dictándoselo a su asistente, y «¿esto lo cambié yo desde el
 * chat o desde el dashboard?» tiene que poder contestarse. Esta unión ES el
 * portón (la columna no lleva check a propósito), así que una superficie nueva se
 * estrena añadiéndose aquí.
 */
export type AuditChannel = 'dashboard' | 'mcp';

/** El canal de todo lo que no declara uno: el panel del coach. */
export const DEFAULT_AUDIT_CHANNEL: AuditChannel = 'dashboard';

export interface Actor {
  kind: ActorKind;
  /** users.id, or null for a non-person actor (ai/system/lead). */
  user_id: bigint | null;
}

/** Either the pool client or an open transaction — helpers can run inside a tx. */
export type DbClient = Sql | TransactionClient;

/** Actor from a coach dashboard session (the common case). */
export function coachActor(session: { user_id: bigint }): Actor {
  return { kind: 'coach', user_id: session.user_id };
}

export interface AuditEntry {
  entity_type: string;
  entity_id: bigint;
  action: AuditAction;
  actor: Actor;
  /** JSON-serialisable context/diff. Small — this is a trail, not event sourcing. */
  diff?: unknown;
  /** Superficie de origen. Omitido = el panel del coach (el defecto de la columna). */
  channel?: AuditChannel;
}

/**
 * COLD layer: append one row to the permanent authorship log. Call inside the
 * same transaction as the write (pass the tx) so log and change commit together.
 */
export async function recordAudit(client: DbClient, entry: AuditEntry): Promise<void> {
  await client`
    insert into audit_log (
      actor_user_id, actor_kind, entity_type, entity_id, action, diff_json, channel
    )
    values (
      ${entry.actor.user_id},
      ${entry.actor.kind},
      ${entry.entity_type},
      ${entry.entity_id},
      ${entry.action},
      ${client.json(toJsonValue(entry.diff ?? {}))},
      ${entry.channel ?? DEFAULT_AUDIT_CHANNEL}
    )
  `;
}

/**
 * HOT + COLD in one: stamp the entity's `last_edited_by_*` columns and append the
 * audit row. For EDITS of a row that already exists. `table` must carry the
 * standard authorship columns (last_edited_by_user_id + last_edited_by_kind);
 * `updated_at` is maintained by the table's own trigger where present.
 *
 * Creation is NOT done here: an INSERT builds the row and sets created_by_* +
 * last_edited_by_* inline (no extra UPDATE), then calls {@link recordAudit} with
 * action 'create'.
 */
export async function recordEdit(
  client: DbClient,
  params: {
    table: string;
    id: bigint;
    actor: Actor;
    diff?: unknown;
    channel?: AuditChannel;
  },
): Promise<void> {
  const { table, id, actor } = params;
  await client`
    update ${client(table)}
    set last_edited_by_user_id = ${actor.user_id},
        last_edited_by_kind = ${actor.kind}
    where id = ${id}
  `;
  await recordAudit(client, {
    entity_type: table,
    entity_id: id,
    action: 'update',
    actor,
    diff: params.diff,
    ...(params.channel ? { channel: params.channel } : {}),
  });
}
