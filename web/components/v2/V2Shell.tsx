'use client';

// V2Shell — the client chrome around every v2 page: the scoped theme root
// (V2ThemeProvider), the collapsible sidebar, and a top utility bar holding the
// version switch (v1 ↔ v2), the theme toggle and the coach name. Pages render
// inside <main>. Kept client-side because the sidebar + theme need hooks; the
// data (coach name, unread count) is passed down from the server layout.

import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { VersionSwitch } from '@/components/v2/VersionSwitch';
import { V2Sidebar } from '@/components/v2/V2Sidebar';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';

export function V2Shell({
  coach_name,
  unread_messages,
  children,
}: {
  coach_name: string;
  unread_messages: number;
  children: React.ReactNode;
}) {
  const firstName = coach_name.split(/\s+/)[0] ?? coach_name;

  return (
    <V2ThemeProvider>
      <V2Sidebar unread_messages={unread_messages} />
      <div className="flex min-h-[100dvh] min-w-0 flex-col lg:ml-20">
        {/* Top utility bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-end gap-3 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur sm:px-6">
          <VersionSwitch />
          <ThemeToggle />
          <span className="hidden items-center gap-2 sm:flex">
            <span className="text-xs font-semibold text-[color:var(--v2-muted)]">{firstName}</span>
            <AthleteAvatar name={coach_name} size="sm" />
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </V2ThemeProvider>
  );
}
