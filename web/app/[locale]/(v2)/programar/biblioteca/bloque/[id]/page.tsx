import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadLibraryItem, nextBlockToReview } from '@/lib/dashboard/programming/library-item';
import { LibraryItemEditor } from '@/components/v2/biblioteca/LibraryItemEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bloque' };

export default async function BloquePage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ cola?: string }> }) {
  const { locale, id } = await params;
  const { cola } = await searchParams;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const blockId = Number(id);
  if (!Number.isInteger(blockId) || blockId <= 0) notFound();
  const [model, next] = await Promise.all([
    loadLibraryItem({ coach_id: session.coach_id, kind: 'bloque', id: blockId }).catch(() => null),
    cola === '1' ? nextBlockToReview(session.coach_id, blockId).catch(() => null) : Promise.resolve(null),
  ]);
  if (!model) notFound();
  return <LibraryItemEditor key={model.id} model={model} cola={cola === '1'} nextReviewId={next} />;
}
