'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';

// Secondary nav for the owner/admin surface. Locale-agnostic paths (next-intl's
// usePathname strips the locale prefix), so the active check is exact for the
// root and prefix-based for sub-sections.
const ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/admin', label: 'Resumen', icon: 'dashboard' },
  { href: '/admin/carreras', label: 'Carreras', icon: 'event' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-4 sm:px-6">
      {ITEMS.map((item) => {
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'flex items-center gap-1.5 border-b-2 border-[color:var(--accent)] px-1 py-2.5 text-sm font-bold text-[color:var(--fg)]'
                : 'flex items-center gap-1.5 border-b-2 border-transparent px-1 py-2.5 text-sm font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]'
            }
          >
            <MIcon name={item.icon} size={16} filled={active} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
