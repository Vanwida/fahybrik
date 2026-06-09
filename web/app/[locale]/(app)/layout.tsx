import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/dashboard/layout/AppShell';
import { getCoachSession } from '@/lib/auth/coach-session';
import { countCoachInboxItems } from '@/lib/dashboard/coach/inbox';
import { redirect } from 'next/navigation';

export default async function AppLayout({
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

  const pending_inbox_count = await countCoachInboxItems({ coach_id: session.coach_id });

  return (
    <AppShell
      coach_name={session.full_name}
      pending_inbox_count={pending_inbox_count}
      is_admin={session.roles.includes('admin')}
    >
      {children}
    </AppShell>
  );
}
