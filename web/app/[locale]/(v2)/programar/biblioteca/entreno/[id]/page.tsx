import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadLibraryItem } from '@/lib/dashboard/programming/library-item';
import { LibraryItemEditor } from '@/components/v2/biblioteca/LibraryItemEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entreno' };

export default async function EntrenoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const templateId = Number(id);
  if (!Number.isInteger(templateId) || templateId <= 0) notFound();
  const model = await loadLibraryItem({ coach_id: session.coach_id, kind: 'entreno', id: templateId }).catch(() => null);
  if (!model) notFound();
  return <LibraryItemEditor key={model.id} model={model} cola={false} nextReviewId={null} />;
}
