'use client';

// V2Shell — the client chrome around every dashboard page: the scoped FLEXR
// theme root (`.v2-root`, tema claro único — el toggle murió con el rediseño),
// the floating sidebar (desktop), the mobile bottom nav (< lg) and a slim top
// utility bar holding the CLUB brand (mobile only; the sidebar carries it on
// desktop) and the account menu. Pages render inside <main>. The font variables
// (Bricolage + Figtree) arrive from the server layout via `font_vars`, and the
// club skin (nombre, logo, acento) llega como DATO del coach: clubAccentCssVars
// repinta --v2-accent* sobre el cromo neutro FLEXR (vacío = tinta).

import type { CSSProperties } from 'react';
import type { ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { clubAccentCssVars } from '@fahybrid/shared/domain/coach/club-skin';
import { Link } from '@/i18n/navigation';
import { ClubLockup, clubBrandLabel } from '@/components/v2/club/ClubBrand';
import { V2Sidebar } from '@/components/v2/V2Sidebar';
import { V2MobileNav } from '@/components/v2/V2MobileNav';
import { AccountMenu } from '@/components/v2/AccountMenu';
import { cn } from '@/lib/utils';

export function V2Shell({
  coach_name,
  coach_email,
  coach_avatar_url,
  club,
  unread_messages,
  leads_nuevo,
  font_vars,
  children,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  club: ClubSkin;
  unread_messages: number;
  leads_nuevo: number;
  /** Clases de next/font con --font-bricolage y --font-figtree (fonts.ts). */
  font_vars?: string;
  children: React.ReactNode;
}) {
  const accentStyle = clubAccentCssVars(club.accent_hex) as CSSProperties;
  const brand = clubBrandLabel(club.name);
  return (
    <div className={cn('v2-root', font_vars)} style={accentStyle}>
      <V2Sidebar club={club} unread_messages={unread_messages} leads_nuevo={leads_nuevo} />
      {/* El sidebar flotante ocupa 16 + 236 px; el contenido arranca tras 16 px más. */}
      <div className="flex min-h-[100dvh] min-w-0 flex-col lg:ml-[268px]">
        {/* Top utility bar — brand on the left only where the sidebar is hidden. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur sm:px-6 lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
          <Link href="/atletas" aria-label={brand} className="v2-focus flex items-center gap-2.5 lg:hidden">
            <ClubLockup
              name={club.name}
              logo_url={club.logo_url}
              markClassName="h-8 w-8 shrink-0"
              wordmarkClassName="text-[1.2rem]"
            />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <AccountMenu
              coach_name={coach_name}
              coach_email={coach_email}
              coach_avatar_url={coach_avatar_url}
            />
          </div>
        </header>

        {/* Bottom padding < lg clears the fixed mobile tab bar.
            OJO: PageFrame (components/v2/PageFrame.tsx) CANCELA este acolchado
            con márgenes negativos para plantarse sobre todo el hueco útil. Si
            cambian estos valores, cambian allí — están atados. */}
        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">{children}</main>

        <V2MobileNav
          coach_name={coach_name}
          coach_email={coach_email}
          coach_avatar_url={coach_avatar_url}
          unread_messages={unread_messages}
          leads_nuevo={leads_nuevo}
        />
      </div>
    </div>
  );
}
