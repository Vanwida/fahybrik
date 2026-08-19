'use client';

// V2Sidebar — el rail FLEXR: panel flotante SIEMPRE expandido (w-[236px]) con la
// marca del tenant arriba, los tres grupos de la IA con sus cabeceras visibles,
// Guía + Ajustes anclados abajo y el sello FLEXR al pie. El estado activo es la
// pastilla de tinta (--v2-accent). Mensajes y Leads llevan badge. El antiguo
// rail colapsado-que-expande-al-hover murió con el rediseño FLEXR: el coach ve
// siempre dónde está y qué hay (día uno sin manual).

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
 * Marca del TENANT (hoy FAHYBRID) — el slot de marca del coach. Sale del set
 * estandarizado en /public/brand; cuando llegue «personalizar», la imagen y el
 * nombre vendrán de datos del coach, no de código.
 * Exported: the mobile top bar (V2Shell) shows the same mark when the sidebar is hidden.
 */
export function HexMark({ className }: { className?: string }) {
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
  'group/nav relative flex h-10 items-center gap-3 rounded-[var(--v2-r-nav)] px-3 whitespace-nowrap text-sm font-medium transition-colors v2-focus';

function navLinkClass(active: boolean): string {
  return cn(
    NAV_LINK_BASE,
    active
      ? 'bg-[color:var(--v2-accent)] font-semibold text-[color:var(--v2-accent-fg)]'
      : 'text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-accent-soft)] hover:text-[color:var(--v2-fg)]',
  );
}

/** One nav row — icon + label + optional count badge (Mensajes → unread,
 *  Leads → new leads). El badge invierte color sobre la pastilla activa. */
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
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <MIcon name={item.icon} filled={active} size={20} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {showBadge ? (
        <span
          className={cn(
            'flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-nano font-bold',
            active
              ? 'bg-[color:var(--v2-accent-fg)] text-[color:var(--v2-accent)]'
              : 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]',
          )}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      ) : null}
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
        'fixed bottom-4 left-4 top-4 z-20 hidden w-[236px] lg:flex',
        'flex-col overflow-y-auto',
        'rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)]',
        'bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]',
        'px-3 py-4',
      )}
    >
      {/* Slot de marca del tenant */}
      <Link
        href="/hoy"
        aria-label="FAHYBRID"
        title="FAHYBRID"
        className="v2-focus flex shrink-0 items-center gap-2.5 rounded-[var(--v2-r-nav)] px-2 pb-4 pt-1"
      >
        <HexMark className="h-8 w-8 shrink-0" />
        <span className="v2-display truncate text-[1.05rem]">FAHYBRID</span>
      </Link>

      {/* Primary nav — the three coach hats, headers always visible. */}
      <nav className="flex flex-1 flex-col gap-1">
        {V2_NAV_GROUP_ORDER.map((group) => {
          const items = v2NavItemsForGroup(group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1 first:mt-0 [&:not(:first-child)]:mt-4">
              <span aria-hidden className="v2-micro px-3 pb-1">
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

      {/* Guía + Ajustes + sello FLEXR — pinned bottom */}
      <div className="mt-auto flex flex-col gap-1 border-t border-[color:var(--v2-border)] pt-3">
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
        <span
          aria-hidden
          className="px-3 pt-3 text-[10.5px] font-bold tracking-[0.15em] text-[color:var(--v2-faint)]"
        >
          FLEXR
        </span>
      </div>
    </aside>
  );
}
