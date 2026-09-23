// Ajustes › Cuenta — el correo con el que entras y cerrar sesión.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachProfile } from '@/lib/coach/profile';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { LogoutButton } from '@/components/v2/ajustes/LogoutButton';
import { ReadOnlySetting, SettingsSection } from '@/components/v2/ajustes/SettingsKit';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Cuenta · Ajustes' };

export default async function CuentaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const profile = await getCoachProfile(session.coach_id).catch(() => null);

  return (
    <AjustesPanel title="Cuenta">
      <SettingsSection title="Acceso">
        <ReadOnlySetting
          label="Correo de acceso"
          value={profile?.email ?? 'No se ha podido leer'}
          hint="Es con el que entras al panel y donde recibes el enlace de acceso."
        />
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="t-body font-medium text-v2-fg">Cerrar sesión</span>
            <span className="t-body-sm text-v2-muted">En este navegador. Tus datos no se tocan.</span>
          </div>
          <LogoutButton className="w-fit" />
        </div>
      </SettingsSection>
    </AjustesPanel>
  );
}
