// Client-safe payment-state mapping (#15). Maps a subscription's
// (status, is_comp) to the coach-facing payment STATE: label, pill tone and a
// sort rank (vencidos first). Pure — no DB, no `server-only` — so BOTH the Pagos
// coach panel and the ficha Pagos tab derive the SAME state from one source
// (single source of truth for "what does this subscription's money status read
// as"). The Stripe status → payment-state mapping is fixed here:
//
//   active / trialing → Al día      · incomplete → Pendiente de pago
//   past_due          → Vencido     · canceled   → Cancelado
//   comp (source)     → Cortesía    · null       → Sin cobro
//
// `is_comp` wins over the raw status (a comp sub is stored status='active' but
// must read "Cortesía", never "Al día").

import type { PillTone } from '@/components/v2/Pill';
import type { SubscriptionStatusValue } from '@/lib/stripe';

export type PaymentStateKey =
  | 'al_dia'
  | 'vencido'
  | 'pendiente'
  | 'cancelado'
  | 'cortesia'
  | 'sin_cobro';

export interface PaymentStateView {
  key: PaymentStateKey;
  /** Coach-facing ES label rendered in the pill. */
  label: string;
  /** v2 semantic pill tone. */
  tone: PillTone;
  /** Table sort rank — lower = more urgent, sorted to the top. */
  rank: number;
}

/** The five ordered ranks — exported so the panel/tab can reason about ordering. */
export const PAYMENT_STATE_RANK: Record<PaymentStateKey, number> = {
  vencido: 0,
  pendiente: 1,
  al_dia: 2,
  cortesia: 3,
  cancelado: 4,
  sin_cobro: 5,
};

/** Derive the payment state from a subscription's status + comp flag. */
export function paymentState(args: {
  status: SubscriptionStatusValue | null;
  is_comp: boolean;
}): PaymentStateView {
  if (args.is_comp) {
    return { key: 'cortesia', label: 'Cortesía', tone: 'info', rank: PAYMENT_STATE_RANK.cortesia };
  }
  switch (args.status) {
    case 'past_due':
      return { key: 'vencido', label: 'Vencido', tone: 'danger', rank: PAYMENT_STATE_RANK.vencido };
    case 'incomplete':
      return {
        key: 'pendiente',
        label: 'Pendiente de pago',
        tone: 'warn',
        rank: PAYMENT_STATE_RANK.pendiente,
      };
    case 'active':
    case 'trialing':
      return { key: 'al_dia', label: 'Al día', tone: 'ok', rank: PAYMENT_STATE_RANK.al_dia };
    case 'canceled':
      return {
        key: 'cancelado',
        label: 'Cancelado',
        tone: 'neutral',
        rank: PAYMENT_STATE_RANK.cancelado,
      };
    default:
      return {
        key: 'sin_cobro',
        label: 'Sin cobro',
        tone: 'neutral',
        rank: PAYMENT_STATE_RANK.sin_cobro,
      };
  }
}
