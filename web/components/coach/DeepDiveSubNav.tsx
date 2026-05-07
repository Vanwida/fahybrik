'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEEP_DIVE_TABS, type DeepDiveTabKey } from '@/lib/coach/deep-dive-types';

interface DeepDiveSubNavProps {
  athlete_id: string;
  active?: DeepDiveTabKey;
}

export function DeepDiveSubNav({ athlete_id, active }: DeepDiveSubNavProps) {
  const pathname = usePathname() ?? '';
  const base = `/athletes/${athlete_id}`;

  return (
    <nav
      aria-label="Sub-navegación atleta"
      className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-[color:var(--hairline)] bg-[color:var(--bg)]/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6"
    >
      {DEEP_DIVE_TABS.map((tab) => {
        const href = tab.href ? `${base}/${tab.href}` : base;
        const isActive =
          active != null
            ? active === tab.key
            : tab.href === ''
              ? pathname === base || pathname === `${base}/`
              : pathname.startsWith(href);
        return (
          <Link
            key={tab.key}
            href={href}
            className={`inline-flex shrink-0 items-center rounded-[var(--r-s)] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] ${
              isActive
                ? 'bg-[color:var(--surface-elevated)] text-[color:var(--fg)]'
                : 'text-[color:var(--muted)] hover:bg-[color:var(--surface)] hover:text-[color:var(--fg)]'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
