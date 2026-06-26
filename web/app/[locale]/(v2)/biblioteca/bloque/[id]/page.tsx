// v2 · BIBLIOTECA · EDITOR DE BLOQUE — "Modelar un bloque, sin texto libre".
// Server component: loads the real library block (loadBlockEditorModel) and hands
// the structured model to the client <BlockLibraryEditor>. A missing block 404s.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import { listCoachLevels } from '@/lib/dashboard/coach/blocks';
import { loadBlockEditorModel } from '@/lib/dashboard/v2/editor-data';
import { BlockLibraryEditor } from '@/components/v2/editor/BlockLibraryEditor';

export const dynamic = 'force-dynamic';

export default async function V2BloqueEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const blockId = Number(id);
  if (!Number.isInteger(blockId) || blockId <= 0) notFound();

  const model = await loadBlockEditorModel({
    coach_id: session.coach_id,
    block_id: blockId,
  }).catch(() => null);
  if (!model) notFound();

  const [methodologyGroups, levels] = await Promise.all([
    listMethodologyGroups(),
    listCoachLevels(session.coach_id),
  ]);

  const groups = methodologyGroups.map((g) => ({ id: g.id, name: g.name_es }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: l.label }));

  return <BlockLibraryEditor model={model} groups={groups} levels={levelOptions} />;
}
