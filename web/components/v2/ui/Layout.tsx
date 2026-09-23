import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cabecera de página — UN patrón para todas: título · recuento · subtítulo ·
 * acciones. Título 20 px (los números son la voz alta, no el título). Debajo,
 * como `children`, la fila de filtros / pestañas si la hay.
 */
export function PageHeader({
  title,
  count,
  subtitle,
  actions,
  back,
  children,
  className,
}: {
  title: ReactNode;
  count?: number | string | null;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Enlace de vuelta («Atletas») encima del título. */
  back?: { href: string; label: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-ctl px-1 t-meta text-v2-muted outline-none hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
        >
          <ChevronLeft aria-hidden className="size-3.5" strokeWidth={2} />
          {back.label}
        </Link>
      ) : null}
      {/* En el móvil, título y acciones se apilan (las acciones no se cuelan en la
          línea del título); desde sm, en una fila. */}
      <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 sm:flex-1">
          <h1 className="t-title text-v2-fg">{title}</h1>
          {count != null ? <span className="t-title font-medium text-v2-faint t-tnum">{count}</span> : null}
          {subtitle ? <p className="basis-full t-body-sm text-v2-muted sm:basis-auto">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/**
 * Cabecera de sección. `label` (por defecto) = ceja en mayúsculas 11 px con su
 * recuento; `title` = 16 px para secciones con más peso. `action` a la derecha.
 */
export function SectionHeader({
  title,
  count,
  action,
  variant = 'label',
  id,
  className,
}: {
  title: ReactNode;
  count?: number | string | null;
  action?: ReactNode;
  variant?: 'label' | 'title';
  id?: string;
  className?: string;
}) {
  const Heading = variant === 'label' ? 'h3' : 'h2';
  return (
    <div className={cn('flex min-h-6 items-center justify-between gap-3', className)}>
      <Heading
        id={id}
        className={cn(
          'flex items-baseline gap-2',
          variant === 'label' ? 't-label text-v2-faint' : 't-title-sm text-v2-fg',
        )}
      >
        {title}
        {count != null ? (
          <span className={cn('t-tnum', variant === 'label' ? 'text-v2-faint' : 'font-medium text-v2-faint')}>{count}</span>
        ) : null}
      </Heading>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Tarjeta plana: superficie + borde 1 px + 10 px. Nunca una tarjeta dentro de otra. */
export function Card({
  children,
  padding = 'md',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { padding?: 'none' | 'sm' | 'md' }) {
  return (
    <div
      className={cn(
        'rounded-panel border border-v2-border bg-v2-surface',
        padding === 'md' ? 'p-4' : padding === 'sm' ? 'p-3' : null,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Cabecera dentro de una Card: título 16 px + acciones, separada por espacio (no por borde). */
export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="t-title-sm text-v2-fg">{title}</h3>
        {subtitle ? <p className="mt-0.5 t-body-sm text-v2-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </div>
  );
}

/**
 * Fila de lista (bandeja de Hoy, listas en paneles). Rejilla: inicio · cuerpo
 * (título + línea de detalle) · fin. `href` u `onClick` la hacen pulsable
 * entera; los controles de `trailing` siguen funcionando por su cuenta.
 */
export function ListRow({
  leading,
  title,
  detail,
  meta,
  trailing,
  href,
  onClick,
  selected,
  active,
  density = 'comfy',
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** Dato corto a la derecha del cuerpo (antigüedad «2 h», fecha). */
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  /** Fila con el foco de teclado de la lista (J/K). */
  active?: boolean;
  density?: 'compact' | 'comfy';
  className?: string;
}) {
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="truncate t-body font-medium text-v2-fg">{title}</div>
        {detail ? <div className="flex min-w-0 items-center gap-2 truncate t-body-sm text-v2-muted">{detail}</div> : null}
      </div>
      {meta ? <div className="shrink-0 t-meta text-v2-faint t-tnum">{meta}</div> : null}
    </>
  );
  const rowCls = cn(
    'group/row relative flex items-center gap-3 border-b border-v2-border px-3 last:border-b-0 sm:px-4',
    density === 'compact' ? 'min-h-10 py-1.5' : 'min-h-12 py-2',
    selected ? 'bg-v2-select' : active ? 'bg-v2-hover' : null,
    (href || onClick) && 'cursor-pointer hover:bg-v2-hover',
    active && "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-v2-select-bar before:content-['']",
    className,
  );
  return (
    <div role="listitem" className={rowCls} data-active={active || undefined} data-selected={selected || undefined}>
      {leading ? <div className="relative z-[1] flex shrink-0 items-center gap-3">{leading}</div> : null}
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:shadow-[inset_0_0_0_2px_var(--v2-accent)]">
          {body}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:shadow-[inset_0_0_0_2px_var(--v2-accent)]"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {trailing ? <div className="relative z-[1] flex shrink-0 items-center gap-1.5">{trailing}</div> : null}
    </div>
  );
}

/** Contenedor de ListRow: la superficie con borde que los agrupa. */
export function List({ children, className, 'aria-label': ariaLabel }: { children: ReactNode; className?: string; 'aria-label'?: string }) {
  return (
    <div role="list" aria-label={ariaLabel} className={cn('overflow-hidden rounded-panel border border-v2-border bg-v2-surface', className)}>
      {children}
    </div>
  );
}
