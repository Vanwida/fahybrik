// v2 · BIBLIOTECA · EDITOR DE SESIÓN — "Modelar un entreno, sin texto libre".
// Server component: carga la sesión de biblioteca real (loadSessionEditorModel)
// y le pasa el modelo estructurado al cliente <SessionEditor>. Si no existe, 404.
//
// `[id]` es un `templates.id` — una plantilla MADRE. Antes esta ruta recibía un
// `blocks.id` (editaba un bloque llamándolo sesión); los bloques viven ahora en
// /biblioteca/bloque/[id].
//
// SessionEditor sin prop `save` YA hace el comportamiento de biblioteca
// (POST/PUT /api/coach/templates + volver a /biblioteca?tab=sesiones): estaba
// construido y nunca se había cableado a esta pantalla.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadSessionEditorModel } from '@/lib/dashboard/v2/editor-data';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';

export const dynamic = 'force-dynamic';

export default async function V2SesionEditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const templateId = Number(id);
  if (!Number.isInteger(templateId) || templateId <= 0) notFound();

  const model = await loadSessionEditorModel({
    coach_id: session.coach_id,
    template_id: templateId,
  }).catch(() => null);
  if (!model) notFound();

  return <SessionEditor model={model} />;
}
