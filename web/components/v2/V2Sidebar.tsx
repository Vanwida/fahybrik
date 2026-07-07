'use client';

// V2Sidebar — the new IA rail. Collapsed icon rail (w-20) that expands on hover/
// focus to reveal labels (w-64), mirroring the v1 sidebar interaction but fully
// scoped to v2 tokens. Active state fills with the accent. Mensajes carries the
// unread badge. Ajustes pins to the bottom.

import { Link, usePathname } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import {
  V2_NAV_GROUP_LABELS,
  V2_NAV_GROUP_ORDER,
  V2_NAV_GUIDE,
  V2_NAV_SETTINGS,
  isV2NavActive,
  v2NavItemsForGroup,
  type V2NavItem,
} from '@/components/v2/nav';
import { cn } from '@/lib/utils';

/**
 * FAHYBRID brand mark — the real FHP icon tile (orange on dark), self-contained so
 * it reads correctly on both the light and dark v2 surfaces. Sourced from the
 * standardized brand set in /public/brand. Not a generic icon, the actual logo.
 */
function HexMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/fh-icon-300.png"
      alt="FAHYBRID"
      className={cn('rounded-[var(--v2-r-s)] object-contain', className)}
    />
  );
}

/** Shared classes — used by both the primary nav links and the pinned Ajustes. */
const NAV_LINK_BASE =
  'group/nav relative flex h-11 items-center gap-4 rounded-[var(--v2-r-s)] px-3 whitespace-nowrap transition-colors v2-focus';
const NAV_LABEL_CLASS =
  'font-bold text-[12px] uppercase tracking-wide opacity-0 transition-opacity duration-300 group-hover/v2sidebar:opacity-100 group-focus-within/v2sidebar:opacity-100';

function navLinkClass(active: boolean): string {
  return cn(
    NAV_LINK_BASE,
    active
      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-elevated)] hover:text-[color:var(--v2-fg)]',
  );
}

/** One nav row — icon (always visible in the collapsed rail) + label (fades in on
 *  expand) + optional count badge (Mensajes → unread, Leads → new leads). */
function NavLink({
  item,
  active,
  badgeCount,
}: {
  item: V2NavItem;
  active: boolean;
  badgeCount: number;
}) {
  const showBadge = !!item.badge && badgeCount > 0;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={navLinkClass(active)}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <MIcon name={item.icon} filled={active} size={22} />
        {showBadge ? (
          <span
            className="absolute -right-2 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[8px] font-bold"
            style={{ background: 'var(--v2-accent)', color: 'var(--v2-accent-fg)' }}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
      </span>
      <span className={NAV_LABEL_CLASS}>{item.label}</span>
    </Link>
  );
}

export function V2Sidebar({
  unread_messages = 0,
  leads_nuevo = 0,
}: {
  unread_messages?: number;
  leads_nuevo?: number;
}) {
  const pathname = usePathname();
  // Per-badge counts, keyed by the item's `badge` source.
  const badgeCounts: Record<NonNullable<V2NavItem['badge']>, number> = {
    mensajes: unread_messages,
    leads: leads_nuevo,
  };
  const badgeFor = (item: V2NavItem) => (item.badge ? badgeCounts[item.badge] : 0);

  return (
    <aside
      className={cn(
        'group/v2sidebar fixed inset-y-0 left-0 z-20 hidden lg:flex',
        'w-20 hover:w-64 focus-within:w-64',
        'flex-col gap-4 overflow-hidden',
        'border-r border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
        'transition-[width] duration-300 ease-out',
      )}
    >
      {/* Logo / brand — hexagon mark + italic-bold FAHYBRID wordmark */}
      <Link
        href="/hoy"
        aria-label="FAHYBRID"
        title="FAHYBRID"
        className="flex h-16 shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] px-5 v2-focus"
      >
        <HexMark className="h-9 w-9 shrink-0" />
        <span className="v2-display whitespace-nowrap text-[1.6rem] tracking-[-0.02em] opacity-0 transition-opacity duration-300 group-hover/v2sidebar:opacity-100 group-focus-within/v2sidebar:opacity-100">
          <span className="text-[color:var(--v2-fg)]">FA</span>
          <span className="text-[color:var(--v2-accent)]">HYBRID</span>
        </span>
      </Link>

      {/* Primary nav — two groups: Operar / Construir el método. Each carries a
          small uppercase header that fades in with the labels on expand. In the
          collapsed rail the header collapses to a thin divider so groups stay
          visually distinct without showing text. */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {V2_NAV_GROUP_ORDER.map((group) => {
          const items = v2NavItemsForGroup(group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1 first:mt-0 [&:not(:first-child)]:mt-3">
              <span
                aria-hidden
                className={cn(
                  'px-3 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--v2-faint)]',
                  // Hidden glyph in the collapsed rail; fades in on expand.
                  'opacity-0 transition-opacity duration-300 group-hover/v2sidebar:opacity-100 group-focus-within/v2sidebar:opacity-100',
                )}
              >
                {V2_NAV_GROUP_LABELS[group]}
              </span>
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isV2NavActive(pathname, item.href)}
                  badgeCount={badgeFor(item)}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* Guía + Ajustes — pinned bottom */}
      <div className="mt-auto flex flex-col gap-1 border-t border-[color:var(--v2-border)] px-3 py-3">
        <NavLink
          item={V2_NAV_GUIDE}
          active={isV2NavActive(pathname, V2_NAV_GUIDE.href)}
          badgeCount={0}
        />
        <NavLink
          item={V2_NAV_SETTINGS}
          active={isV2NavActive(pathname, V2_NAV_SETTINGS.href)}
          badgeCount={0}
        />
      </div>
    </aside>
  );
}
