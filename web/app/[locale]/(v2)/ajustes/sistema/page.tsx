// Referencia viva del sistema de diseño del panel (primitivos + tokens). No
// está en la navegación del coach: es la mesa de QA visual de quien construye
// pantallas. Datos inventados, nada del club.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { SistemaView } from '@/components/v2/sistema/SistemaView';

export const metadata: Metadata = {
  title: 'Sistema — panel',
  robots: { index: false, follow: false },
};

export default async function SistemaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SistemaView />;
}
