// ATLETAS (/atletas): la tabla del roster con vistas guardadas, filtros en la URL
// y acciones en bloque (plan §6 «Atletas»). El servidor carga el roster UNA vez
// (loadRoster, set-based) más niveles y vistas del coach; filtrar, buscar y
// ordenar pasa en el cliente sobre esas filas y vive en la URL.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadAtletas } from '@/components/v2/atletas/load-atletas';
import { AtletasScreen } from '@/components/v2/atletas/AtletasScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Atletas' };

export default async function AtletasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const data = await loadAtletas({ coach_id: session.coach_id });
  return <AtletasScreen data={data} />;
}
