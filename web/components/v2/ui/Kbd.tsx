import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Tecla de un atajo: «J», «⌘K». `inverse` = dentro de un tooltip (fondo tinta). */
export function Kbd({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] px-1',
        'font-sans text-[11px] leading-none font-semibold t-tnum',
        tone === 'default'
          ? 'border border-v2-border-strong border-b-2 bg-v2-surface text-v2-muted'
          : 'bg-v2-bg/15 text-v2-bg/80',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
