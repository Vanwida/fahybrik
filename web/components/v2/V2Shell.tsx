'use client';

// V2Shell — el cromo de cliente alrededor de cada página del panel: la raíz con
// tema (V2ThemeProvider → `.v2-root[data-theme]`, oscuro por defecto), los
// proveedores de los primitivos (avisos con Deshacer, tooltips), la barra lateral
// plegable (escritorio), la barra superior de 48 px (buscar ⌘K, «+ Nuevo», ayuda,
// tema, cuenta), la navegación del móvil y el ⌘K. Las páginas van en <main>.
//
// La fuente (Figtree) llega del layout en `font_vars`; el club (nombre, logo,
// acento) llega como DATO del coach — el acento solo pinta botón primario, anillo
// de foco y logo, nunca la navegación.

import type { CSSProperties, ReactNode } from 'react';
import type { ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import { PanelProviders } from '@/components/v2/ui';
import { V2Sidebar, type ShellCounts } from '@/components/v2/V2Sidebar';
import { V2MobileNav } from '@/components/v2/V2MobileNav';
import { CommandPalette } from '@/components/v2/shell/CommandPalette';
import { ShellProvider, useShell } from '@/components/v2/shell/ShellContext';
import { NEW_MENU_TRIGGER_ID, TopBar } from '@/components/v2/shell/TopBar';
import { useShellShortcuts } from '@/components/v2/shell/use-shell-shortcuts';
import { useRailCollapsed } from '@/components/v2/shell/viewer-prefs';
import { ShellOverlays } from '@/components/v2/shell/ShellOverlays';
import { cn } from '@/lib/utils';

export type { ShellCounts };

/** Alto de la barra superior; PageFrame y las pantallas a altura completa lo leen. */
const SHELL_VARS = { '--v2-topbar-h': '48px' } as CSSProperties;

export function V2Shell({
  coach_name,
  coach_email,
  coach_avatar_url,
  club,
  counts,
  negocio,
  setup,
  font_vars,
  prepaint,
  children,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  club: ClubSkin;
  /** Cifras de la barra (null = no se sabe → sin insignia, nunca un 0 falso). */
  counts: ShellCounts;
  /** El coach tiene el add-on de Negocio. */
  negocio: boolean;
  /** «Setup n/9» mientras falte algo por poner en marcha. */
  setup?: ReactNode;
  /** Clases de next/font con --font-figtree (fonts.ts). */
  font_vars?: string;
  /** Scripts previos al pintado (tema, menú plegado): primer hijo del contenedor. */
  prepaint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <V2ThemeProvider className={font_vars} accentHex={club.accent_hex}>
      <PanelProviders>
        <ShellProvider negocio={negocio} overlays={<ShellOverlays />}>
          <ShellFrame
            club={club}
            counts={counts}
            negocio={negocio}
            setup={setup}
            prepaint={prepaint}
            coach_name={coach_name}
            coach_email={coach_email}
            coach_avatar_url={coach_avatar_url}
          >
            {children}
          </ShellFrame>
          <CommandPalette />
        </ShellProvider>
      </PanelProviders>
    </V2ThemeProvider>
  );
}

function ShellFrame({
  club,
  counts,
  negocio,
  setup,
  prepaint,
  coach_name,
  coach_email,
  coach_avatar_url,
  children,
}: {
  club: ClubSkin;
  counts: ShellCounts;
  negocio: boolean;
  setup?: ReactNode;
  prepaint?: ReactNode;
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  children: ReactNode;
}) {
  const { openPalette } = useShell();
  const [collapsed, toggleRail] = useRailCollapsed();
  useShellShortcuts({
    negocio,
    onPalette: () => openPalette(),
    onToggleRail: toggleRail,
    onNew: () => document.getElementById(NEW_MENU_TRIGGER_ID)?.click(),
  });

  return (
    // `data-rail` lo pone también el script previo al pintado (menú plegado sin
    // salto al cargar); por eso se tolera la diferencia al hidratar.
    <div
      className="group/shell"
      data-rail={collapsed ? 'collapsed' : 'expanded'}
      style={SHELL_VARS}
      suppressHydrationWarning
    >
      {prepaint}
      <a
        href="#contenido"
        className="sr-only z-50 rounded-ctl bg-v2-surface px-3 py-2 t-body focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:shadow-pop"
      >
        Saltar al contenido
      </a>
      <V2Sidebar
        club={club}
        counts={counts}
        negocio={negocio}
        collapsed={collapsed}
        setup={setup}
      />
      <div
        className={cn(
          'flex min-h-[100dvh] min-w-0 flex-col',
          'lg:pl-[216px] lg:group-data-[rail=collapsed]/shell:pl-16',
          'transition-[padding] duration-[var(--v2-dur)] ease-[var(--v2-ease)] motion-reduce:transition-none',
        )}
      >
        <TopBar
          club={club}
          coach_name={coach_name}
          coach_email={coach_email}
          coach_avatar_url={coach_avatar_url}
          railCollapsed={collapsed}
          onToggleRail={toggleRail}
        />
        {/* Abajo < lg deja sitio a la barra de pestañas fija.
            OJO: PageFrame (components/v2/PageFrame.tsx) CANCELA este acolchado con
            márgenes negativos para ocupar todo el hueco útil. Están atados. */}
        <main id="contenido" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none sm:p-6 sm:pb-24 lg:pb-6">
          {children}
        </main>
        <V2MobileNav
          coach_name={coach_name}
          coach_email={coach_email}
          coach_avatar_url={coach_avatar_url}
          counts={counts}
          negocio={negocio}
        />
      </div>
    </div>
  );
}
