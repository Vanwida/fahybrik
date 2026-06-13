import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { loadCoachInbox } from '@/lib/dashboard/coach/inbox';
import { loadTeamPulse } from '@/lib/dashboard/coach/team-pulse';
import { InboxQueue } from '@/components/dashboard/hoy/InboxQueue';
import { TeamPulseRail } from '@/components/dashboard/hoy/TeamPulseRail';

export const dynamic = 'force-dynamic';

// HOY — inbox único + pulso del equipo (UX redesign §1). Pablo despacha su
// mañana en UNA pantalla: todo lo que necesita decisión suya vive aquí.
// Datos: lib/dashboard/coach/inbox (misma agregación que GET /api/coach/inbox)
// + lib/dashboard/coach/team-pulse para la columna derecha.

const HEADER_DATE = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function headerDateLabel(now: Date): string {
  // "lunes, 9 jun 2026" → "Lunes · 9 jun 2026"
  const raw = HEADER_DATE.format(now).replace(/\./g, '').replace(', ', ' · ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export default async function HoyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const [inbox, athletes] = await Promise.all([
    loadCoachInbox({ coach_id: session.coach_id }),
    fetchAthletesForCoach({ coach_id: session.coach_id }),
  ]);
  const pulse = await loadTeamPulse({ coach_id: session.coach_id, athletes });

  const decisionCount = inbox.counts.critical + inbox.counts.decisions;
  const summaryParts: string[] = [];
  if (inbox.counts.alerts > 0) summaryParts.push(plural(inbox.counts.alerts, 'alerta', 'alertas'));
  if (inbox.counts.messages > 0) {
    summaryParts.push(plural(inbox.counts.messages, 'mensaje', 'mensajes'));
  }

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-8">
      <header className="stagger-in" style={{ '--stagger-i': 0 } as React.CSSProperties}>
        <span className="micro-label mb-2 block">{headerDateLabel(new Date())}</span>
        <h1 className="font-display text-[40px] font-black uppercase italic leading-none tracking-tight text-[color:var(--fg)] md:text-[56px]">
          Hoy<span className="text-[color:var(--accent)]">.</span>
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-[color:var(--text-muted)]">
          <strong className="font-semibold text-[color:var(--fg)]">
            {decisionCount === 0
              ? 'Sin decisiones pendientes'
              : `${plural(decisionCount, 'decisión pendiente', 'decisiones pendientes')}`}
          </strong>
          {summaryParts.map((part) => (
            <span key={part} className="flex items-center gap-2">
              <span aria-hidden className="text-[color:var(--surface-variant)]">
                ·
              </span>
              {part}
            </span>
          ))}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="stagger-in min-w-0" style={{ '--stagger-i': 1 } as React.CSSProperties}>
          <InboxQueue items={inbox.items} />
        </div>
        <div className="stagger-in min-w-0" style={{ '--stagger-i': 2 } as React.CSSProperties}>
          <TeamPulseRail pulse={pulse} />
        </div>
      </div>
    </div>
  );
}
