// Programar › Grupos.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listGroups } from '@/lib/coach/groups';
import { GruposList } from '@/components/v2/periodizacion/GruposList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Grupos' };

export default async function GruposPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const groups = await listGroups(session.coach_id).catch(() => null);
  return <GruposList groups={groups} />;
}
