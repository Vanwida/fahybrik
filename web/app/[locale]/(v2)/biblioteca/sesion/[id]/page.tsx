// v2 · SCREEN 5 · EDITOR DE SESIÓN — "Modelar una sesión, sin texto libre".
// Server component: loads the real session template (getTemplateDetail via
// loadSessionEditorModel) and hands the structured model to the client
// <SessionEditor>. A missing/unauthorized template degrades to an EmptyState,
// never 500s.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';
import { EmptyState } from '@/components/v2/EmptyState';

export const dynamic = 'force-dynamic';

export default async function V2SessionEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const templateId = Number(id);
  if (!Number.isFinite(templateId)) {
    return (
      <NotFound description="El identificador de la sesión no es válido." />
    );
  }

  const model = await loadSessionEditorModel({
    coach_id: session.coach_id,
    template_id: templateId,
  }).catch(() => null);

  if (!model) {
    return <NotFound description="Esta sesión no existe o no pertenece a tu biblioteca." />;
  }

  return <SessionEditor model={model} />;
}

function NotFound({ description }: { description: string }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] py-10">
      <EmptyState icon="error" title="Sesión no encontrada" description={description} />
    </div>
  );
}
