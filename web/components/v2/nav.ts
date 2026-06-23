// v2 IA — the new sidebar nav. Distinct from lib/dashboard/nav.ts (v1) so the
// two surfaces evolve independently. Routes are locale-relative (/v2/...); the
// next-intl Link prefixes /es|/en. `badge: 'mensajes'` renders the unread count.
//
// The primary nav is split into two GROUPS that mirror the two jobs of the coach:
//   · "operar"     — the daily loop: watch athletes, accept what the system proposes.
//   · "construir"  — build the method: the reusable library content.
// Ajustes stays pinned to the bottom (see V2_NAV_SETTINGS).

/** The two sidebar groups; `null` = no group header (e.g. pinned Ajustes). */
export type V2NavGroup = 'operar' | 'construir';

export interface V2NavItem {
  /** Locale-relative href, e.g. "/v2/hoy". */
  href: string;
  label: string;
  /** Material Symbols Outlined icon name. */
  icon: string;
  /** Which sidebar group this item belongs to. */
  group: V2NavGroup;
  /** Optional badge source key. */
  badge?: 'mensajes';
}

/** Human label for each group header (small uppercase in the rail). */
export const V2_NAV_GROUP_LABELS: Record<V2NavGroup, string> = {
  operar: 'Operar',
  construir: 'Construir el método',
};

/** Render order of the groups in the sidebar. */
export const V2_NAV_GROUP_ORDER: readonly V2NavGroup[] = ['operar', 'construir'] as const;

/** Primary nav (top of the sidebar), in render order within each group. */
export const V2_NAV_ITEMS: readonly V2NavItem[] = [
  // Operar — the daily loop.
  { href: '/v2/hoy', label: 'Hoy', icon: 'today', group: 'operar' },
  { href: '/v2/atletas', label: 'Atletas', icon: 'groups', group: 'operar' },
  { href: '/v2/mensajes', label: 'Mensajes', icon: 'forum', group: 'operar', badge: 'mensajes' },
  // Construir el método — the reusable library. (Periodización lands here later.)
  { href: '/v2/biblioteca', label: 'Biblioteca', icon: 'menu_book', group: 'construir' },
] as const;

/** Items belonging to a given group, in declaration order. */
export function v2NavItemsForGroup(group: V2NavGroup): V2NavItem[] {
  return V2_NAV_ITEMS.filter((item) => item.group === group);
}

/** Pinned to the bottom of the sidebar. */
export const V2_NAV_SETTINGS: V2NavItem = {
  href: '/v2/ajustes',
  label: 'Ajustes',
  icon: 'settings',
  group: 'operar',
};

/** Active when the path is the item or a descendant of it. */
export function isV2NavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
