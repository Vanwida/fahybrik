import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LibraryItemEditor } from '@/components/v2/biblioteca/LibraryItemEditor';

export const metadata: Metadata = { title: 'Nuevo entreno' };

export default async function NuevoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LibraryItemEditor
      model={{ kind: 'entreno', id: null, title: '', prose: null, blocks: [], tags: [], methodology_group_id: null, format: null, is_draft: false }}
      cola={false}
      nextReviewId={null}
    />
  );
}
