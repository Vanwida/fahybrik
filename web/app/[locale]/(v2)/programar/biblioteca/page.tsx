// Programar › Biblioteca: entrenos, bloques y ejercicios del coach, en tabla.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listLibrary } from '@/lib/dashboard/programming/library';
import { BibliotecaView } from '@/components/v2/biblioteca/BibliotecaView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Biblioteca' };

export default async function BibliotecaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const data = await listLibrary({ coach_id: session.coach_id }).catch(() => null);
  return <BibliotecaView data={data} />;
}
