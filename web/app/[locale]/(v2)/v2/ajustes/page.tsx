// v2 · AJUSTES — coach settings. Server component: reuses the same coach session
// the v1 /ajustes page reads (getCoachSession → full_name + email). Minimal but
// real: account identity + a link out to Metodología/Periodización (the doc
// corpus that feeds the IA). Re-skinned to v2 brand tokens, light + dark.

import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { MIcon } from '@/components/dashboard/MIcon';
import { Card } from '@/components/v2/Card';
import { EmptyState } from '@/components/v2/EmptyState';
import { SettingRow } from '@/components/v2/ajustes/SettingRow';

export const dynamic = 'force-dynamic';

// Canonical v2 route for the periodization editor (Niveles + Fases).
const METODOLOGIA_HREF = '/v2/periodizacion';

export default async function V2AjustesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();

  // Auth gate already runs in the v2 layout; this guards against a torn session
  // (loader returned null) so we degrade to an empty state instead of a crash.
  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col">
        <Header />
        <div className="mt-6">
          <EmptyState
            icon="settings"
            title="Sesión no disponible"
            description="No hemos podido cargar tu cuenta. Vuelve a iniciar sesión para ver tus ajustes."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <Header />

      <div className="mt-6 flex flex-col gap-4">
        {/* ── Cuenta ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="v2-micro mb-2">Cuenta</h2>
          <Card className="px-4 py-1 sm:px-5">
            <SettingRow label="Coach" value={session.full_name} icon="person" />
            <div className="h-px bg-[color:var(--v2-border)]" />
            <SettingRow label="Email" value={session.email} icon="mail" />
          </Card>
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
                  Define las fases y principios que alimentan a Pablo IA.
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
