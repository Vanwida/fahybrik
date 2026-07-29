'use client';

// v2 · ATLETA · DETALLE — PAGOS tab (#15). The athlete's money at a glance:
//   · the coach-agreed monthly price (editable inline → PATCH the price route),
//   · the payment state (Al día / Vencido / Pendiente / Cancelado / Cortesía),
//   · the next renewal,
//   · the mirrored Stripe invoice history (month · amount · paid/failed · date).
// Empty state when there is no subscription ("Sin cobro configurado"); comp
// athletes read as "Cortesía" with no price editor (there is nothing to charge).
// All state derives from the SAME subscription status the coach panel uses
// (lib/coach/billing-state), so the two surfaces never disagree.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2';
import { Panel } from './parts';
import { EmptyState } from '@/components/v2/EmptyState';
import { paymentState } from '@/lib/coach/billing-state';
import { formatCents } from '@/components/v2/metricas/format';
import type { AthleteBilling, AthleteInvoice } from '@/lib/coach/billing';

const FIELD_CLS =
  'v2-focus h-10 w-32 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

/** ISO instant / calendar date → "8 jul 2026". null → em-dash. */
function formatLongDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Madrid',
    })
    .replace(/\.(?=\s|$)/, '');
}

/** Period date / created instant → "jul 2026" (the invoice's billing month). */
function formatMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString('es-ES', { month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
    .replace(/\.(?=\s|$)/, '');
}

// Stripe invoice status → coach-facing pill. paid = cobrada; open = pendiente;
// uncollectible = impagada; void = anulada; draft = borrador.
const INVOICE_PILL: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  paid: { label: 'Pagada', tone: 'ok' },
  open: { label: 'Pendiente', tone: 'warn' },
  uncollectible: { label: 'Impagada', tone: 'danger' },
  void: { label: 'Anulada', tone: 'neutral' },
  draft: { label: 'Borrador', tone: 'neutral' },
};

function invoicePill(status: string): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  return INVOICE_PILL[status] ?? { label: status, tone: 'neutral' };
}

// ── Inline price editor ─────────────────────────────────────────────────────────
function PriceEditor({
  athleteId,
  amountCents,
  currency,
}: {
  athleteId: string;
  amountCents: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [euros, setEuros] = useState(amountCents != null ? String(amountCents / 100) : '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function save() {
    const value = Number(euros);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus('error');
      return;
    }
    const amount_cents = Math.round(value * 100);
    setStatus('saving');
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/price`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount_cents }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('idle');
      setEditing(false);
      startTransition(() => router.refresh());
    } catch {
      setStatus('error');
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span className="v2-display text-3xl tabular-nums text-[color:var(--v2-fg)]">
          {formatCents(amountCents)}
        </span>
        <span className="text-xs text-[color:var(--v2-muted)]">/mes</span>
        <button
          type="button"
          onClick={() => {
            setEuros(amountCents != null ? String(amountCents / 100) : '');
            setStatus('idle');
            setEditing(true);
          }}
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="edit" size={14} /> Editar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="number"
            min={1}
            step="0.01"
            inputMode="decimal"
            autoFocus
            value={euros}
            onChange={(e) => setEuros(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
            className={FIELD_CLS + ' pr-8'}
            aria-label={`Precio mensual en ${currency.toUpperCase()}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--v2-faint)]">
            €
          </span>
        </div>
        <span className="text-xs text-[color:var(--v2-muted)]">/mes</span>
        <button
          type="button"
          disabled={status === 'saving'}
          onClick={() => void save()}
          className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          {status === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-2.5 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          Cancelar
        </button>
      </div>
      {status === 'error' ? (
        <p className="text-xs font-medium text-[color:var(--v2-danger)]">
          Introduce un importe válido en euros e inténtalo de nuevo.
        </p>
      ) : (
        <p className="text-label text-[color:var(--v2-faint)]">
          Se aplica al próximo cobro; no se cobra de forma prorrateada a mitad de mes.
        </p>
      )}
    </div>
  );
}

// ── Invoice history ─────────────────────────────────────────────────────────────
function InvoiceHistory({ invoices }: { invoices: AthleteInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-[color:var(--v2-muted)]">
        Todavía no hay facturas. Aparecerán aquí en cuanto Stripe emita el primer cobro.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="border-b border-[color:var(--v2-border)] text-[color:var(--v2-faint)]">
            <th scope="col" className="px-2.5 py-2 text-left font-bold uppercase tracking-wide text-eyebrow">
              Mes
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-eyebrow">
              Importe
            </th>
            <th scope="col" className="px-2.5 py-2 text-left font-bold uppercase tracking-wide text-eyebrow">
              Estado
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-eyebrow">
              Fecha
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const pill = invoicePill(inv.status);
            return (
              <tr key={inv.id} className="border-b border-[color:var(--v2-border)] last:border-b-0">
                <th scope="row" className="px-2.5 py-2.5 text-left font-semibold text-[color:var(--v2-fg)]">
                  {formatMonth(inv.period_start ?? inv.created_at)}
                </th>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-fg)]">
                  {formatCents(inv.amount_cents)}
                </td>
                <td className="px-2.5 py-2.5 text-left">
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </td>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-muted)]">
                  {formatLongDate(inv.paid_at ?? inv.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────────────────
export function PagosTab({
  billing,
  invoices,
  athleteId,
}: {
  billing: AthleteBilling | null;
  invoices: AthleteInvoice[];
  athleteId: string;
}) {
  // No subscription at all → honest empty state.
  if (!billing) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <EmptyState
          icon="payments"
          title="Sin cobro configurado"
          description="Este atleta no tiene ninguna suscripción. El cobro nace en el alta del lead (precio acordado o cortesía)."
        />
      </div>
    );
  }

  const state = paymentState({ status: billing.status, is_comp: billing.is_comp });

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <Panel title="Estado de cobro" action={<Pill tone={state.tone}>{state.label}</Pill>}>
        {billing.is_comp ? (
          <div className="flex flex-col gap-2">
            <span className="v2-display text-2xl text-[color:var(--v2-fg)]">Cortesía</span>
            <p className="text-sm text-[color:var(--v2-muted)]">
              Acceso de cortesía sin cobro. No hay precio ni facturación asociados.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="v2-micro">Precio acordado</span>
              <PriceEditor
                athleteId={athleteId}
                amountCents={billing.agreed_price_cents}
                currency={billing.currency}
              />
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-[color:var(--v2-border)] pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="v2-micro">Próxima renovación</span>
                <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                  {formatLongDate(billing.current_period_end)}
                </span>
              </div>
              {billing.cancel_at_period_end ? (
                <div className="flex flex-col gap-0.5">
                  <span className="v2-micro">Aviso</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--v2-warn)]">
                    <MIcon name="event_busy" size={16} />
                    Se cancela al final del periodo
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Historial de facturas">
        <InvoiceHistory invoices={invoices} />
      </Panel>
    </div>
  );
}
