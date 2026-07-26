import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listThreadsForCoach } from '@/lib/chat/service';
import { countNewLeads } from '@/lib/dashboard/coach/leads';
import { countUpcomingCallsSoon } from '@/lib/citas/store';
import { V2Shell } from '@/components/v2/V2Shell';
import { V2ThemeScript } from '@/components/v2/theme/V2ThemeScript';
import './v2-theme.css';

// v2 route-group layout — the FOUNDATION of the redesign. Lives ALONGSIDE the
// v1 app: same auth gate (coach session), but a fully scoped theme + shell. The
// theme is isolated to the `.v2-root` wrapper (V2Shell → V2ThemeProvider); we
// never touch the <html> dark class, so the legacy app renders identically.
//
// The pre-paint V2ThemeScript runs before hydration to set data-theme on the
// root with no flash. The sidebar's Mensajes badge reads the live unread count.

export default async function V2Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) redirect('/sign-in');

  // Unread message count for the sidebar badge — degrades to 0 if the threads
  // loader fails (the rest of the shell stays up).
  let unread_messages = 0;
  try {
    const threads = await listThreadsForCoach({ coach_id: session.coach_id });
    unread_messages = threads.filter((t) => t.unread_count > 0).length;
  } catch {
    unread_messages = 0;
  }

  // Sidebar "Leads" badge = new leads + pending call requests (both need Pablo's
  // attention in the leads area). Degrades to 0 on failure.
  let leads_nuevo = 0;
  try {
    // Badge = new leads + calls in the next 48h (today/tomorrow), the day's actionables.
    const [newLeads, callsSoon] = await Promise.all([countNewLeads(), countUpcomingCallsSoon()]);
    leads_nuevo = newLeads + callsSoon;
  } catch {
    leads_nuevo = 0;
  }

  return (
    <>
      <V2ThemeScript />
      <V2Shell
        coach_name={session.full_name}
        coach_email={session.email}
        coach_avatar_url={session.avatar_url}
        unread_messages={unread_messages}
        leads_nuevo={leads_nuevo}
      >
        {children}
      </V2Shell>
    </>
  );
}
