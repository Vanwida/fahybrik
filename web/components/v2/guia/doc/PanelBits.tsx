'use client';

// Trocitos del panel dentro de la guía: composiciones pequeñas de los
// primitivos DE VERDAD (@/components/v2/ui), nunca un dibujo aparte que se
// quede viejo. Todo va dentro de <PanelFigure>, que es inerte (se ve, no se
// pulsa). Las props son datos (nombres de icono, no componentes) para que los
// artículos, que son de servidor, puedan pasarlas.

import type { ReactNode } from 'react';
import {
  CheckCheck,
  Clock,
  Eye,
  EyeOff,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Send,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, Button, FilterChip, Kbd, SegmentedControl, StatusBadge, Tag, type StatusTone } from '@/components/v2/ui';

const ICONS = {
  eye: Eye,
  'eye-off': EyeOff,
  lock: Lock,
  message: MessageCircle,
  send: Send,
  clock: Clock,
  check: CheckCheck,
  'user-plus': UserPlus,
  more: MoreHorizontal,
} satisfies Record<string, LucideIcon>;
export type PanelIcon = keyof typeof ICONS;

/** El marco: una tarjeta del panel, inerte, con su pie. */
export function PanelFigure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <figure className="guia-panel">
      <div inert className="guia-panel-body">
        {children}
      </div>
      {caption ? <figcaption className="guia-panel-cap">{caption}</figcaption> : null}
    </figure>
  );
}

/** Chips de filtro, como en la cabecera de Hoy, Atletas o Mensajes. */
export function Chips({ items }: { items: Array<{ label: string; count?: number; active?: boolean }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <FilterChip key={c.label} active={c.active} count={c.count}>
          {c.label}
        </FilterChip>
      ))}
    </div>
  );
}

/** Un conmutador de vistas (Semana / 3 semanas…), con la opción marcada. */
export function Segmented({ items, value, label }: { items: string[]; value: string; label: string }) {
  return (
    <SegmentedControl
      aria-label={label}
      size="sm"
      items={items.map((i) => ({ value: i, label: i }))}
      value={value}
      onValueChange={() => undefined}
      className="w-fit"
    />
  );
}

export function Badge({
  tone,
  label,
  icon,
  soft = false,
}: {
  tone: StatusTone;
  label: string;
  icon?: PanelIcon;
  soft?: boolean;
}) {
  return <StatusBadge tone={tone} label={label} icon={icon ? ICONS[icon] : undefined} variant={soft ? 'soft' : 'text'} size="sm" />;
}

/** Una fila de bandeja: quién, su señal con la prueba y la acción que toca. */
export function InboxRow({
  name,
  level,
  tone,
  signal,
  evidence,
  action,
  age,
}: {
  name: string;
  level?: string;
  tone: StatusTone;
  signal: string;
  evidence: string;
  action: string;
  age?: string;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-v2-border px-3 py-2 last:border-b-0">
      <Avatar name={name} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 t-body font-medium text-v2-fg">
          {name}
          {level ? <Tag>{level}</Tag> : null}
        </span>
        <span className="flex min-w-0 items-center gap-2 t-meta">
          <StatusBadge tone={tone} label={signal} size="sm" />
          <span className="truncate text-v2-muted">{evidence}</span>
        </span>
      </div>
      {age ? <span className="hidden t-meta text-v2-faint sm:inline">{age}</span> : null}
      <Button size="sm" className="hidden sm:inline-flex">
        {action}
      </Button>
      <Button size="sm" variant="ghost" icon={Clock} className="hidden md:inline-flex">
        Posponer
      </Button>
    </div>
  );
}

/** Botones tal cual salen en una barra: [{label, icon?, primary?}]. */
export function Buttons({ items }: { items: Array<{ label: string; icon?: PanelIcon; primary?: boolean }> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((b) => (
        <Button key={b.label} size="sm" variant={b.primary ? 'primary' : 'secondary'} icon={b.icon ? ICONS[b.icon] : undefined}>
          {b.label}
        </Button>
      ))}
    </div>
  );
}

/** Atajos de teclado: [[teclas], qué hacen]. */
export function Keys({ items }: { items: Array<[string[], string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {items.map(([keys, what]) => (
        <div key={what} className="flex items-center justify-between gap-3 border-b border-v2-border py-1.5">
          <dt className="t-body-sm text-v2-muted">{what}</dt>
          <dd className="flex shrink-0 items-center gap-1">
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
