import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadIntakeProfile, IntakeError, type IntakeProfile } from '@/lib/coach/intake';
import { IntakeDecision } from '@/components/dashboard/intake/IntakeDecision';
import { IntakeAnswers } from '@/components/dashboard/intake/IntakeAnswers';
import { MIcon } from '@/components/dashboard/MIcon';

export const dynamic = 'force-dynamic';

// Coach intake-review page. The deep link `notifyCoach('intake_pending')` lands
// here (see app/api/onboarding/submit/route.ts). Since the calendar-first
// redesign, the athlete shell header lives in /atletas/[id] — this page is
// standalone: it renders its own breadcrumb back to the ficha, the
// intake-specific header (countdown + time waiting), then the editable
// proposal (IntakeDecision, prominent) over the read-only answers
// (IntakeAnswers, the evidence).

export default async function AthleteIntakePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId)) notFound();

  const loaded = await loadIntakeProfileSafe(session.coach_id, athleteId);

  if (loaded.kind === 'not_found') notFound();

  if (loaded.kind === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <IntakeBreadcrumb athleteId={id} athleteName={null} />
        <IntakeErrorState message={loaded.message} />
      </div>
    );
  }

  const { profile } = loaded;

  // Already reviewed → nothing pending. Honest empty state instead of a stale form.
  if (profile.athlete.intake_completed_at) {
    return (
      <div className="flex flex-col gap-4">
        <IntakeBreadcrumb athleteId={id} athleteName={profile.athlete.full_name} />
        <IntakeAlreadyDone profile={profile} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <IntakeBreadcrumb athleteId={id} athleteName={profile.athlete.full_name} />
        <IntakeHeader profile={profile} />
      </div>
      <IntakeDecision profile={profile} athleteId={id} />
      <section className="flex flex-col gap-4">
        <h2 className="font-heading flex items-center gap-2 text-[color:var(--fg)]">
          <MIcon name="assignment_ind" size={18} className="text-[color:var(--muted)]" />
          Respuestas del atleta
        </h2>
        <IntakeAnswers profile={profile} />
      </section>
    </div>
  );
}

// Breadcrumb propio (la shell de atleta ya no envuelve esta página).
function IntakeBreadcrumb({
  athleteId,
  athleteName,
}: {
  athleteId: string;
  athleteName: string | null;
}) {
  return (
    <nav aria-label="Ruta" className="flex items-center gap-1.5 text-xs">
      <Link
        href="/atletas"
        className="focus-ring rounded-[var(--r-s)] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
      >
        Atletas
      </Link>
      <MIcon name="chevron_right" size={14} className="text-[color:var(--text-muted)]" aria-hidden />
      <Link
        href={`/atletas/${athleteId}`}
        className="focus-ring rounded-[var(--r-s)] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
      >
        {athleteName ?? 'Ficha'}
      </Link>
      <MIcon name="chevron_right" size={14} className="text-[color:var(--text-muted)]" aria-hidden />
      <span aria-current="page" className="font-semibold text-[color:var(--fg)]">
        Intake
      </span>
    </nav>
  );
}

type LoadResult =
  | { kind: 'ok'; profile: IntakeProfile }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

async function loadIntakeProfileSafe(coach_id: bigint, athlete_id: number): Promise<LoadResult> {
  try {
    const profile = await loadIntakeProfile({ coach_id, athlete_id });
    return { kind: 'ok', profile };
  } catch (err) {
    if (err instanceof IntakeError) {
      if (err.status === 404) return { kind: 'not_found' };
      return { kind: 'error', message: err.message };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header — athlete name (echoed for context), age, A-event countdown, waiting.
// ─────────────────────────────────────────────────────────────────────────────

function IntakeHeader({ profile }: { profile: IntakeProfile }) {
  const { athlete, target_event } = profile;
  const waiting = waitingLabel(athlete.onboarded_at);

  return (
    <header className="flex flex-col gap-4 rounded-[var(--r-l)] border border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_7%,var(--surface-card))] p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent)]">
          <MIcon name="how_to_reg" size={14} filled />
          Intake pendiente de revisión
        </p>
        <h1 className="font-headline-md text-[color:var(--fg)]">{athlete.full_name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--muted)]">
          {athlete.age != null ? <span>{athlete.age} años</span> : null}
          {athlete.primary_discipline ? (
            <>
              <Dot />
              <span>{athlete.primary_discipline}</span>
            </>
          ) : null}
          {waiting ? (
            <>
              <Dot />
              <span className="inline-flex items-center gap-1">
                <MIcon name="hourglass_top" size={13} />
                Esperando {waiting}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {target_event ? (
        <div className="flex items-center gap-3 rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-3">
          <MIcon name="flag" size={20} filled className="text-[color:var(--accent)]" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent)]">
              Carrera objetivo
            </span>
            <span className="text-sm font-semibold text-[color:var(--fg)]">{target_event.name}</span>
            <span className="metric-num text-xs text-[color:var(--muted)]">
              {countdownLabel(target_event.days_to_event, target_event.is_in_past)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-4 py-3 text-xs text-[color:var(--muted)]">
          <MIcon name="event_busy" size={16} />
          Sin carrera objetivo
        </div>
      )}
    </header>
  );
}

function Dot() {
  return (
    <span aria-hidden className="opacity-40">
      ·
    </span>
  );
}

// onboarded_at → "3 h" / "2 días" / "ahora". Returns null when unknown.
function waitingLabel(onboarded_at: string | null): string | null {
  if (!onboarded_at) return null;
  const t = new Date(onboarded_at).getTime();
  if (!Number.isFinite(t)) return null;
  const diffMs = Math.max(0, Date.now() - t);
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return 'menos de 1 h';
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} día${d === 1 ? '' : 's'}`;
}

function countdownLabel(daysToEvent: number, isInPast: boolean): string {
  if (isInPast) return 'fecha pasada';
  if (daysToEvent <= 0) return 'hoy';
  return `faltan ${daysToEvent} día${daysToEvent === 1 ? '' : 's'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / error states.
// ─────────────────────────────────────────────────────────────────────────────

function IntakeAlreadyDone({ profile }: { profile: IntakeProfile }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-10 text-center">
      <MIcon name="task_alt" size={32} className="text-[color:var(--accent)]" filled />
      <h1 className="font-heading text-[color:var(--fg)]">Intake ya revisado</h1>
      <p className="max-w-md text-sm text-[color:var(--muted)]">
        El intake de {profile.athlete.full_name} ya fue procesado y su plan inicial está asignado.
      </p>
    </div>
  );
}

function IntakeErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--r-l)] border border-[color:color-mix(in_srgb,#ef4444_30%,var(--border-subtle))] bg-[color:var(--surface-card)] p-10 text-center">
      <MIcon name="error" size={32} className="text-red-400" filled />
      <h1 className="font-heading text-[color:var(--fg)]">No se pudo cargar el intake</h1>
      <p className="max-w-md text-sm text-[color:var(--muted)]">{message}</p>
    </div>
  );
}
