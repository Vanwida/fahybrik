// Qué add-ons tiene contratado un club. La lectura del portón (migración 0167).
//
// Vive en `lib/coach/` y no en `lib/mcp/` a propósito: el conector es el primer
// add-on, no el único. El panel tendrá que pintar el estado, y el webhook de
// Stripe tendrá que escribirlo, y las tres superficies han de estar de acuerdo en
// qué cuenta como «contratado». Una sola función lo decide.
//
// LOS TIPOS SON EL PORTÓN. La tabla no lleva CHECK en `feature`, `status` ni
// `source` (mismo criterio que `audit_log.channel`, ver docs/DECISIONS.md): un
// add-on nuevo no debe costar una migración. El precio de esa flexibilidad es que
// los valores válidos se declaran AQUÍ, y que toda lectura y toda escritura pasen
// por este módulo.

import { sql as defaultSql, type Sql, type TransactionClient } from '@/lib/db';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit/record-edit';

/**
 * Las capacidades que se contratan aparte de la cuenta. Hoy una.
 *
 * Añadir un add-on es añadir un miembro a esta unión (y el `feature` que se
 * escriba en la fila tiene que ser exactamente esa cadena): no hay migración de
 * por medio, pero tampoco hay cadenas sueltas por el código.
 */
export type EntitlementFeature = 'mcp_connector' | 'negocio';

/**
 * En qué estado está lo contratado. Hoy dos, y solo el primero concede.
 *
 * IMPORTANTE al ampliar: `hasEntitlement` filtra por LISTA BLANCA (`= 'active'`),
 * así que un estado nuevo NO concede hasta que alguien lo añada al filtro a mano.
 * Es la dirección correcta del fallo — cuando Stripe traiga `past_due` o
 * `canceled` el portón cierra por defecto, y `trialing` (que sí debería abrir)
 * exige una decisión explícita en vez de colarse.
 */
export type EntitlementStatus = 'active' | 'inactive';

/** De dónde salió el permiso: alta manual nuestra, o una suscripción de Stripe. */
export type EntitlementSource = 'founder' | 'stripe';

/** El único estado que concede acceso. Ver la nota de `EntitlementStatus`. */
const GRANTING_STATUS: EntitlementStatus = 'active';

/**
 * ¿Tiene este club esta capacidad, ahora mismo?
 *
 * FAIL-CLOSED: sin fila es `false`. Un club al que nadie ha dado de alta el
 * add-on no lo tiene, así que estrenar un portón nuevo no puede abrirle la puerta
 * a nadie por olvido.
 *
 * Una consulta, servida por el `unique (coach_id, feature)` de la tabla. Se
 * resuelve en CADA llamada y no una vez por conexión, por el mismo motivo que la
 * membresía (`lib/mcp/auth.ts`): un add-on que se cancela a mitad de conversación
 * tiene que cortar la siguiente pregunta, no la siguiente reconexión.
 *
 * `client` acepta también un `tx` para poder comprobar el permiso dentro de la
 * misma transacción que lo escribe (el webhook de Stripe, cuando llegue).
 */
export async function hasEntitlement(params: {
  coach_id: number | bigint;
  feature: EntitlementFeature;
  client?: Sql | TransactionClient;
}): Promise<boolean> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ ok: boolean }>>`
    select true as ok
    from coach_entitlements
    where coach_id = ${params.coach_id as number}
      and feature = ${params.feature}
      and status = ${GRANTING_STATUS}
    limit 1
  `;
  return rows.length > 0;
}

const founderGrantSchema = z.object({
  coach_id: z.number().int().positive().safe(),
  feature: z.enum(['mcp_connector', 'negocio']),
});

/** Alta manual autorizada: idempotente, auditada y sin cambiar permisos de Stripe. */
export async function activateFounderEntitlement(params: {
  coach_id: number;
  feature: EntitlementFeature;
  client?: Sql;
}): Promise<{ changed: boolean; status: string; source: string }> {
  const { coach_id, feature } = founderGrantSchema.parse(params);
  return (params.client ?? defaultSql).begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`coach_entitlement:${coach_id}:${feature}`}, 0))`;
    const [previous] = await tx<Array<{ id: bigint; status: string; source: string }>>`
      select id, status, source from coach_entitlements
      where coach_id = ${coach_id} and feature = ${feature} for update
    `;
    if (previous?.status === 'active') {
      return { changed: false, status: previous.status, source: previous.source };
    }
    if (previous && previous.source !== 'founder') {
      throw new Error('El permiso existente debe gestionarse desde su suscripción.');
    }
    const [grant] = await tx<Array<{ id: bigint; status: string; source: string }>>`
      insert into coach_entitlements (coach_id, feature, status, source)
      values (${coach_id}, ${feature}, 'active', 'founder')
      on conflict (coach_id, feature) do update
      set status = 'active', updated_at = now()
      where coach_entitlements.source = 'founder'
      returning id, status, source
    `;
    if (!grant) throw new Error('No se ha podido activar el permiso.');
    await recordAudit(tx, {
      entity_type: 'coach_entitlements', entity_id: grant.id,
      action: previous ? 'update' : 'create',
      actor: { kind: 'system', user_id: null },
      diff: { coach_id, feature, status: 'active', source: 'founder', previous_status: previous?.status ?? null },
    });
    return { changed: true, status: grant.status, source: grant.source };
  });
}
