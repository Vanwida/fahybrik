// Cobros enseña solo a quién hay que atender, en orden: vencidos, sin pagar,
// bajas a fin de periodo y renovaciones de la semana. Una pareja de dobles con
// un solo cargo es UNA fila.

import { describe, expect, test } from 'vitest';
import { buildCobros } from '@/components/v2/pagos/cobros-model';
import type { CoachBilling, CoachBillingRow } from '@/lib/coach/billing';

const NOW = new Date('2026-09-23T10:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

function row(p: Partial<CoachBillingRow> & { athlete_id: string; full_name: string }): CoachBillingRow {
  return {
    email: `${p.athlete_id}@x.test`,
    status: 'active',
    is_comp: false,
    agreed_price_cents: 9000,
    currency: 'eur',
    current_period_end: inDays(20),
    cancel_at_period_end: false,
    stripe_customer_id: `cus_${p.athlete_id}`,
    ...p,
  };
}

function billing(athletes: CoachBillingRow[]): CoachBilling {
  return {
    athletes,
    active_count: 0,
    past_due_count: 0,
    canceled_count: 0,
    not_subscribed_count: 0,
    comp_count: 0,
    upcoming_renewals_7d: [],
    mrr_cents: 12345,
  };
}

describe('buildCobros', () => {
  test('ordena lo que pide acción y pliega el resto', () => {
    const v = buildCobros(
      billing([
        row({ athlete_id: '1', full_name: 'Ana', current_period_end: inDays(3) }),
        row({ athlete_id: '2', full_name: 'Bea', status: 'past_due' }),
        row({ athlete_id: '3', full_name: 'Carla', status: 'incomplete' }),
        row({ athlete_id: '4', full_name: 'Dani', cancel_at_period_end: true, current_period_end: inDays(12) }),
        row({ athlete_id: '5', full_name: 'Eva' }),
        row({ athlete_id: '6', full_name: 'Fede', is_comp: true, stripe_customer_id: null }),
        row({ athlete_id: '7', full_name: 'Gus', status: null, stripe_customer_id: null }),
      ]),
      NOW,
    );
    expect(v.action.map((r) => [r.row.full_name, r.reason])).toEqual([
      ['Bea', 'vencido'],
      ['Carla', 'pendiente'],
      ['Dani', 'se_va'],
      ['Ana', 'renueva'],
    ]);
    expect(v.alDia.map((r) => r.row.full_name)).toEqual(['Eva']);
    expect(v.sinCobro.map((r) => r.row.full_name)).toEqual(['Fede', 'Gus']);
    expect(v.counts).toMatchObject({ vencidos: 1, pendientes: 1, renuevan: 1, al_dia: 3 });
    expect(v.mrr_cents).toBe(12345);
  });

  test('una pareja de dobles con el mismo cliente de Stripe es una fila con el nombre del otro', () => {
    const v = buildCobros(
      billing([
        row({ athlete_id: '1', full_name: 'Ana', status: 'past_due', stripe_customer_id: 'cus_par', agreed_price_cents: 15000 }),
        row({ athlete_id: '2', full_name: 'Bea', status: 'past_due', stripe_customer_id: 'cus_par', agreed_price_cents: null }),
      ]),
      NOW,
    );
    expect(v.action).toHaveLength(1);
    expect(v.action[0]).toMatchObject({ partnerName: 'Bea', reason: 'vencido' });
  });

  test('al día sin precio puesto se cuenta para avisar (MRR no lo incluye)', () => {
    const v = buildCobros(billing([row({ athlete_id: '1', full_name: 'Ana', agreed_price_cents: null })]), NOW);
    expect(v.counts.sin_precio).toBe(1);
  });
});
