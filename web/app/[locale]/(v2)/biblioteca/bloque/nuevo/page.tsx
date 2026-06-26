// v2 · BIBLIOTECA · NUEVO BLOQUE — the from-scratch library block editor.
// Same client editor as the edit route, seeded with an empty (unsaved) model.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import type { BlockEditorModel } from '@/lib/dashboard/v2/editor-types';
import { BlockLibraryEditor } from '@/components/v2/editor/BlockLibraryEditor';

export const dynamic = 'force-dynamic';

export default async function V2NuevoBloquePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const methodologyGroups = await listMethodologyGroups();
  const groups = methodologyGroups.map((g) => ({ id: g.id, name: g.name_es }));

  const model: BlockEditorModel = {
    block_id: null,
    title: 'Nuevo bloque',
    description: '',
    methodology_group_id: groups[0]?.id ?? 1,
    format: null,
    blocks: [],
  };

  return <BlockLibraryEditor model={model} groups={groups} />;
}
