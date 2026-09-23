'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Los cinco tonos de estado (mismo enum que shared/domain/coach/athlete-state). */
export type StatusTone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  danger: CircleAlert,
  warn: TriangleAlert,
  ok: CircleCheck,
  info: Info,
  neutral: CircleDashed,
};

const TONE_TEXT: Record<StatusTone, string> = {
  danger: 'text-v2-danger',
  warn: 'text-v2-warn',
  ok: 'text-v2-ok',
  info: 'text-v2-info',
  neutral: 'text-v2-muted',
};

const TONE_SOFT: Record<StatusTone, string> = {
  danger: 'bg-v2-danger-soft text-v2-danger',
  warn: 'bg-v2-warn-soft text-v2-warn',
  ok: 'bg-v2-ok-soft text-v2-ok',
  info: 'bg-v2-info-soft text-v2-info',
  neutral: 'bg-v2-surface-2 text-v2-muted',
};

/**
 * Estado = icono + etiqueta + tono. Nunca un punto solo, nunca color solo.
 * `text` (por defecto) para filas densas; `soft` con fondo para cabeceras,
 * banners y la columna «Semana».
 */
export function StatusBadge({
  tone,
  label,
  icon,
  variant = 'text',
  size = 'md',
  className,
}: {
  tone: StatusTone;
  label: ReactNode;
  /** Sustituye al icono del tono (p. ej. MessageCircle para «Por responder»). */
  icon?: LucideIcon;
  variant?: 'text' | 'soft';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-medium',
        size === 'sm' ? 'text-[12px] leading-4' : 'text-[13px] leading-[18px]',
        variant === 'text' ? TONE_TEXT[tone] : cn(TONE_SOFT[tone], 'rounded-ctl', size === 'sm' ? 'h-5 px-1.5' : 'h-6 px-2'),
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2} className={size === 'sm' ? 'size-3' : 'size-3.5'} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Metadato neutro: nivel, grupo, «Descarga», «N3». Sin color de estado. */
export function Tag({ children, className, icon: Icon }: { children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[4px] bg-v2-surface-2 px-1.5',
        'text-[12px] leading-none font-medium text-v2-muted',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden strokeWidth={2} className="size-3" /> : null}
      {children}
    </span>
  );
}

/**
 * Chip de filtro / vista guardada — la ÚNICA pastilla del sistema. Activo =
 * tinta invertida (neutro), nunca el acento del club. `add` = «+ Guardar vista».
 */
export function FilterChip({
  children,
  active = false,
  count,
  icon: Icon,
  href,
  onClick,
  variant = 'default',
  className,
}: {
  children: ReactNode;
  active?: boolean;
  count?: number | null;
  icon?: LucideIcon;
  /** Con href es un enlace (vistas en la URL); si no, un botón. */
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'add';
  className?: string;
}) {
  const cls = cn(
    'relative inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium outline-none',
    'transition-[background-color,border-color,color] duration-[var(--v2-dur-fast)]',
    'focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]',
    "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2 pointer-coarse:after:content-['']",
    variant === 'add'
      ? 'border-dashed border-v2-border-strong text-v2-muted hover:text-v2-fg'
      : active
        ? 'border-v2-fg bg-v2-fg text-v2-bg'
        : 'border-v2-border bg-v2-surface text-v2-muted hover:border-v2-border-strong hover:text-v2-fg',
    className,
  );
  const inner = (
    <>
      {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-3.5" /> : null}
      {children}
      {count != null ? <span className={cn('t-tnum', active ? 'opacity-70' : 'text-v2-faint')}>{count}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-current={active ? 'true' : undefined} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={variant === 'add' ? undefined : active} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
