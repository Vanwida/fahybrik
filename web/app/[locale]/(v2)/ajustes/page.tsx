// /ajustes — en el móvil, la lista de paneles (se entra en uno y se vuelve);
// en escritorio salta a «Tu perfil», porque la sub-navegación ya está al lado.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { AjustesIndex } from '@/components/v2/ajustes/AjustesNav';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function AjustesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AjustesIndex />;
}
