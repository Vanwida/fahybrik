import 'server-only';

// Cobros (Negocio) — lo que el panel necesita para actuar sobre un pago:
//   · qué factura abierta tiene cada atleta del coach (para «Marcar cobrado»);
//   · el enlace al cliente en el panel de Stripe (para «Abrir en Stripe»).
// Todo filtrado por el coach dueño del atleta: nunca se toca la factura de
// otro club.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadStripeConfig } from '@/lib/stripe';

export interface OpenInvoice {
  athlete_id: string;
  stripe_invoice_id: string;
  amount_cents: number;
  currency: string;
  created_at: string;
}

/** La factura abierta más reciente de cada atleta del coach (una consulta). */
export async function listOpenInvoices(coach_id: bigint | number, client: Sql = defaultSql): Promise<Map<string, OpenInvoice>> {
  const rows = await client<OpenInvoice[]>`
    select distinct on (a.id)
      a.id::text as athlete_id, i.stripe_invoice_id, i.amount_cents, i.currency,
      i.created_at::text as created_at
    from athletes a
    join subscriptions s on s.user_id = a.user_id
    join athlete_invoices i on i.subscription_id = s.id
    where a.coach_id = ${Number(coach_id)}
      and i.status = 'open'
    order by a.id, i.created_at desc
  `;
  return new Map(rows.map((r) => [r.athlete_id, r]));
}

/**
 * La factura abierta de UN atleta, solo si es del coach. `null` = no es suyo o
 * no tiene nada abierto (la ruta responde igual en los dos casos: 404/409).
 */
export async function findOpenInvoice(
  coach_id: bigint | number,
  athlete_id: bigint | number,
  client: Sql = defaultSql,
): Promise<{ owned: boolean; invoice: OpenInvoice | null }> {
  const owned = await client<{ ok: boolean }[]>`
    select true as ok from athletes where id = ${Number(athlete_id)} and coach_id = ${Number(coach_id)} limit 1
  `;
  if (owned.length === 0) return { owned: false, invoice: null };
  const invoices = await listOpenInvoices(coach_id, client);
  return { owned: true, invoice: invoices.get(String(athlete_id)) ?? null };
}

/** Deja la factura como pagada en el espejo local (el webhook de Stripe lo confirma después). */
export async function markInvoicePaidLocally(stripe_invoice_id: string, client: Sql = defaultSql): Promise<void> {
  await client`
    update athlete_invoices set status = 'paid', paid_at = coalesce(paid_at, now())
    where stripe_invoice_id = ${stripe_invoice_id}
  `;
}

/**
 * Base del panel de Stripe para enlazar un cliente, o null sin Stripe. Con
 * clave de pruebas, la ruta /test (si no, el enlace abre el modo real vacío).
 */
export function stripeDashboardBase(): string | null {
  const cfg = loadStripeConfig();
  if (!cfg.ok) return null;
  return cfg.config.secret_key.startsWith('sk_test') ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
}
