import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';

export const dynamic = 'force-dynamic';

export default async function TemplatesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Templates routes are coach-only; gate at the layout so every nested route
  // (browse / new / [id]) inherits the redirect without duplicating the check.
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  return (
    <div className="flex flex-1 min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
