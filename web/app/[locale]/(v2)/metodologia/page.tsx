// v2 · CÓMO TRABAJO — el coach rellena cómo trabaja (texto + PDF suyo).
// Vacío = plan/chat no lo imitan. No es zonas, tests ni papers.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getHowIWork } from '@/lib/coach/how-i-work';
import { HowIWorkForm } from '@/components/v2/metodologia/HowIWorkForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Cómo trabajo' };

export default async function MetodologiaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const initial = await getHowIWork(session.coach_id);

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col">
      <header className="flex flex-col gap-1 border-b border-[color:var(--v2-border)] pb-4">
        <p className="v2-micro">Método</p>
        <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">
          Cómo trabajo
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--v2-muted)]">
          Qué priorizas, cómo programas, qué no haces y cómo hablas al atleta. Texto
          tuyo y, si quieres, tu PDF de método.
        </p>
      </header>

      <div className="mt-6">
        <HowIWorkForm initial={initial} />
      </div>
    </div>
  );
}
