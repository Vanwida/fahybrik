import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { listMonthTemplatesForCoach } from '@/lib/dashboard/coach/program-months';
import { listTemplatesForCoach } from '@/lib/dashboard/coach/templates';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { listMethodologyGroups } from '@/lib/dashboard/coach/methodology-groups';
import { ProgramarHub } from '@/components/dashboard/programar/ProgramarHub';
import type { MicrocycleRow } from '@/components/dashboard/programar/MicrocyclesGrid';
import {
  PROGRAMAR_TABS,
  type ProgramarTab,
  type TemplateRow,
} from '@/components/dashboard/programar/library-items';
import type { Block } from '@fahybrid/shared/schema/blocks';
import type { MethodologyGroup } from '@fahybrid/shared/schema/methodology-groups';

export const dynamic = 'force-dynamic';

// /programar — la biblioteca única del coach (UX redesign §3): Sesiones
// (bloques de Pablo + entrenos propios, fundidos) y Microciclos, con toggle
// segmentado sincronizado a ?tab=. /biblioteca y /programacion redirigen aquí.

function resolveTab(param: string | string[] | undefined): ProgramarTab {
  const raw = Array.isArray(param) ? param[0] : param;
  return PROGRAMAR_TABS.includes(raw as ProgramarTab) ? (raw as ProgramarTab) : 'sesiones';
}

export default async function ProgramarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  let microcycles: MicrocycleRow[] = [];
  let templates: TemplateRow[] = [];
  let blocks: Block[] = [];
  let methodologyGroups: MethodologyGroup[] = [];

  try {
    const rows = await listMonthTemplatesForCoach(session.coach_id);
    microcycles = rows.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      atr_block_hint: row.atr_block_hint,
      focus: row.focus,
      week_count: row.week_count,
      updated_at: row.updated_at,
    }));
  } catch {
    microcycles = [];
  }

  try {
    const rows = await listTemplatesForCoach(session.coach_id);
    templates = rows.map((row) => ({
      id: row.id,
      name: row.name,
      format: row.format,
      target_block: row.target_block,
      target_level: row.target_level,
      is_draft: row.is_draft,
      segment_count: row.segment_count,
      block_count: row.block_count,
      updated_at: row.updated_at,
      methodology_group_id: row.methodology_group_id,
    }));
  } catch {
    templates = [];
  }

  try {
    [blocks, methodologyGroups] = await Promise.all([
      listBlocks(null),
      listMethodologyGroups(),
    ]);
  } catch {
    blocks = [];
    methodologyGroups = [];
  }

  return (
    <ProgramarHub
      initialTab={resolveTab(search?.tab)}
      blocks={blocks}
      templates={templates}
      microcycles={microcycles}
      methodologyGroups={methodologyGroups}
    />
  );
}
