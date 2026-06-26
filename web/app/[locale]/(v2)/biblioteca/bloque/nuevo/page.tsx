// v2 · BIBLIOTECA · NUEVO BLOQUE — the from-scratch library block editor.
// Same client editor as the edit route, seeded with an empty (unsaved) model.
// Optional ?level=&days= prefill the level/days tags (used by the matrix view's
// empty-cell click).

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import { listCoachLevels } from '@/lib/dashboard/coach/blocks';
import type { BlockEditorModel } from '@/lib/dashboard/v2/editor-types';
import { BlockLibraryEditor } from '@/components/v2/editor/BlockLibraryEditor';

export const dynamic = 'force-dynamic';

function parseIntParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function V2NuevoBloquePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ level?: string; days?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const sp = await searchParams;
  const level = parseIntParam(sp.level);
  const days = parseIntParam(sp.days);

  const [methodologyGroups, levels] = await Promise.all([
    listMethodologyGroups(),
    listCoachLevels(session.coach_id),
  ]);

  const groups = methodologyGroups.map((g) => ({ id: g.id, name: g.name_es }));
  const levelOptions = levels.map((l) => ({ id: l.id, label: l.label }));

  const model: BlockEditorModel = {
    block_id: null,
    title: 'Nuevo bloque',
    description: '',
    methodology_group_id: groups[0]?.id ?? 1,
    format: null,
    min_level_id: level,
    max_level_id: null,
    days_per_week: days,
    blocks: [],
  };

  return <BlockLibraryEditor model={model} groups={groups} levels={levelOptions} />;
}
