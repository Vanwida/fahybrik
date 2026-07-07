'use client';

// V2Shell — the client chrome around every dashboard page: the scoped theme root
// (V2ThemeProvider), the collapsible sidebar, and a top utility bar holding the
// theme toggle and the coach name. Pages render inside <main>. Kept client-side
// because the sidebar + theme need hooks; the data (coach name, unread count)
// is passed down from the server layout.

import { V2ThemeProvider } from '@/components/v2/theme/V2ThemeProvider';
import { ThemeToggle } from '@/components/v2/theme/ThemeToggle';
import { V2Sidebar } from '@/components/v2/V2Sidebar';
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
        {/* Top utility bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-end gap-3 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_85%,transparent)] px-4 backdrop-blur sm:px-6">
          <ThemeToggle />
          <AccountMenu
            coach_name={coach_name}
            coach_email={coach_email}
            coach_avatar_url={coach_avatar_url}
          />
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </V2ThemeProvider>
  );
}
