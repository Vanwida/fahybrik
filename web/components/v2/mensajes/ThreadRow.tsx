'use client';

// Una conversación en la bandeja: quién, qué dijo lo último y cuánto lleva
// esperando. La espera es el dato que manda en «Por responder» y va con su
// color (gris → ámbar al umbral del coach → rojo al doble). Las acciones de fila
// (Hecho, Posponer, Marcar sin leer) aparecen al pasar por encima o con la fila
// activa; en el móvil viven en la cabecera del hilo.

import { Check, Clock, MailOpen, MoreHorizontal, UserRound } from 'lucide-react';
import { Avatar, IconButton, ListRow, Menu, StatusBadge, Tag, type MenuEntry } from '@/components/v2/ui';
import { weekdayDate } from '@/components/v2/shared/format';
import type { SnoozeUntil } from '@/components/v2/shared';
import { waitLabel, waitTone } from '@/lib/dashboard/v2/mensajes-inbox';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { cn } from '@/lib/utils';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';

/** El día (YYYY-MM-DD) de un instante en el huso del club. */
const dayOf = (tz: string) => zonedFormat(tz, 'en-CA', {});

/** «16:40» si es de hoy; «ayer»; si no, «lun 22 sept» — en el huso del club. */
export function whenLabel(iso: string, now: Date, tz: string = BOX_TIMEZONE): string {
  const DAY = dayOf(tz);
  const TIME = zonedFormat(tz, 'es-ES', { hour: '2-digit', minute: '2-digit' });
  const day = DAY.format(new Date(iso));
  const today = DAY.format(now);
  if (day === today) return TIME.format(new Date(iso));
  if (day === DAY.format(new Date(now.getTime() - 86_400_000))) return 'ayer';
  return weekdayDate(day);
}

export const SNOOZE_CHOICES: Array<{ until: SnoozeUntil; label: string }> = [
  { until: 'signal', label: 'Hasta que vuelva a escribir' },
  { until: '1d', label: '1 día' },
  { until: '3d', label: '3 días' },
];

export interface ThreadRowActions {
  onOpen: () => void;
  onDone: () => void;
  onSnooze: (until: SnoozeUntil) => void;
  onMarkUnread: () => void;
  onOpenProfile: () => void;
}

/** Lo que dice la segunda línea: el mensaje que casa (búsqueda) o el último. */
function previewOf(t: MensajesThread): { text: string; from: 'athlete' | 'coach' } | null {
  const m = t.match ?? t.last_message;
  return m ? { text: m.preview, from: m.from } : null;
}

function StateTag({ t }: { t: MensajesThread }) {
  const DAY = dayOf(useCoachTimeZone());
  if (t.state === 'hecho') return <Tag icon={Check}>Hecho</Tag>;
  if (t.state === 'pospuesto') {
    return (
      <Tag icon={Clock}>
        {t.snoozed_until ? `Hasta ${weekdayDate(DAY.format(new Date(t.snoozed_until)))}` : 'Hasta que escriba'}
      </Tag>
    );
  }
  return null;
}

export function ThreadRow({
  thread: t,
  now,
  thresholdHours,
  selected,
  active,
  ...actions
}: {
  thread: MensajesThread;
  now: Date;
  thresholdHours: number;
  /** El hilo abierto a la derecha. */
  selected: boolean;
  /** La fila con el cursor de teclado (J/K). */
  active: boolean;
} & ThreadRowActions) {
  const preview = previewOf(t);
  const waiting = t.state === 'por_responder' && t.waiting ? t.waiting : null;
  const tone = waiting ? waitTone(waiting.since, now, thresholdHours) : null;
  const tz = useCoachTimeZone();
  const handled = t.state === 'hecho' || t.state === 'pospuesto';
  /** Hay una espera que despachar (por responder, o pospuesta y aún viva). */
  const pending = t.state === 'por_responder' || t.state === 'pospuesto';

  const moreItems: MenuEntry[] = [
    ...(pending ? [{ label: 'Hecho · no requiere respuesta', icon: Check, shortcut: 'E', onSelect: actions.onDone }] : []),
    ...(pending
      ? ([{ type: 'label', label: 'Posponer' }, ...SNOOZE_CHOICES.map((c) => ({ label: c.label, onSelect: () => actions.onSnooze(c.until) }))] as MenuEntry[])
      : []),
    ...(pending ? [{ type: 'separator' } as MenuEntry] : []),
    { label: 'Marcar sin leer', icon: MailOpen, shortcut: 'U', onSelect: actions.onMarkUnread, disabled: t.unread > 0 },
    { label: 'Abrir ficha', icon: UserRound, onSelect: actions.onOpenProfile },
  ];

  return (
    <ListRow
      selected={selected}
      active={active && !selected}
      onClick={actions.onOpen}
      className="min-h-16 pointer-coarse:min-h-[68px]"
      leading={<Avatar name={t.athlete_name} src={t.avatar_url} size="lg" />}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('truncate', t.unread > 0 && 'font-semibold')}>{t.athlete_name}</span>
          {t.level_label ? <Tag>{t.level_label}</Tag> : null}
        </span>
      }
      detail={
        <span className="flex min-w-0 items-center gap-2">
          {handled ? <StateTag t={t} /> : null}
          {preview ? (
            <span className={cn('truncate', t.unread > 0 ? 'text-v2-fg' : 'text-v2-muted')}>
              {preview.from === 'coach' ? <span className="text-v2-faint">Tú: </span> : null}
              {preview.text}
            </span>
          ) : (
            <span className="text-v2-faint">Sin mensajes</span>
          )}
        </span>
      }
      meta={
        <span className="flex flex-col items-end gap-1 group-hover/row:pointer-fine:invisible">
          {waiting && tone ? (
            <StatusBadge
              size="sm"
              variant={tone === 'neutral' ? 'text' : 'soft'}
              tone={tone}
              icon={Clock}
              label={waitLabel(waiting.since, now)}
            />
          ) : t.last_message ? (
            <span suppressHydrationWarning>{whenLabel(t.last_message.at, now, tz)}</span>
          ) : null}
          {t.unread > 0 ? (
            <span
              aria-label={`${t.unread} sin leer`}
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-v2-fg px-1 text-[11px] leading-none font-semibold text-v2-bg t-tnum"
            >
              {t.unread}
            </span>
          ) : null}
        </span>
      }
      trailing={
        <span
          className={cn(
            'absolute top-1/2 right-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-ctl bg-v2-surface pl-1',
            'pointer-fine:group-hover/row:flex pointer-fine:group-focus-within/row:flex',
            active && 'pointer-fine:flex',
          )}
        >
          {pending ? (
            <IconButton icon={Check} label="Hecho · no requiere respuesta" shortcut="E" size="sm" onClick={actions.onDone} />
          ) : null}
          <Menu
            align="end"
            width="min-w-56"
            trigger={<IconButton icon={MoreHorizontal} label={`Más acciones · ${t.athlete_name}`} size="sm" />}
            items={moreItems}
          />
        </span>
      }
    />
  );
}
