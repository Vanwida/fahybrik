export interface NavItem {
  href: string;
  labelKey: string;
  /** Material Symbols Outlined icon name. */
  icon: string;
  badgeKey?: 'inbox';
}

// Coach dashboard nav — UX redesign §0 ("Calendar-first, one inbox, one
// library"): Hoy (unified inbox) · Atletas (roster) · Programar.
// Review/Biblioteca/Metodología left the top level: Review lives inside Hoy,
// Metodología moved under Ajustes, Biblioteca folded into /programar (fase 2,
// biblioteca única). Business metrics stay on the admin surface (/admin, 0041).
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', labelKey: 'today', icon: 'today', badgeKey: 'inbox' },
  { href: '/atletas', labelKey: 'athletes', icon: 'groups' },
  { href: '/programar', labelKey: 'programming', icon: 'edit_calendar' },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
