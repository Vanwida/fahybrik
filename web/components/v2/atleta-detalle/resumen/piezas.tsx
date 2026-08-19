import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { DiaEstado } from '@/lib/dashboard/v2/ficha-resumen';

export function FichaCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[14px] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-[14px_16px_16px]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function FichaLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[color:var(--v2-muted)]',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function FilaVacia({
  texto,
  cta,
  href,
}: {
  texto: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="v2-focus flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-[13px]"
    >
      <span className="text-[color:var(--v2-muted)]">{texto}</span>
      <span className="shrink-0 font-semibold text-[color:var(--v2-accent)]">{cta} →</span>
    </Link>
  );
}

export const ESTADO_PILL: Record<
  Exclude<DiaEstado, 'descanso'>,
  { label: string; cls: string }
> = {
  hecha: {
    label: '✓ hecha',
    cls: 'bg-[color:var(--v2-ok-soft)] text-[color:var(--v2-ok)]',
  },
  sin_hacer: {
    label: '✕ sin hacer',
    cls: 'bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]',
  },
  en_curso: {
    label: 'en curso',
    cls: 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
  },
  prevista: {
    label: 'prevista',
    cls: 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]',
  },
};

export function PillEstado({ estado }: { estado: Exclude<DiaEstado, 'descanso'> }) {
  const pill = ESTADO_PILL[estado];
  return (
    <span className={cn('mt-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold', pill.cls)}>
      {pill.label}
    </span>
  );
}
