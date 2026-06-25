// v2 · SCREEN 5 · NUEVA SESIÓN — the from-scratch variant of the session editor.
// Same client editor, seeded with an empty (unsaved) model.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import type { SessionEditorModel } from '@/lib/dashboard/v2/editor-types';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';

export const dynamic = 'force-dynamic';

const EMPTY_SESSION: SessionEditorModel = {
  template_id: null,
  name: 'Nueva sesión',
  format: 'strength_block',
  is_draft: true,
  blocks: [],
  used_in_plans: 0,
};

export default async function V2NuevaSesionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  return <SessionEditor model={EMPTY_SESSION} />;
}
