import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { DeepDiveSubNav } from '@/components/coach/DeepDiveSubNav';
import { AthleteIdParamSchema } from '@/lib/coach/deep-dive-types';

interface AthleteLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function AthleteDeepDiveLayout({ children, params }: AthleteLayoutProps) {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const { id } = await params;
  const parsed = AthleteIdParamSchema.safeParse({ id });
  if (!parsed.success) {
    return (
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-sm text-[color:var(--danger)]">athlete id inválido</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4">
        <DeepDiveSubNav athlete_id={parsed.data.id} />
        {children}
      </div>
    </div>
  );
}
