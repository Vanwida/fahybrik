// v2 · ESTUDIO — papers del coach. Upload + lista + búsqueda. No es método.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listPapers } from '@/lib/rag/papers';
import { EstudioPapersView } from '@/components/v2/estudio/EstudioPapersView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Estudio' };

export default async function EstudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const papers = await listPapers(session.coach_id);

  return <EstudioPapersView initialPapers={papers} />;
}
