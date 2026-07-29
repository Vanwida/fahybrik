'use client';

// v2 · PAGOS (#15) — the coach's money at a glance. KPI strip (MRR · al día ·
// vencidos · pendientes) + a roster table sorted VENCIDOS-first (the athletes who
// need chasing float to the top), then pendientes, al día, cortesía, cancelados.
// Every payment state comes from lib/coach/billing-state (shared with the ficha
// Pagos tab) so the two surfaces never disagree. Money via formatCents (billing
// lives in integer céntimos). Dobles pairs share ONE Stripe charge, so we collapse
// rows on a shared stripe_customer_id and show the pair once ("compartida con X").
// Layout + primitives mirror the Métricas surface (the approved v2 system).

import { Link } from '@/i18n/navigation';
import { Card, StatTile, Pill } from '@/components/v2';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import { paymentState } from '@/lib/coach/billing-state';
import { formatCents, formatCount, formatDayShort } from '@/components/v2/metricas/format';
import type { CoachBilling, CoachBillingRow } from '@/lib/coach/billing';

// ── Dobles collapse: one visible row per Stripe charge ──────────────────────────
interface DisplayRow {
  row: CoachBillingRow;
  /** The dobles partner's name when this row is a shared (collapsed) pair, else null. */
  partnerName: string | null;
}

/**
 * Collapse a shared Stripe customer (a dobles pair pays ONE charge) to a single
 * display row: the priced/payer row wins, annotated with the partner's name. Rows
 * with no Stripe customer (comp / pending / not-subscribed) stay individual.
 */
function collapseDobles(rows: CoachBillingRow[]): DisplayRow[] {
  const byCustomer = new Map<string, CoachBillingRow[]>();
  const out: DisplayRow[] = [];
  for (const r of rows) {
    if (r.stripe_customer_id) {
      const arr = byCustomer.get(r.stripe_customer_id) ?? [];
      arr.push(r);
      byCustomer.set(r.stripe_customer_id, arr);
    } else {
      out.push({ row: r, partnerName: null });
    }
  }
  for (const arr of byCustomer.values()) {
    if (arr.length === 1) {
      out.push({ row: arr[0]!, partnerName: null });
      continue;
    }
    const primary = arr.find((r) => r.agreed_price_cents != null) ?? arr[0]!;
    const partner = arr.find((r) => r.athlete_id !== primary.athlete_id) ?? null;
    out.push({ row: primary, partnerName: partner?.full_name ?? null });
  }
  return out;
}

// ── KPI card (mirrors the Métricas KPI tiles) ───────────────────────────────────
function KpiCard({
  label,
  value,
  tone = 'fg',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'fg' | 'accent' | 'ok' | 'warn' | 'danger';
}) {
  return (
    <Card className="p-4">
      <StatTile label={label} value={value} tone={tone} />
    </Card>
  );
}

// ── Roster table ────────────────────────────────────────────────────────────────
function RosterTable({ rows }: { rows: DisplayRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[color:var(--v2-border)] text-[color:var(--v2-faint)]">
            <th scope="col" className="px-2.5 py-2 text-left font-bold uppercase tracking-wide text-[10.5px]">
              Atleta
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
              Precio / mes
            </th>
            <th scope="col" className="px-2.5 py-2 text-left font-bold uppercase tracking-wide text-[10.5px]">
              Estado
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[10.5px]">
              Próxima renovación
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, partnerName }) => {
            const state = paymentState({ status: row.status, is_comp: row.is_comp });
            const price = row.is_comp ? '—' : formatCents(row.agreed_price_cents);
            return (
              <tr
                key={row.athlete_id}
                className="border-b border-[color:var(--v2-border)] transition-colors last:border-b-0 hover:bg-[color:var(--v2-surface-2)]"
              >
                <th scope="row" className="px-2.5 py-2.5 text-left">
                  <Link
                    href={`/atletas/${row.athlete_id}?tab=pagos`}
                    className="v2-focus flex flex-col gap-0.5"
                  >
                    <span className="font-semibold text-[color:var(--v2-fg)]">{row.full_name}</span>
                    {partnerName ? (
                      <span className="text-[11px] text-[color:var(--v2-muted)]">
                        compartida con {partnerName}
                      </span>
                    ) : null}
                  </Link>
                </th>
                <td className="v2-num px-2.5 py-2.5 text-right font-semibold text-[color:var(--v2-fg)]">
                  {price}
                </td>
                <td className="px-2.5 py-2.5 text-left">
                  <Pill tone={state.tone}>{state.label}</Pill>
                </td>
                <td className="v2-num px-2.5 py-2.5 text-right text-[color:var(--v2-muted)]">
                  {row.is_comp || !row.current_period_end
                    ? '—'
                    : formatDayShort(row.current_period_end)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────────
export function PagosPanel({ data }: { data: CoachBilling }) {
  const display = collapseDobles(data.athletes);

  // Sort VENCIDOS first, then pendientes, al día, cortesía, cancelados, sin cobro;
  // alphabetical within a state so the table is stable.
  const sorted = [...display].sort((a, b) => {
    const ra = paymentState({ status: a.row.status, is_comp: a.row.is_comp }).rank;
    const rb = paymentState({ status: b.row.status, is_comp: b.row.is_comp }).rank;
    return ra - rb || a.row.full_name.localeCompare(b.row.full_name, 'es');
  });

  // KPI counts derived from the visible (collapsed) rows so "3 al día" == 3 rows.
  let alDia = 0;
  let vencidos = 0;
  let pendientes = 0;
  for (const { row } of display) {
    const key = paymentState({ status: row.status, is_comp: row.is_comp }).key;
    if (key === 'al_dia') alDia += 1;
    else if (key === 'vencido') vencidos += 1;
    else if (key === 'pendiente') pendientes += 1;
  }

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="v2-display text-[clamp(28px,5vw,42px)] text-[color:var(--v2-fg)]">Pagos</h1>
        <p className="max-w-[62ch] text-sm text-[color:var(--v2-muted)]">
          El estado de cobro de tu roster. Los <span className="font-semibold text-[color:var(--v2-fg)]">vencidos</span> van
          primero — son los que hay que perseguir. El precio es el que acordaste con cada atleta.
        </p>
      </header>

      <section
        aria-label="Indicadores de cobro"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiCard label="MRR" value={formatCents(data.mrr_cents)} tone="accent" />
        <KpiCard label="Al día" value={formatCount(alDia)} tone="ok" />
        <KpiCard label="Vencidos" value={formatCount(vencidos)} tone={vencidos > 0 ? 'danger' : 'fg'} />
        <KpiCard label="Pendientes" value={formatCount(pendientes)} tone={pendientes > 0 ? 'warn' : 'fg'} />
      </section>

      <Panel
        title="Roster"
        action={
          <Pill tone="neutral" variant="outline" className="hidden sm:inline-flex">
            vencidos primero
          </Pill>
        }
      >
        {sorted.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[color:var(--v2-muted)]">
            Todavía no tienes atletas con cobro configurado.
          </p>
        ) : (
          <RosterTable rows={sorted} />
        )}
      </Panel>
    </div>
  );
}
