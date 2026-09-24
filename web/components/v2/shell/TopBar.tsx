'use client';

// La barra superior (48 px, con superficie — el contenido ya no pasa por debajo
// sin fondo). Escritorio: buscar (⌘K) · «+ Nuevo» · «?» · tema · cuenta.
// Móvil: el club · buscar · cuenta (lo demás vive en «Más»).

import { useSyncExternalStore } from 'react';
import { ChevronDown, CircleHelp, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import type { ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { ClubLockup, clubBrandLabel } from '@/components/v2/club/ClubBrand';
import { Button, IconButton, Kbd, Menu, type MenuEntry } from '@/components/v2/ui';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { AccountMenu } from '@/components/v2/AccountMenu';
import { GUIA_HREF, HOME_HREF } from '@/components/v2/nav';
import { guiaSlugForPath } from '@/components/v2/guia/screen-for-path';
import { ACTIONS } from './destinations';
import { PENDING_ACTIONS } from './ShellOverlays';
import { useShell } from './ShellContext';

/** El disparador de «+ Nuevo» — la tecla C lo pulsa. */
export const NEW_MENU_TRIGGER_ID = 'shell-nuevo';

function subscribeNothing() {
  return () => {};
}

/** «⌘K» en Mac, «Ctrl K» en el resto (en servidor, ⌘K). */
function usePaletteKeyLabel(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => '⌘K',
  );
}

export function helpHref(slug: string | null): string {
  return slug ? `${GUIA_HREF}/${slug}` : GUIA_HREF;
}

export function TopBar({
  club,
  coach_name,
  coach_email,
  coach_avatar_url,
  railCollapsed,
  onToggleRail,
}: {
  club: ClubSkin;
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  railCollapsed: boolean;
  onToggleRail: () => void;
}) {
  const { openPalette, runAction, helpSlug: declaredHelp } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  // Lo que declara la pantalla manda; si no declara nada, su ruta.
  const helpSlug = declaredHelp ?? guiaSlugForPath(pathname);
  const keyLabel = usePaletteKeyLabel();

  const newItems: MenuEntry[] = ACTIONS.flatMap((a, i): MenuEntry[] => {
    const item: MenuEntry = { label: a.label, onSelect: () => runAction(a.id), disabled: PENDING_ACTIONS.has(a.id) };
    // Crear arriba; lo que actúa sobre atletas, separado.
    return a.id === 'asignar_programa' && i > 0 ? [{ type: 'separator' }, item] : [item];
  });

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-v2-border bg-v2-surface px-3 sm:px-4 lg:px-5">
      {/* Móvil: el club a la izquierda (en escritorio lo lleva el menú lateral). */}
      <Link
        href={HOME_HREF}
        aria-label={clubBrandLabel(club.name)}
        className="flex min-w-0 items-center gap-2 rounded-ctl p-1 outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)] lg:hidden"
      >
        <ClubLockup
          name={club.name}
          logo_url={club.logo_url}
          markClassName="size-7 shrink-0"
          wordmarkClassName="min-w-0 truncate text-[15px]"
        />
      </Link>

      {/* Escritorio: plegar el menú lateral y el buscador en el sitio del título. */}
      <IconButton
        icon={railCollapsed ? PanelLeftOpen : PanelLeftClose}
        label={railCollapsed ? 'Desplegar menú' : 'Plegar menú'}
        shortcut="["
        tooltipSide="bottom"
        onClick={onToggleRail}
        aria-expanded={!railCollapsed}
        className="-ml-2 hidden lg:inline-flex"
      />
      <Button
        variant="secondary"
        icon={Search}
        onClick={() => openPalette()}
        aria-label="Buscar"
        aria-keyshortcuts="Meta+K Control+K"
        className="hidden h-8 w-full max-w-[420px] justify-start bg-v2-bg font-normal text-v2-faint hover:bg-v2-bg hover:text-v2-muted lg:inline-flex"
      >
        <span className="min-w-0 flex-1 truncate text-left">Buscar atleta, programa, pantalla…</span>
        <Kbd>{keyLabel}</Kbd>
      </Button>

      <span className="flex-1" />

      <IconButton icon={Search} label="Buscar" shortcut={keyLabel} onClick={() => openPalette()} className="lg:hidden" tooltipSide="bottom" />

      <div className="hidden items-center gap-1 lg:flex">
        <Menu
          width="w-56"
          trigger={
            <Button id={NEW_MENU_TRIGGER_ID} variant="secondary" icon={Plus} iconEnd={ChevronDown} aria-keyshortcuts="C" className="mr-1">
              Nuevo
            </Button>
          }
          items={newItems}
        />
        <IconButton
          icon={CircleHelp}
          label={helpSlug ? 'Ayuda de esta pantalla' : 'Ayuda'}
          tooltipSide="bottom"
          onClick={() => router.push(helpHref(helpSlug))}
        />
        <ThemeToggle />
      </div>

      <div className="ml-1">
        <AccountMenu coach_name={coach_name} coach_email={coach_email} coach_avatar_url={coach_avatar_url} />
      </div>
    </header>
  );
}
