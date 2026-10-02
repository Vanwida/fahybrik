'use client';

import { useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Detalle progresivo accesible; un enlace a un campo abre sus grupos contenedores. */
export function Disclosure({ id, title, summary, summaryClassName, children }: { id: string; title: string; summary: ReactNode; summaryClassName?: string; children: ReactNode }) {
  useEffect(() => {
    const reveal = () => {
      let target: HTMLElement | null;
      try { target = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); }
      catch { return; }
      if (!target) return;
      const own = document.getElementById(id);
      if (!own?.contains(target)) return;
      let details = target.closest('details');
      while (details) {
        details.open = true;
        details = details.parentElement?.closest('details') ?? null;
      }
      target.scrollIntoView({ block: 'start' });
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [id]);

  return (
    <details id={id} className="group/disclosure min-w-0 scroll-mt-24 rounded-panel border border-v2-border bg-v2-surface">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-v2-accent [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <span className="t-body font-semibold text-v2-fg">{title}</span>
          <div className={cn('mt-1 line-clamp-2 t-body-sm text-v2-muted', summaryClassName)}>{summary}</div>
        </div>
        <ChevronDown aria-hidden className="mt-1 size-4 shrink-0 text-v2-muted transition-transform group-open/disclosure:rotate-180" />
      </summary>
      <div className="flex min-w-0 flex-col gap-6 border-t border-v2-border px-4 py-5">{children}</div>
    </details>
  );
}
