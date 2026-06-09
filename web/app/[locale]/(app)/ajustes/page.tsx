import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { MIcon } from '@/components/dashboard/MIcon';

export const dynamic = 'force-dynamic';

// Coach settings. Team management (approving/adding coaches) and business
// metrics moved to the admin surface (/admin, migration 0041) — they belong to
// the platform owner, not the coach. This page keeps coach-scoped settings.
export default async function AjustesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-1 border-b border-[color:var(--border-subtle)] pb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Cuenta
        </p>
        <h1 className="font-display-xl text-[color:var(--fg)]">Ajustes</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Coach
          </span>
          <span className="text-sm text-[color:var(--fg)]">{session.full_name}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Email
          </span>
          <span className="text-sm text-[color:var(--fg)]">{session.email}</span>
        </div>
      </section>

      {/* Metodología — dejó de ser destino top-level (UX redesign §0); su
          gestión documental vive aquí, dentro de Ajustes. */}
      <section className="flex flex-col gap-4 rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-5">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Metodología
          </span>
          <p className="text-sm text-[color:var(--text-muted)]">
            Documentos y principios de entrenamiento que alimentan a Pablo IA.
          </p>
        </div>
        <Link
          href="/metodologia"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-high)]"
        >
          <MIcon name="psychology" size={16} />
          Abrir metodología
        </Link>
      </section>
    </div>
  );
}
