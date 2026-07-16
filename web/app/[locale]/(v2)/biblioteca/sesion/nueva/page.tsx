// v2 · BIBLIOTECA · NUEVA SESIÓN — el editor de sesión desde cero.
// Mismo cliente que la ruta de edición, sembrado con un modelo vacío (sin guardar).
// Al primer guardado, SessionEditor hace POST /api/coach/templates y adopta el id.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import type { SessionEditorModel } from '@/lib/dashboard/v2/editor-types';
import { SessionEditor } from '@/components/v2/editor/SessionEditor';

export const dynamic = 'force-dynamic';

// `templates.format` es un eje GRUESO y obligatorio (una sesión entera no tiene
// un solo formato: sus bloques sí). SessionEditor no lo expone, así que la
// semilla se queda. Usamos `sets`, el canónico más neutro — los cuatro legacy
// (strength_block/tempo/circuit/test) no los escribe código nuevo por contrato
// del catálogo de formatos.
const NEW_SESSION_FORMAT = 'sets';

export default async function V2NuevaSesionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const model: SessionEditorModel = {
    template_id: null,
    name: 'Nueva sesión',
    format: NEW_SESSION_FORMAT,
    is_draft: true,
    blocks: [],
    used_in_plans: 0,
  };

  return <SessionEditor model={model} />;
}
