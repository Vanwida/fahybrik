import { setRequestLocale } from 'next-intl/server';
import { getAdminSession } from '@/lib/auth/admin-session';
import { listEvents } from '@/lib/coach/events';
import { RaceCatalogAdmin } from '@/components/admin/races/RaceCatalogAdmin';

export const dynamic = 'force-dynamic';

// Owner/admin race-catalog curation (phase 2c). The (admin) layout already gates
// the whole subtree; re-checking here makes a render without an admin session
// impossible even if the tree changes.
export default async function AdminRacesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getAdminSession();
  if (!session) return null;

  // The curator sees the whole catalog: past + future, visible + hidden.
  const races = await listEvents({ scope: 'all', visibility: 'all' }).catch(
    () => [],
  );

  return <RaceCatalogAdmin initial_races={races} />;
}
