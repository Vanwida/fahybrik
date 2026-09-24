// Cobros: de la lista de suscripciones del coach a lo que hay que hacer. Puro
// (sin red ni React) para poder probarlo: agrupa, cuenta y ordena.

import { paymentState, type PaymentStateKey } from '@/lib/coach/billing-state';
import type { CoachBilling, CoachBillingRow } from '@/lib/coach/billing';

export interface CobroRow {
  row: CoachBillingRow;
  state: PaymentStateKey;
  /** Pareja de dobles con el mismo cargo en Stripe (se enseña una fila). */
  partnerName: string | null;
  /** Qué pasa ahora con este cobro, en una línea («Renueva el 25 sept»). */
  reason: 'vencido' | 'pendiente' | 'renueva' | 'se_va' | null;
}

export interface CobrosView {
  action: CobroRow[];
  alDia: CobroRow[];
  sinCobro: CobroRow[];
  counts: { vencidos: number; pendientes: number; renuevan: number; al_dia: number; sin_precio: number };
  mrr_cents: number;
}

/** Una pareja de dobles paga UN cargo: una sola fila, con el nombre del otro. */
function collapseDobles(rows: CoachBillingRow[]): { row: CoachBillingRow; partnerName: string | null }[] {
  const byCustomer = new Map<string, CoachBillingRow[]>();
  const out: { row: CoachBillingRow; partnerName: string | null }[] = [];
  for (const r of rows) {
    if (!r.stripe_customer_id) {
      out.push({ row: r, partnerName: null });
      continue;
    }
    const arr = byCustomer.get(r.stripe_customer_id) ?? [];
    arr.push(r);
    byCustomer.set(r.stripe_customer_id, arr);
  }
  for (const arr of byCustomer.values()) {
    const primary = arr.find((r) => r.agreed_price_cents != null) ?? arr[0]!;
    const partner = arr.find((r) => r.athlete_id !== primary.athlete_id) ?? null;
    out.push({ row: primary, partnerName: partner?.full_name ?? null });
  }
  return out;
}

export function buildCobros(data: CoachBilling, now: Date = new Date()): CobrosView {
  const soon = now.getTime() + 7 * 24 * 3600 * 1000;
  const action: CobroRow[] = [];
  const alDia: CobroRow[] = [];
  const sinCobro: CobroRow[] = [];
  let sinPrecio = 0;

  for (const { row, partnerName } of collapseDobles(data.athletes)) {
    const state = paymentState({ status: row.status, is_comp: row.is_comp }).key;
    const end = row.current_period_end ? new Date(row.current_period_end).getTime() : null;
    const within7 = end != null && end >= now.getTime() && end <= soon;
    let reason: CobroRow['reason'] = null;
    if (state === 'vencido') reason = 'vencido';
    else if (state === 'pendiente') reason = 'pendiente';
    else if (state === 'al_dia' && row.cancel_at_period_end && end != null) reason = 'se_va';
    else if (state === 'al_dia' && within7) reason = 'renueva';

    const item: CobroRow = { row, state, partnerName, reason };
    if (reason) action.push(item);
    else if (state === 'al_dia') alDia.push(item);
    else sinCobro.push(item);
    if (state === 'al_dia' && row.agreed_price_cents == null) sinPrecio += 1;
  }

  const rank: Record<NonNullable<CobroRow['reason']>, number> = { vencido: 0, pendiente: 1, se_va: 2, renueva: 3 };
  action.sort(
    (a, b) =>
      rank[a.reason!] - rank[b.reason!] ||
      (a.row.current_period_end ?? '').localeCompare(b.row.current_period_end ?? '') ||
      a.row.full_name.localeCompare(b.row.full_name, 'es'),
  );
  const byName = (a: CobroRow, b: CobroRow) => a.row.full_name.localeCompare(b.row.full_name, 'es');
  alDia.sort(byName);
  sinCobro.sort(byName);

  return {
    action,
    alDia,
    sinCobro,
    counts: {
      vencidos: action.filter((r) => r.reason === 'vencido').length,
      pendientes: action.filter((r) => r.reason === 'pendiente').length,
      renuevan: action.filter((r) => r.reason === 'renueva').length,
      al_dia: alDia.length + action.filter((r) => r.reason === 'renueva' || r.reason === 'se_va').length,
      sin_precio: sinPrecio,
    },
    mrr_cents: data.mrr_cents,
  };
}
