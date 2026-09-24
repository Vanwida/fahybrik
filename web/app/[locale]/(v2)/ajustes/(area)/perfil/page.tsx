// Ajustes › Tu perfil — la persona: nombre, foto, bio, especialidades.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachProfile } from '@/lib/coach/profile';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { PerfilForm } from '@/components/v2/ajustes/PerfilForm';
import { AjustesLoadError } from '@/components/v2/ajustes/AjustesLoadError';
import { AjustesSetup } from '@/components/v2/ajustes/AjustesSetup';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tu perfil · Ajustes' };

export default async function PerfilPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const profile = await getCoachProfile(session.coach_id).catch(() => null);

  return (
    <AjustesPanel title="Tu perfil" subtitle="Lo que ven tus atletas de ti.">
      <AjustesSetup />
      {profile ? <PerfilForm initial={profile} /> : <AjustesLoadError what="tu perfil" />}
    </AjustesPanel>
  );
}
