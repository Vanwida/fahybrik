'use client';

// V2MobileNav — the mobile shell navigation (< lg). The V2Sidebar is desktop-only
// (`hidden lg:flex`) and before this component NOTHING replaced it on a phone: no
// way to change section, reach Ajustes or sign out. Market-standard fix, signed
// off by Alex on the HTML mockup: a fixed bottom tab bar with the operational
// four (Hoy · Atletas · Mensajes · Leads) plus «Más», a bottom sheet holding the
// remaining sections and the account block (identity + cerrar sesión).
//
// Nav data is the SAME module the sidebar reads (components/v2/nav.ts) — one
// source of truth for hrefs, labels, icons and badge wiring.

import { useEffect, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LogoutButton } from '@/components/v2/ajustes/LogoutButton';
import {
  V2_NAV_GROUP_LABELS,
  V2_NAV_GUIDE,
  V2_NAV_ITEMS,
  V2_NAV_SETTINGS,
  isV2NavActive,
  type V2NavItem,
} from '@/components/v2/nav';
import { cn } from '@/lib/utils';

/** The four operational tabs that live directly in the bar (thumb reach).
 *  Atletas primero: es la casa del panel (rediseño FLEXR). */
const PRIMARY_TAB_HREFS = ['/atletas', '/hoy', '/mensajes', '/leads'] as const;

const primaryTabs: V2NavItem[] = PRIMARY_TAB_HREFS.map(
  (href) => V2_NAV_ITEMS.find((item) => item.href === href),
).filter((item): item is V2NavItem => item !== undefined);

/** Everything else lives in the «Más» sheet, keeping the sidebar's grouping. */
const sheetGroups: { label: string | null; items: V2NavItem[] }[] = [
  {
    label: V2_NAV_GROUP_LABELS.negocio,
    items: V2_NAV_ITEMS.filter(
      (item) => item.group === 'negocio' && !PRIMARY_TAB_HREFS.includes(item.href as (typeof PRIMARY_TAB_HREFS)[number]),
    ),
  },
  {
    label: V2_NAV_GROUP_LABELS.metodo,
    items: V2_NAV_ITEMS.filter((item) => item.group === 'metodo'),
  },
  { label: null, items: [V2_NAV_GUIDE, V2_NAV_SETTINGS] },
];

const sheetHrefs = sheetGroups.flatMap((g) => g.items.map((i) => i.href));

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -right-2.5 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-nano font-bold"
      style={{ background: 'var(--v2-accent)', color: 'var(--v2-accent-fg)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function V2MobileNav({
  coach_name,
  coach_email,
  coach_avatar_url,
  unread_messages = 0,
  leads_nuevo = 0,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  unread_messages?: number;
  leads_nuevo?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const badgeCounts: Record<NonNullable<V2NavItem['badge']>, number> = {
    mensajes: unread_messages,
    leads: leads_nuevo,
  };
  const badgeFor = (item: V2NavItem) => (item.badge ? badgeCounts[item.badge] : 0);
  const masActive = sheetHrefs.some((href) => isV2NavActive(pathname, href));

  // Close the sheet on navigation (state adjusted during render, per React docs —
  // an effect here would trigger a cascading re-render lint error).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // Lock the page scroll behind the open sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const tabClass = (active: boolean) =>
    cn(
      'v2-focus relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[var(--v2-r-s)] px-1 pb-1 pt-1.5',
      'text-eyebrow font-bold tracking-[0.02em] transition-colors',
      active ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-muted)]',
    );

  return (
    <div className="lg:hidden">
      {/* Scrim + sheet «Más» */}
      {open ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
          style={{ background: 'var(--v2-scrim)' }}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más secciones"
        aria-hidden={!open}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 flex max-h-[78dvh] flex-col gap-4 overflow-y-auto',
          'rounded-t-[var(--v2-r-l)] border-t border-[color:var(--v2-border)]',
          'bg-[color:var(--v2-elevated)] shadow-[var(--v2-shadow-pop)]',
          'px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
      >
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-full bg-[color:var(--v2-border-strong)]" />
        {sheetGroups.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-2">
            {group.label ? (
              <span className="text-eyebrow font-bold uppercase tracking-[0.12em] text-[color:var(--v2-faint)]">
                {group.label}
              </span>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => {
                const active = isV2NavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'v2-focus flex min-h-[48px] items-center gap-2.5 rounded-[var(--v2-r-m)] border px-3 py-2.5 text-sm font-semibold transition-colors',
                      active
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)]'
                        : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)]',
                    )}
                  >
                    <MIcon
                      name={item.icon}
                      size={19}
                      filled={active}
                      className={active ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-muted)]'}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Account — on a phone this is the only place identity + sign-out live. */}
        <div className="flex items-center gap-3 border-t border-[color:var(--v2-border)] pt-4">
          <AthleteAvatar name={coach_name} imageUrl={coach_avatar_url} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{coach_name}</span>
            <span className="truncate text-xs text-[color:var(--v2-muted)]">{coach_email}</span>
          </div>
          <div className="ml-auto shrink-0">
            <LogoutButton />
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 grid grid-cols-5',
          'border-t border-[color:var(--v2-border)] backdrop-blur',
          'px-1 pt-1 pb-[calc(4px+env(safe-area-inset-bottom))]',
        )}
        style={{ background: 'color-mix(in srgb, var(--v2-surface) 92%, transparent)' }}
      >
        {primaryTabs.map((item) => {
          const active = isV2NavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={tabClass(active && !open)}
            >
              <span className="relative flex h-6 w-6 items-center justify-center">
                <MIcon name={item.icon} filled={active && !open} size={23} />
                <TabBadge count={badgeFor(item)} />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Más secciones"
          className={tabClass(open || masActive)}
        >
          <span className="flex h-6 w-6 items-center justify-center">
            <MIcon name="more_horiz" filled={open || masActive} size={23} />
          </span>
          Más
        </button>
      </nav>
    </div>
  );
}
