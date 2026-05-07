import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getCoachSession } from '@/lib/auth/coach-session';
import { CoachSidebar } from '@/components/coach/CoachSidebar';
import { CoachHeader } from '@/components/coach/CoachHeader';

export default async function CoachLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const counts = await sql<Array<{ n: number }>>`
    select count(*)::int as n
    from athletes
    where coach_id = ${session.coach_id as unknown as number}
  `;
  const athleteCount = counts[0]?.n ?? 0;

  return (
    <div className="flex flex-1 min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)]">
      <CoachSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <CoachHeader coach_name={session.full_name} athlete_count={athleteCount} />
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    </div>
  );
}
