'use client';

// V2Shell — the client chrome around every dashboard page: the scoped theme root
// (V2ThemeProvider), the collapsible sidebar (desktop), the mobile bottom nav
// (< lg — before it existed a phone had NO navigation at all), and a top utility
// bar holding the brand (mobile only; the sidebar carries it on desktop), the
// theme toggle and the coach name. Pages render inside <main>. Kept client-side
// because the sidebar + theme need hooks; the data (coach name, unread count,
// club skin) is passed down from the server layout.

import type { CSSProperties } from 'react';
import type { ClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { clubAccentCssVars } from '@fahybrid/shared/domain/coach/club-skin';
import { Link } from '@/i18n/navigation';
import { ClubLockup, clubBrandLabel } from '@/components/v2/club/ClubBrand';
import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { V2Sidebar } from '@/components/v2/V2Sidebar';
import { V2MobileNav } from '@/components/v2/V2MobileNav';
import { AccountMenu } from '@/components/v2/AccountMenu';

export function V2Shell({
  coach_name,
  coach_email,
  coach_avatar_url,
  club,
  unread_messages,
  leads_nuevo,
  children,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  club: ClubSkin;
  unread_messages: number;
  leads_nuevo: number;
  children: React.ReactNode;
}) {
  const accentStyle = clubAccentCssVars(club.accent_hex) as CSSProperties;
  const brand = clubBrandLabel(club.name);
  return (
    <V2ThemeProvider accentStyle={accentStyle}>
      <V2Sidebar club={club} unread_messages={unread_messages} leads_nuevo={leads_nuevo} />
      <div className="flex min-h-[100dvh] min-w-0 flex-col lg:ml-20">
        {/* Top utility bar — brand on the left only where the sidebar is hidden. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur sm:px-6">
          <Link href="/hoy" aria-label={brand} className="v2-focus flex items-center gap-2.5 lg:hidden">
            <ClubLockup
              name={club.name}
              logo_url={club.logo_url}
              markClassName="h-8 w-8 shrink-0"
              wordmarkClassName="v2-display text-[1.2rem] tracking-[-0.02em]"
            />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
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
    </V2ThemeProvider>
  );
}
