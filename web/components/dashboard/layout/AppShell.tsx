'use client';

import { usePathname } from '@/i18n/navigation';
import { CoachSidebar } from '@/components/dashboard/layout/CoachSidebar';
import { CoachMobileNav } from '@/components/dashboard/layout/CoachMobileNav';
import { cn } from '@/lib/utils';

interface AppShellProps {
  coach_name: string;
  /** Total pending items in the Hoy inbox — drives the sidebar badge. */
  pending_inbox_count?: number;
  /** Whether this login also holds the admin role — shows the /admin nav entry. */
  is_admin?: boolean;
  children: React.ReactNode;
}

function isStudioRoute(pathname: string): boolean {
  // Studio shell covers /<locale>/programar (biblioteca única) and its
  // sub-routes (/programar/microciclos/<id>, /programar/weeks/<id>).
  return /\/programar(?:\/|$)/.test(pathname);
}

export function AppShell({ coach_name, pending_inbox_count = 0, is_admin = false, children }: AppShellProps) {
  const pathname = usePathname();
  const studio = isStudioRoute(pathname);
  const firstName = coach_name.split(/\s+/)[0];

  return (
    <div className={cn('bg-[color:var(--bg)]', studio ? 'flex h-[100dvh] flex-col overflow-hidden lg:flex-row' : 'min-h-screen')}>
      <CoachSidebar pending_inbox_count={pending_inbox_count} is_admin={is_admin} />
      <CoachMobileNav pending_inbox_count={pending_inbox_count} is_admin={is_admin} />
      <div
        className={cn(
          'lg:ml-20 flex min-w-0 flex-col',
          studio ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-screen',
        )}
      >
        {!studio ? (
          // Header desktop (nombre del coach). La campana desapareció: todo lo
          // accionable fluye al inbox de Hoy (UX redesign §0). En móvil lo
          // sustituye la top-bar de CoachMobileNav.
          <header className="sticky top-0 z-10 hidden h-14 shrink-0 items-center justify-end gap-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-6 lg:flex">
            <span className="text-xs font-semibold text-[color:var(--text-muted)]">{firstName}</span>
          </header>
        ) : null}
        <main
          className={cn(
            studio ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex-1 p-4 sm:p-6',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
