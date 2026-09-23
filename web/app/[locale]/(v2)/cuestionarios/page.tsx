// /cuestionarios — oculto hasta que algo lea `coach_onboarding_forms`
// (DECISIONS 2026-09-23 «Cuestionarios de entrada: oculto hasta que algo lo
// lea»). El backend sigue intacto; la pantalla vuelve cuando haya un lector.

import { redirect } from 'next/navigation';

export default async function CuestionariosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/ajustes/perfil`);
}
