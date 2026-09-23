'use client';

// Una fila de CAUSA COMPARTIDA («47 atletas no ven su semana»): una causa, una
// acción en bloque. «Ver quiénes» despliega los atletas (cada uno abre su vistazo).

import { useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, MessageCircle, Send, UserPlus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import { Avatar, Button, buttonVariants } from '@/components/v2/ui';
import type { HoyPerson } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';
import { toTheN } from './hoy-model';

export interface SystemicRowProps {
  group: SystemicGroup;
  /** Los atletas del grupo que se conocen (nombre, avatar). */
  people: ReadonlyArray<HoyPerson>;
  negocio: boolean;
  onPublish: () => void;
  onAssign: () => void;
  /** «Recordar pagos»: confirma en el sitio (no navega). */
  onRemind: () => void;
  onOpenAthlete: (person: HoyPerson) => void;
  /** Enlace de «Revisar en fila» (altas). */
  queueHref: string | null;
}

function GroupAction({ group, onPublish, onAssign, onRemind, queueHref }: Omit<SystemicRowProps, 'people' | 'onOpenAthlete'>) {
  switch (group.kind) {
    case 'awaiting_reply':
      // Mensajes abre por defecto en «Por responder», la más antigua primero.
      return (
        <Link href="/mensajes" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          <MessageCircle aria-hidden strokeWidth={1.75} />
          {group.count === 1 ? 'Responder' : 'Responder en fila'}
        </Link>
      );
    case 'week_hidden':
      return (
        <Button size="sm" variant="secondary" icon={Send} onClick={onPublish}>
          {toTheN('Publicar', group.count)}
        </Button>
      );
    case 'no_program':
      return (
        <Button size="sm" variant="secondary" icon={UserPlus} onClick={onAssign}>
          {`${toTheN('Asignar', group.count)}…`}
        </Button>
      );
    case 'intake_pending':
      return queueHref ? (
        <Link href={queueHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {group.count === 1 ? 'Revisar alta' : 'Revisar en fila'}
        </Link>
      ) : null;
    case 'payments_overdue':
      return (
        <Button size="sm" variant="secondary" icon={BellRing} onClick={onRemind}>
          {group.count === 1 ? 'Recordar pago' : 'Recordar pagos'}
        </Button>
      );
    case 'leads_new':
      return (
        <Link href="/negocio/leads" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Ver leads
        </Link>
      );
    case 'calls_today':
      return (
        <Link href="/negocio/leads" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          Ver llamadas
        </Link>
      );
    default:
      return null;
  }
}

export function SystemicRow(props: SystemicRowProps) {
  const { group, people, onOpenAthlete } = props;
  const [open, setOpen] = useState(false);
  const canExpand = group.athlete_ids.length > 0 && people.length > 0;
  const panelId = `grupo-${group.kind}-${group.week_start ?? 'x'}`;

  const toggle = canExpand ? (
    <Button
      size="sm"
      variant="ghost"
      iconEnd={open ? ChevronUp : ChevronDown}
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((o) => !o)}
    >
      {open ? 'Ocultar' : 'Ver quiénes'}
    </Button>
  ) : null;

  // Fila propia (no ListRow): en estrecho las acciones bajan a su línea en vez de
  // comerse el título.
  return (
    <>
      <div
        role="listitem"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-v2-border px-3 py-2.5 last:border-b-0 sm:px-4"
      >
        <span
          aria-hidden
          className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-ctl bg-v2-surface-2 px-1.5 t-title-sm text-v2-fg t-tnum"
        >
          {group.count}
        </span>
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
          <span className="truncate t-body font-medium text-v2-fg">{group.title}</span>
          <span className="truncate t-body-sm text-v2-muted">{group.detail}</span>
        </div>
        <div className="ml-11 flex shrink-0 items-center gap-1.5 @min-[560px]:ml-0">
          {toggle}
          <GroupAction {...props} />
        </div>
      </div>
      {canExpand && open ? (
        <div role="listitem" id={panelId} className="flex flex-wrap gap-1 border-b border-v2-border px-3 pt-1 pb-3 last:border-b-0 sm:px-4">
          {people.map((p) => (
            <Button key={p.athlete_id} size="sm" variant="ghost" onClick={() => onOpenAthlete(p)} className="pl-1">
              <Avatar name={p.name} src={p.avatar_url} size="xs" />
              {p.name}
            </Button>
          ))}
        </div>
      ) : null}
    </>
  );
}
