// v2 IA — the new sidebar nav. Distinct from lib/dashboard/nav.ts (v1) so the
// two surfaces evolve independently. Routes are locale-relative (/v2/...); the
// next-intl Link prefixes /es|/en. `badge: 'mensajes'` renders the unread count.

export interface V2NavItem {
  /** Locale-relative href, e.g. "/v2/hoy". */
  href: string;
  label: string;
  /** Material Symbols Outlined icon name. */
  icon: string;
  /** Optional badge source key. */
  badge?: 'mensajes';
}

/** Primary nav (top of the sidebar). */
export const V2_NAV_ITEMS: readonly V2NavItem[] = [
  { href: '/v2/hoy', label: 'Hoy', icon: 'today' },
  { href: '/v2/atletas', label: 'Atletas', icon: 'groups' },
  { href: '/v2/biblioteca', label: 'Biblioteca', icon: 'menu_book' },
  { href: '/v2/planes', label: 'Planes', icon: 'edit_calendar' },
  { href: '/v2/mensajes', label: 'Mensajes', icon: 'forum', badge: 'mensajes' },
] as const;

/** Pinned to the bottom of the sidebar. */
export const V2_NAV_SETTINGS: V2NavItem = {
  href: '/v2/ajustes',
  label: 'Ajustes',
  icon: 'settings',
};

/** Active when the path is the item or a descendant of it. */
export function isV2NavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
