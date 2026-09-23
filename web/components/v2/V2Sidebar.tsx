'use client';

// La barra lateral del panel (escritorio): el club arriba, cinco destinos, el
// progreso de puesta en marcha mientras falte algo y Ajustes anclado abajo.
// Se pliega a una tira de iconos de 64 px con «[» o con el botón de la barra
// superior (lo recuerda este navegador).
//
// La selección es NEUTRA (superficie + barra de tinta de 2 px), nunca el color
// del club: el acento solo pinta el botón primario, el anillo de foco y el logo.
// Las cifras son exactas hasta 99.

import type { ReactNode } from 'react';
import type { ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { Link, usePathname } from '@/i18n/navigation';
import { ClubLockup, clubBrandLabel } from '@/components/v2/club/ClubBrand';
import { Tooltip } from '@/components/v2/ui';
import {
  HOME_HREF,
  NAV_SETTINGS,
  badgeLabel,
  isNavActive,
  visibleNavItems,
  type NavBadge,
  type NavItem,
} from '@/components/v2/nav';
import { cn } from '@/lib/utils';

export type ShellCounts = Record<NavBadge, number | null>;

/** Ancho del menú desplegado (plegado: w-16). El contenido se aparta lo mismo (V2Shell). */
export const RAIL_W = 'w-[216px]';

function NavLink({
  item,
  active,
  count,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  count: number | null;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const badge = badgeLabel(count);
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={badge ? `${item.label}, ${badge}` : item.label}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-ctl px-2.5 t-body outline-none',
        'transition-colors duration-[var(--v2-dur-fast)]',
        'focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
        'group-data-[rail=collapsed]/shell:justify-center group-data-[rail=collapsed]/shell:px-0',
        active
          ? "bg-v2-select font-semibold text-v2-select-fg before:absolute before:-left-2 before:inset-y-2 before:w-0.5 before:rounded-full before:bg-v2-select-bar before:content-['']"
          : 'font-medium text-v2-muted hover:bg-v2-hover hover:text-v2-fg',
      )}
    >
      <Icon aria-hidden strokeWidth={active ? 2 : 1.75} className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate group-data-[rail=collapsed]/shell:hidden">{item.label}</span>
      {badge ? (
        <>
          <span
            aria-hidden
            className={cn(
              't-meta t-tnum group-data-[rail=collapsed]/shell:hidden',
              active ? 'text-v2-fg' : 'text-v2-muted',
            )}
          >
            {badge}
          </span>
          <span
            aria-hidden
            className="absolute -right-0.5 -top-1 hidden h-[18px] min-w-[18px] items-center justify-center rounded-full bg-v2-fg px-1 t-meta leading-none font-semibold text-v2-bg t-tnum group-data-[rail=collapsed]/shell:flex"
          >
            {badge}
          </span>
        </>
      ) : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip content={badge ? `${item.label} · ${badge}` : item.label} side="right">
      {link}
    </Tooltip>
  );
}

export function V2Sidebar({
  club,
  counts,
  negocio,
  collapsed,
  setup,
}: {
  club: ClubSkin;
  counts: ShellCounts;
  negocio: boolean;
  collapsed: boolean;
  /** Progreso de puesta en marcha («Setup 5/9»); null cuando está completo. */
  setup?: ReactNode;
}) {
  const pathname = usePathname();
  const items = visibleNavItems({ negocio });
  const brand = clubBrandLabel(club.name);

  return (
    <aside
      aria-label="Menú principal"
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-v2-border bg-v2-surface lg:flex',
        RAIL_W,
        'group-data-[rail=collapsed]/shell:w-16',
        'transition-[width] duration-[var(--v2-dur)] ease-[var(--v2-ease)] motion-reduce:transition-none',
      )}
    >
      {/* El club: logo + nombre (dato del coach; vacío = la marca del producto). */}
      <div className="flex h-12 shrink-0 items-center border-b border-v2-border px-3 group-data-[rail=collapsed]/shell:justify-center group-data-[rail=collapsed]/shell:px-0">
        <Link
          href={HOME_HREF}
          aria-label={brand}
          className="flex min-w-0 items-center gap-2.5 rounded-ctl p-1 outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
        >
          <ClubLockup
            name={club.name}
            logo_url={club.logo_url}
            markClassName="size-7 shrink-0"
            wordmarkClassName="min-w-0 truncate text-[15px] group-data-[rail=collapsed]/shell:hidden"
          />
        </Link>
      </div>

      <nav aria-label="Secciones" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {items.map((item) => (
          <NavLink
            key={item.key}
            item={item}
            active={isNavActive(pathname, item.href)}
            count={item.badge ? counts[item.badge] : null}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 px-2 pb-3">
        {setup ? <div className="mb-2 group-data-[rail=collapsed]/shell:hidden">{setup}</div> : null}
        <NavLink
          item={NAV_SETTINGS}
          active={isNavActive(pathname, NAV_SETTINGS.href)}
          count={null}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
