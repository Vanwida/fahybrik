'use client';

// Una fila de la bandeja = UN atleta: casilla, avatar, nombre + nivel, su peor
// señal con la evidencia (valor, base, ventana, fecha), «+N señales», edad y lo
// que se hace con ella (la acción de su señal · Posponer ▾ · Hecho). Clic o Enter
// abre el vistazo. El ancho lo decide el hueco real (container query): con el
// vistazo abierto o en el móvil, las acciones se recogen en «···».

import { useRef } from 'react';
import { Check, ChevronDown, Clock, MoreHorizontal } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import type { SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyProposal, HoyRow } from '@/lib/dashboard/hoy/hoy-types';
import {
  Avatar,
  Button,
  Checkbox,
  IconButton,
  ListRow,
  Menu,
  Tag,
  buttonVariants,
  type MenuEntry,
} from '@/components/v2/ui';
import { PublishWeekControl, SIGNAL_ACTION_LABEL, SignalBadge } from '@/components/v2/shared';
import type { SnoozeUntil } from '@/components/v2/shared/SnoozeMenu';
import { actionHref, otherSignalsLabel } from './hoy-model';

export const SNOOZE_OPTIONS: ReadonlyArray<{ until: SnoozeUntil; label: string }> = [
  { until: 'signal', label: 'Hasta nueva señal' },
  { until: '1d', label: '1 día' },
  { until: '3d', label: '3 días' },
];

export interface InboxRowProps {
  row: HoyRow;
  selected: boolean;
  active: boolean;
  negocio: boolean;
  /** Lunes de esta semana (para «Publicar semana»). */
  weekStart: string;
  /**
   * Lo que contestó el motor a «Proponer descarga» (del servidor o de esta
   * visita); `enviando` mientras responde. null = aún no se ha pedido.
   */
  proposal: HoyProposal | 'enviando' | null;
  onOpen: () => void;
  onToggle: (checked: boolean, shift: boolean) => void;
  onAction: (action: SignalAction) => void;
  onSnooze: (until: SnoozeUntil) => void;
  onDone: () => void;
  onChange: () => void;
}

export function InboxRow({
  row,
  selected,
  active,
  negocio,
  weekStart,
  proposal,
  onOpen,
  onToggle,
  onAction,
  onSnooze,
  onDone,
  onChange,
}: InboxRowProps) {
  const router = useRouter();
  const shift = useRef(false);
  const { primary } = row;
  const action = primary.action;
  const descarga = action === 'proponer_descarga' ? proposal : null;
  // El motor dijo «mantener»: la fila dice por qué y lo que queda es darla por hecha.
  const kept = descarga != null && descarga !== 'enviando' && descarga.outcome === 'mantener' ? descarga : null;
  // Hay una descarga pendiente de aprobar: se revisa en su ficha.
  const proposedChange = descarga != null && descarga !== 'enviando' && descarga.outcome === 'propuesta';
  const href = proposedChange ? `/atletas/${row.athlete_id}` : actionHref(action, row.athlete_id, negocio);
  const label = proposedChange ? 'Ver propuesta' : SIGNAL_ACTION_LABEL[action];
  const busy = descarga === 'enviando';
  const others = otherSignalsLabel(row.other_count);
  const othersTitle = row.others.map((s) => s.label).join(' · ');

  const primaryEl = kept ? (
    <Button size="sm" variant="secondary" icon={Check} onClick={onDone}>
      Hecho
    </Button>
  ) : action === 'publicar_semana' ? (
      <PublishWeekControl athleteId={row.athlete_id} name={row.name} weekStart={weekStart} layout="compact" onChange={onChange} />
    ) : href ? (
      <Link href={href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        {label}
      </Link>
    ) : (
      <Button size="sm" variant="secondary" loading={busy} onClick={() => onAction(action)}>
        {label}
      </Button>
    );

  const snoozeItems: MenuEntry[] = SNOOZE_OPTIONS.map((o) => ({
    label: o.label,
    icon: o.until === 'signal' ? Clock : undefined,
    shortcut: o.until === 'signal' ? 'H' : undefined,
    onSelect: () => onSnooze(o.until),
  }));

  const compactItems: MenuEntry[] = [
    ...(action === 'publicar_semana' || kept
      ? []
      : [
          {
            label,
            disabled: busy,
            onSelect: () => (href ? router.push(href) : onAction(action)),
          } satisfies MenuEntry,
          { type: 'separator' } as MenuEntry,
        ]),
    { type: 'label', label: 'Posponer' } as MenuEntry,
    ...SNOOZE_OPTIONS.map((o) => ({ label: o.label, onSelect: () => onSnooze(o.until) })),
    { type: 'separator' } as MenuEntry,
    { label: 'Hecho', icon: Check, shortcut: 'E', onSelect: onDone },
  ];

  return (
    <ListRow
      active={active}
      selected={selected}
      onClick={onOpen}
      density="compact"
      leading={
        <>
          <Checkbox
            aria-label={`Seleccionar a ${row.name}`}
            checked={selected}
            onClick={(e) => {
              shift.current = e.shiftKey;
            }}
            onCheckedChange={(checked) => {
              onToggle(checked, shift.current);
              shift.current = false;
            }}
            className="hidden @min-[480px]:flex"
          />
          <Avatar name={row.name} src={row.avatar_url} size="md" />
        </>
      }
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{row.name}</span>
          {row.level_label ? <Tag>{row.level_label}</Tag> : null}
        </span>
      }
      detail={
        <>
          {kept ? (
            // La respuesta del motor, en una línea, en lugar de la evidencia.
            <SignalBadge signal={{ ...primary, evidence: kept.summary }} withEvidence size="sm" className="min-w-0" />
          ) : (
            <SignalBadge signal={primary} withEvidence size="sm" className="min-w-0" />
          )}
          {others ? (
            <span className="shrink-0 t-meta text-v2-faint" title={othersTitle}>
              {others}
            </span>
          ) : null}
        </>
      }
      meta={<span title={`Desde hace ${row.age_label}`}>{row.age_label}</span>}
      trailing={
        <>
          <span className="hidden items-center gap-1 @min-[560px]:inline-flex">{primaryEl}</span>
          <span className="hidden items-center gap-0.5 @min-[800px]:inline-flex">
            <Menu
              align="end"
              width="min-w-44"
              trigger={
                <Button size="sm" variant="ghost" icon={Clock} iconEnd={ChevronDown}>
                  Posponer
                </Button>
              }
              items={snoozeItems}
            />
            {kept ? null : <IconButton icon={Check} label="Hecho" shortcut="E" size="sm" onClick={onDone} />}
          </span>
          <span className="inline-flex @min-[800px]:hidden">
            <Menu
              align="end"
              width="min-w-52"
              trigger={<IconButton icon={MoreHorizontal} label={`Acciones para ${row.name}`} size="sm" />}
              items={compactItems}
            />
          </span>
        </>
      }
    />
  );
}
