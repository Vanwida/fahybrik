// Coach dashboard sidebar nav (IA). Routes are locale-relative (/hoy, /atletas,
// …); the next-intl Link prefixes /es|/en. `badge: 'mensajes'` renders the
// unread count.
//
// The primary nav is split into three GROUPS that mirror the three hats of the coach:
//   · "entrenar" — the daily loop with his athletes: triage, roster, messages.
//   · "negocio"  — running the business: capture leads, get paid, watch the funnel.
//   · "metodo"   — build the method: periodization framework + reusable library.
// Ajustes stays pinned to the bottom (see V2_NAV_SETTINGS).

/** The three sidebar groups; `null` = no group header (e.g. pinned Ajustes). */
export type V2NavGroup = 'entrenar' | 'negocio' | 'metodo';

export interface V2NavItem {
  /** Locale-relative href, e.g. "/hoy". */
  href: string;
  label: string;
  /** Material Symbols Outlined icon name. */
  icon: string;
  /** Which sidebar group this item belongs to. */
  group: V2NavGroup;
  /** Optional badge source key (Mensajes → unread count, Leads → new-leads count). */
  badge?: 'mensajes' | 'leads';
}

/** Human label for each group header (small uppercase in the rail). */
export const V2_NAV_GROUP_LABELS: Record<V2NavGroup, string> = {
  entrenar: 'Entrenar',
  negocio: 'Negocio',
  metodo: 'Método',
};

/** Render order of the groups in the sidebar. */
export const V2_NAV_GROUP_ORDER: readonly V2NavGroup[] = ['entrenar', 'negocio', 'metodo'] as const;

/** Primary nav (top of the sidebar), in render order within each group. */
export const V2_NAV_ITEMS: readonly V2NavItem[] = [
  // Entrenar — the daily loop with his athletes.
  { href: '/hoy', label: 'Hoy', icon: 'today', group: 'entrenar' },
  { href: '/atletas', label: 'Atletas', icon: 'groups', group: 'entrenar' },
  { href: '/mensajes', label: 'Mensajes', icon: 'forum', group: 'entrenar', badge: 'mensajes' },
  // Negocio — capture leads, get paid, watch the funnel.
  { href: '/leads', label: 'Leads', icon: 'person_add', group: 'negocio', badge: 'leads' },
  { href: '/pagos', label: 'Pagos', icon: 'payments', group: 'negocio' },
  { href: '/metricas', label: 'Métricas', icon: 'monitoring', group: 'negocio' },
  { href: '/disponibilidad', label: 'Disponibilidad', icon: 'event_available', group: 'negocio' },
  // Método — the framework first, then the reusable library, then the tests.
  { href: '/periodizacion', label: 'Periodización', icon: 'view_timeline', group: 'metodo' },
  { href: '/biblioteca', label: 'Biblioteca', icon: 'menu_book', group: 'metodo' },
  { href: '/estudio', label: 'Estudio', icon: 'article', group: 'metodo' },
  { href: '/tests', label: 'Tests', icon: 'timer', group: 'metodo' },
] as const;

/** Items belonging to a given group, in declaration order. */
export function v2NavItemsForGroup(group: V2NavGroup): V2NavItem[] {
  return V2_NAV_ITEMS.filter((item) => item.group === group);
}

/** Pinned to the bottom of the sidebar, above Ajustes — the in-dashboard coach
 *  guide (docs site at /guia). */
export const V2_NAV_GUIDE: V2NavItem = {
  href: '/guia',
  label: 'Guía',
  icon: 'school',
  group: 'entrenar',
};

/** Pinned to the bottom of the sidebar. */
export const V2_NAV_SETTINGS: V2NavItem = {
  href: '/ajustes',
  label: 'Ajustes',
  icon: 'settings',
  group: 'entrenar',
};

/** Active when the path is the item or a descendant of it. */
export function isV2NavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
