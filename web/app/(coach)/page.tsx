import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { buildCohort } from '@/lib/coach/cohort';
import { buildBriefing } from '@/lib/coach/briefing';
import {
  ColumnPrefsSchema,
  DEFAULT_COLUMNS,
  type ColumnKey,
} from '@/lib/coach/types';
import { CohortDashboard } from '@/components/coach/CohortDashboard';

const COLUMNS_COOKIE = 'fahybrik_cohort_columns';

export const dynamic = 'force-dynamic';

export default async function CoachCohortPage() {
  const session = await getCoachSession();
  if (!session) redirect('/auth/sign-in');

  const cohort = await buildCohort({ coach_id: session.coach_id });
  const briefing = buildBriefing({
    coach_first_name: session.full_name,
    cohort,
  });

  const store = await cookies();
  const columns = readColumnPrefs(store.get(COLUMNS_COOKIE)?.value);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <CohortDashboard
        initial_briefing={briefing}
        initial_cohort={cohort}
        initial_columns={columns}
      />
    </div>
  );
}

function readColumnPrefs(value: string | undefined): ColumnKey[] {
  if (!value) return [...DEFAULT_COLUMNS];
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    const valid = ColumnPrefsSchema.safeParse(parsed);
    if (valid.success) return valid.data.visible;
  } catch {
    // fall through
  }
  return [...DEFAULT_COLUMNS];
}
