// Ajustes › Plan del atleta — cuándo se abre cada semana y cuánto puede mirar
// por delante.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getAutoPublishSetting } from '@/lib/coach/week-publishing';
import { getCoachPlanWeekHorizon } from '@/lib/coach/plan-week-horizon';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { PlanAtletaSettings } from '@/components/v2/ajustes/PlanAtletaSettings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plan del atleta · Ajustes' };

export default async function PlanAtletaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const [autoPublish, horizon] = await Promise.all([
    getAutoPublishSetting(session.coach_id).catch(() => null),
    getCoachPlanWeekHorizon(session.coach_id).catch(() => null),
  ]);

  return (
    <AjustesPanel title="Plan del atleta" subtitle="Qué semanas ve cada atleta y cuándo.">
      <PlanAtletaSettings autoPublish={autoPublish} horizon={horizon} />
    </AjustesPanel>
  );
}
