import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Sección de la referencia: título 16 px, una línea de uso y el contenido. */
export function Block({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-20">
      <div className="mb-3 flex flex-col gap-0.5">
        <h2 id={`${id}-t`} className="t-title-sm text-v2-fg">
          {title}
        </h2>
        {note ? <p className="t-body-sm text-v2-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Fila «etiqueta · especímenes» dentro de una tarjeta. */
export function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="grid gap-2 border-b border-v2-border py-3 last:border-b-0 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="t-meta text-v2-faint">{label}</div>
      <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>{children}</div>
    </div>
  );
}

/** Superficie de sección (una tarjeta con filas Spec). */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-panel border border-v2-border bg-v2-surface px-4', className)}>{children}</div>;
}
