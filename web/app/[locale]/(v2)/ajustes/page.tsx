// v2 · AJUSTES — coach settings. Server component: loads the coach session (auth)
// + the editable profile, then renders the editable profile form and a link out
// to Metodología/Periodización (the doc corpus that feeds the IA). v2 brand
// tokens, light + dark.

import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getCoachProfile } from '@/lib/coach/profile';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/v2/EmptyState';
import { screenNoticeActionClass } from '@/components/v2/ScreenState';
import { CoachProfileForm } from '@/components/v2/ajustes/CoachProfileForm';
import { LogoutButton } from '@/components/v2/ajustes/LogoutButton';
import { PushCard } from '@/components/v2/push/PushNotifications';

export const dynamic = 'force-dynamic';

// Canonical v2 route for the periodization editor (Niveles + Fases).
const METODOLOGIA_HREF = '/periodizacion';

export default async function V2AjustesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  const profile = session ? await getCoachProfile(session.coach_id) : null;

  // Auth gate already runs in the v2 layout; this guards against a torn session
  // (loader returned null) so we degrade to an empty state instead of a crash.
  if (!session || !profile) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <Header />
        <div className="mt-6">
          {/* La salida es obligatoria: el texto ya pedía volver a entrar, pero no
              había por dónde. NextLink y no el Link de i18n, porque /sign-in vive
              fuera del árbol [locale] (es ruta de Clerk) y no lleva prefijo. */}
          <EmptyState
            icon="settings"
            title="Sesión no disponible"
            description="No hemos podido cargar tu cuenta. Vuelve a iniciar sesión para ver tus ajustes."
            action={
              <NextLink href="/sign-in" className={screenNoticeActionClass}>
                Iniciar sesión
              </NextLink>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <Header />

      <div className="mt-6 flex flex-col gap-4">
        {/* ── Perfil ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="v2-micro mb-2">Perfil</h2>
          <CoachProfileForm initial={profile} />
        </section>

        {/* ── Metodología ────────────────────────────────────────────────── */}
        <section>
          <h2 className="v2-micro mb-2">Metodología</h2>
          <Card interactive className="overflow-hidden">
            <Link
              href={METODOLOGIA_HREF}
              className="v2-focus group flex items-center gap-4 p-4 sm:p-5"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]"
              >
                <MIcon name="psychology" size={20} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                  Periodización y fases
                </span>
                <span className="text-xs text-[color:var(--v2-muted)]">
                  Define las fases y principios que alimentan a Coach IA.
                </span>
              </div>
              <MIcon
                name="chevron_right"
                size={20}
                className="ml-auto shrink-0 text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-fg)]"
                aria-hidden
              />
            </Link>
          </Card>
        </section>

        {/* ── Avisos (Web Push de este dispositivo) ──────────────────────── */}
        <PushCard />

        {/* ── Cuenta ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="v2-micro mb-2">Cuenta</h2>
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-1 border-b border-[color:var(--v2-border)] pb-4">
      <p className="v2-micro">Cuenta</p>
      <h1 className="v2-display text-3xl sm:text-4xl text-[color:var(--v2-fg)]">Ajustes</h1>
    </header>
  );
}
