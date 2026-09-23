'use client';

// Negocio › Cobros — cuánto entra al mes y, debajo, SOLO a quién hay que
// atender: vencidos, pendientes de pagar, bajas a fin de periodo y quien
// renueva esta semana. Cada fila con su acción: recordar el pago (un mensaje
// que ves y editas antes de enviarlo), abrir el cliente en Stripe o marcarlo
// cobrado si te pagó por otra vía. Los que están al día, plegados.

import { useMemo, useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BellRing, ChevronDown, ChevronRight, CircleCheck, ExternalLink, MoreHorizontal, Search, Wallet } from 'lucide-react';
import {
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Input,
  KPI,
  KPIRow,
  List,
  ListRow,
  Menu,
  SectionHeader,
  StatusBadge,
  Textarea,
  useToast,
  type StatusTone,
} from '@/components/v2/ui';
import type { CoachBilling } from '@/lib/coach/billing';
import { formatCents, formatDayShort } from '@/components/v2/metricas/format';
import { readApiError } from '@/components/v2/ajustes/autosave';
import { buildCobros, type CobroRow } from './cobros-model';

const REASON: Record<NonNullable<CobroRow['reason']>, { tone: StatusTone; label: (r: CobroRow) => string }> = {
  vencido: { tone: 'danger', label: () => 'Pago vencido' },
  pendiente: { tone: 'warn', label: () => 'Sin pagar aún' },
  se_va: {
    tone: 'warn',
    label: (r) => `Se da de baja el ${r.row.current_period_end ? formatDayShort(r.row.current_period_end) : '—'}`,
  },
  renueva: {
    tone: 'info',
    label: (r) => `Renueva el ${r.row.current_period_end ? formatDayShort(r.row.current_period_end) : '—'}`,
  },
};

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

function reminderText(name: string): string {
  return `Hola ${firstName(name)}: tu último pago no se ha podido cobrar. Puedes revisar la tarjeta en la app, en «Mi suscripción». Si ya está resuelto, ignora este mensaje.`;
}

export function CobrosScreen({
  data,
  openInvoices,
  stripeBase,
}: {
  data: CoachBilling;
  /** athlete_id → importe de su factura abierta (para «Marcar cobrado»). */
  openInvoices: Record<string, number>;
  /** Base del panel de Stripe, o null si Stripe no está conectado. */
  stripeBase: string | null;
}) {
  const locale = useLocale();
  const view = useMemo(() => buildCobros(data), [data]);
  const [query, setQuery] = useState('');
  const [showAlDia, setShowAlDia] = useState(false);
  const [showSin, setShowSin] = useState(false);
  const [remind, setRemind] = useState<CobroRow[] | null>(null);
  const [markPaid, setMarkPaid] = useState<CobroRow | null>(null);

  const q = query.trim().toLowerCase();
  const match = (r: CobroRow) =>
    !q || `${r.row.full_name} ${r.row.email} ${r.partnerName ?? ''}`.toLowerCase().includes(q);
  const action = view.action.filter(match);
  const alDia = view.alDia.filter(match);
  const sinCobro = view.sinCobro.filter(match);
  const overdue = view.action.filter((r) => r.reason === 'vencido');

  if (data.athletes.length === 0) {
    return (
      <EmptyState
        variant="page"
        icon={Wallet}
        title="Todavía no cobras a nadie desde aquí"
        description="Al convertir un lead en atleta con un precio, su cobro aparece en esta lista."
      />
    );
  }

  const row = (r: CobroRow) => (
    <ListRow
      key={r.row.athlete_id}
      href={`/${locale}/atletas/${r.row.athlete_id}?tab=perfil`}
      leading={<Avatar name={r.row.full_name} size="lg" />}
      title={r.row.full_name}
      detail={
        <>
          {r.reason ? (
            <StatusBadge tone={REASON[r.reason].tone} label={REASON[r.reason].label(r)} size="sm" />
          ) : (
            <span>{stateLabel(r)}</span>
          )}
          {r.partnerName ? <span className="truncate">con {r.partnerName}</span> : null}
        </>
      }
      meta={r.row.is_comp ? 'Cortesía' : r.row.agreed_price_cents != null ? `${formatCents(r.row.agreed_price_cents)}/mes` : 'Sin precio'}
      trailing={
        <RowActions
          r={r}
          openInvoice={openInvoices[r.row.athlete_id] ?? null}
          stripeBase={stripeBase}
          onRemind={() => setRemind([r])}
          onMarkPaid={() => setMarkPaid(r)}
        />
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <KPIRow>
        <KPI
          label="Ingresos al mes"
          value={formatCents(view.mrr_cents)}
          caption={view.counts.sin_precio > 0 ? `${view.counts.sin_precio} al día sin precio puesto` : 'suscripciones al día'}
        />
        <KPI label="Vencidos" value={view.counts.vencidos} caption={view.counts.vencidos ? 'Stripe no pudo cobrar' : 'ninguno'} />
        <KPI label="Sin pagar aún" value={view.counts.pendientes} caption="invitación sin pagar" />
        <KPI label="Renuevan en 7 días" value={view.counts.renuevan} />
        <KPI label="Al día" value={view.counts.al_dia} />
      </KPIRow>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title="Por atender" count={action.length} />
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {overdue.length > 1 ? (
              <Button size="sm" icon={BellRing} onClick={() => setRemind(overdue)} className="shrink-0">
                Recordar a los {overdue.length} vencidos
              </Button>
            ) : null}
            <Input
              type="search"
              icon={Search}
              size="sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar atleta"
              aria-label="Buscar atleta"
              className="min-w-0 flex-1 sm:w-56 sm:flex-none"
            />
          </div>
        </div>
        {action.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={q ? 'Nadie coincide' : 'Todo cobrado'}
            description={q ? undefined : 'nadie tiene pagos pendientes ni cambios esta semana'}
          />
        ) : (
          <List aria-label="Cobros por atender">{action.map(row)}</List>
        )}
      </section>

      <Collapsible title="Al día" count={alDia.length} open={showAlDia || Boolean(q)} onToggle={() => setShowAlDia((v) => !v)}>
        <List aria-label="Al día">{alDia.map(row)}</List>
      </Collapsible>
      {sinCobro.length > 0 ? (
        <Collapsible
          title="Sin cobro (cortesía, bajas y sin suscripción)"
          count={sinCobro.length}
          open={showSin || Boolean(q)}
          onToggle={() => setShowSin((v) => !v)}
        >
          <List aria-label="Sin cobro">{sinCobro.map(row)}</List>
        </Collapsible>
      ) : null}

      {remind ? <RemindDialog rows={remind} onClose={() => setRemind(null)} /> : null}
      {markPaid ? (
        <MarkPaidDialog
          r={markPaid}
          amountCents={openInvoices[markPaid.row.athlete_id] ?? null}
          onClose={() => setMarkPaid(null)}
        />
      ) : null}
    </div>
  );
}

function stateLabel(r: CobroRow): string {
  switch (r.state) {
    case 'al_dia':
      return r.row.current_period_end ? `Al día · renueva el ${formatDayShort(r.row.current_period_end)}` : 'Al día';
    case 'cortesia':
      return 'Cortesía';
    case 'cancelado':
      return 'Baja';
    default:
      return 'Sin suscripción';
  }
}

function Collapsible({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={open ? ChevronDown : ChevronRight}
        aria-expanded={open}
        onClick={onToggle}
        className="w-fit -ml-2"
      >
        {title} <span className="t-tnum text-v2-faint">{count}</span>
      </Button>
      {open ? children : null}
    </section>
  );
}

function RowActions({
  r,
  openInvoice,
  stripeBase,
  onRemind,
  onMarkPaid,
}: {
  r: CobroRow;
  openInvoice: number | null;
  stripeBase: string | null;
  onRemind: () => void;
  onMarkPaid: () => void;
}) {
  const owes = r.reason === 'vencido' || r.reason === 'pendiente';
  const stripeHref = stripeBase && r.row.stripe_customer_id ? `${stripeBase}/customers/${r.row.stripe_customer_id}` : null;
  return (
    <span className="flex items-center gap-1">
      {owes ? (
        <Button size="sm" icon={BellRing} onClick={onRemind} className="hidden sm:inline-flex">
          Recordar pago
        </Button>
      ) : null}
      <Menu
        trigger={
          <Button size="sm" variant="ghost" aria-label={`Más acciones para ${r.row.full_name}`} className="w-7 px-0">
            <MoreHorizontal aria-hidden strokeWidth={1.75} />
          </Button>
        }
        items={[
          ...(owes ? [{ label: 'Recordar pago', icon: BellRing, onSelect: onRemind }] : []),
          ...(stripeHref
            ? [{ label: 'Abrir en Stripe', icon: ExternalLink, onSelect: () => window.open(stripeHref, '_blank', 'noopener') }]
            : []),
          ...(owes && openInvoice != null ? [{ label: 'Marcar cobrado', icon: CircleCheck, onSelect: onMarkPaid }] : []),
          ...(!owes && !stripeHref
            ? [{ label: 'Sin acciones: no está en Stripe', onSelect: () => undefined, disabled: true }]
            : []),
        ]}
      />
    </span>
  );
}

function RemindDialog({ rows, onClose }: { rows: CobroRow[]; onClose: () => void }) {
  const toast = useToast();
  const single = rows.length === 1 ? rows[0]! : null;
  const [text, setText] = useState(single ? reminderText(single.row.full_name) : reminderText('').replace('Hola : ', 'Hola: '));
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      // Con varios, cada uno recibe el texto con SU nombre (un mensaje en su hilo, nunca un grupo).
      const results = await Promise.all(
        rows.map((r) =>
          fetch('/api/coach/messages/broadcast', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              athlete_ids: [r.row.athlete_id],
              body: single ? text : text.replace(/^Hola:/, `Hola ${firstName(r.row.full_name)}:`),
            }),
          }).then((res) => res.ok),
        ),
      );
      const ok = results.filter(Boolean).length;
      if (ok === rows.length) {
        toast.toast({ title: single ? `Recordatorio enviado a ${single.row.full_name}` : `Recordatorio enviado a ${ok}`, tone: 'ok' });
        onClose();
      } else {
        toast.toast({ title: `Enviado a ${ok} de ${rows.length}`, description: 'Reintenta con los que faltan.', tone: 'warn' });
      }
    } catch {
      toast.toast({ title: 'Sin conexión. No se ha enviado.', tone: 'danger' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={single ? `Recordar el pago a ${single.row.full_name}` : `Recordar el pago a ${rows.length} atletas`}
      description="Le llega como un mensaje tuyo en su chat. Cámbialo si quieres."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={sending} disabled={text.trim() === ''} onClick={() => void send()}>
            Enviar
          </Button>
        </>
      }
    >
      <Textarea aria-label="Mensaje" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
    </Dialog>
  );
}

function MarkPaidDialog({ r, amountCents, onClose }: { r: CobroRow; amountCents: number | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/cobros/${r.row.athlete_id}/marcar-cobrado`, { method: 'POST' });
      if (!res.ok) {
        setError(await readApiError(res, 'No se ha podido marcar.'));
        return;
      }
      toast.toast({ title: `Cobro de ${r.row.full_name} marcado como pagado`, description: 'Stripe lo confirma en unos segundos.', tone: 'ok' });
      startTransition(() => router.refresh());
      onClose();
    } catch {
      setError('Sin conexión. No se ha marcado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`¿${r.row.full_name} te ha pagado por otra vía?`}
      description={`La factura${amountCents != null ? ` de ${formatCents(amountCents)}` : ''} queda pagada en Stripe y deja de intentar cobrarla. No se carga nada a su tarjeta.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void confirm()}>
            Marcar cobrado
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="t-body-sm text-v2-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

