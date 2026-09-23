// Ajustes › Tu club — nombre, logo, color, box, dirección y correo de avisos.
// Es el único editor de estos campos en todo el panel.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getClubSkin } from '@/lib/coach/club-skin';
import { getCoachProfile } from '@/lib/coach/profile';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { AjustesLoadError } from '@/components/v2/ajustes/AjustesLoadError';
import { ClubForm } from '@/components/v2/club/ClubForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tu club · Ajustes' };

export default async function ClubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;

  const [club, profile] = await Promise.all([
    getClubSkin(session.coach_id).catch(() => null),
    getCoachProfile(session.coach_id).catch(() => null),
  ]);

  return (
    <AjustesPanel title="Tu club" subtitle="Lo que ven tus atletas en su app, no solo tú aquí.">
      {club && profile ? (
        <ClubForm initial={{ club, studio_name: profile.studio_name, location: profile.location }} />
      ) : (
        <AjustesLoadError what="los datos de tu club" />
      )}
    </AjustesPanel>
  );
}
