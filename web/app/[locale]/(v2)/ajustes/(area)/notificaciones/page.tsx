// Ajustes › Notificaciones — avisos push de este navegador.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Card } from '@/components/v2/ui';
import { AjustesPanel } from '@/components/v2/ajustes/AjustesPanel';
import { PushCard } from '@/components/v2/push/PushNotifications';

export const metadata: Metadata = { title: 'Notificaciones · Ajustes' };

export default async function NotificacionesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <AjustesPanel title="Notificaciones" subtitle="Cada navegador y cada dispositivo se activa por separado.">
      <Card padding="none">
        <PushCard />
      </Card>
    </AjustesPanel>
  );
}
