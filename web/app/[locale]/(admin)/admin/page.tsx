import { setRequestLocale } from 'next-intl/server';
import { getAdminSession } from '@/lib/auth/admin-session';
import { listCoachRequests } from '@/lib/dashboard/admin/coaches';
import { buildBusinessMetrics } from '@/lib/dashboard/coach/business-metrics';
import { CoachRequests } from '@/components/dashboard/admin/CoachRequests';
import { BusinessMetrics } from '@/components/dashboard/metrics/BusinessMetrics';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Defence in depth: the layout already gates, but re-checking here means a
  // page render without an admin session is impossible even if the tree changes.
  const session = await getAdminSession();
  if (!session) return null;

  const [rawCoaches, metrics] = await Promise.all([
    listCoachRequests(),
    buildBusinessMetrics({}),
  ]);

  // The client component (and the /api/admin/coaches JSON reload path) work in
  // ISO strings, so normalise the Date columns here for a single shape.
  const coaches = rawCoaches.map((c) => ({
    email: c.email,
    status: c.status,
    created_at: c.created_at.toISOString(),
    reviewed_at: c.reviewed_at ? c.reviewed_at.toISOString() : null,
    has_signed_in: c.has_signed_in,
  }));

  return (
    <div className="flex flex-col gap-12">
      {/* Negocio / dinero — moved here from the coach panel: the owner sees the
          money for the whole platform. */}
      <section className="flex flex-col gap-8">
        <header className="flex flex-col gap-1 border-b border-[color:var(--border-subtle)] pb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Negocio / Suscripciones
          </p>
          <h1 className="font-display-xl text-[color:var(--fg)]">Métricas</h1>
        </header>
        <BusinessMetrics metrics={metrics} />
      </section>

      {/* Coaches — approve/reject requests, add coaches directly. */}
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 border-b border-[color:var(--border-subtle)] pb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
            Equipo
          </p>
          <h2 className="font-display-xl text-[color:var(--fg)]">Coaches</h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Aprueba o rechaza solicitudes y da de alta coaches. Los aprobados
            entran al panel con su email por enlace mágico.
          </p>
        </header>
        <CoachRequests initial_coaches={coaches} />
      </section>
    </div>
  );
}
