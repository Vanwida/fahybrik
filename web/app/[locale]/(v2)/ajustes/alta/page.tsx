// /ajustes/alta — el cuestionario de entrada está oculto hasta que algo lo lea
// (DECISIONS 2026-09-23). Mientras, a «Tu perfil».

import { redirect } from 'next/navigation';

export default async function AjustesAltaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/ajustes/perfil`);
}
