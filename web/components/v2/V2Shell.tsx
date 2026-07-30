'use client';

// V2Shell — the client chrome around every dashboard page: the scoped theme root
// (V2ThemeProvider), the collapsible sidebar (desktop), the mobile bottom nav
// (< lg — before it existed a phone had NO navigation at all), and a top utility
// bar holding the brand (mobile only; the sidebar carries it on desktop), the
// theme toggle and the coach name. Pages render inside <main>. Kept client-side
// because the sidebar + theme need hooks; the data (coach name, unread count)
// is passed down from the server layout.

import { Link } from '@/i18n/navigation';
import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { V2Sidebar, HexMark } from '@/components/v2/V2Sidebar';
import { V2MobileNav } from '@/components/v2/V2MobileNav';
import { AccountMenu } from '@/components/v2/AccountMenu';

export function V2Shell({
  coach_name,
  coach_email,
  coach_avatar_url,
  unread_messages,
  leads_nuevo,
  children,
}: {
  coach_name: string;
  coach_email: string;
  coach_avatar_url: string | null;
  unread_messages: number;
  leads_nuevo: number;
  children: React.ReactNode;
}) {
  return (
    <V2ThemeProvider>
      <V2Sidebar unread_messages={unread_messages} leads_nuevo={leads_nuevo} />
      <div className="flex min-h-[100dvh] min-w-0 flex-col lg:ml-20">
        {/* Top utility bar — brand on the left only where the sidebar is hidden. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur sm:px-6">
          <Link href="/hoy" aria-label="FAHYBRID" className="v2-focus flex items-center gap-2.5 lg:hidden">
            <HexMark className="h-8 w-8 shrink-0" />
            <span className="v2-display text-[1.2rem] tracking-[-0.02em]">
              <span className="text-[color:var(--v2-fg)]">FA</span>
              <span className="text-[color:var(--v2-accent)]">HYBRID</span>
            </span>
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
