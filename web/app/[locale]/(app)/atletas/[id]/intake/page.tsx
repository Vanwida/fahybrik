import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadIntakeProfile, IntakeError, type IntakeProfile } from '@/lib/coach/intake';
import { IntakeReview } from '@/components/dashboard/intake/IntakeReview';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { MIcon } from '@/components/dashboard/MIcon';

export const dynamic = 'force-dynamic';

// Coach intake-review page. The deep link `notifyCoach('intake_pending')` lands
// here (see app/api/onboarding/submit/route.ts). Layout (redesign, approved
// mock at /public/intake-redesign.html): a sticky identity header that bleeds
// past the gutter, a 2-col body (six numbered decision cards · evidence rail),
// and a sticky gate footer — all rendered by IntakeReview. This server page owns
// the loader + already-done / error / empty states + the static header chrome.

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
      <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-4">
        <Breadcrumb athleteId={id} athleteName={null} />
        <IntakeErrorState message={loaded.message} />
      </div>
    );
  }

  const { profile } = loaded;

  // Already reviewed → nothing pending. Honest empty state instead of a stale form.
  if (profile.athlete.intake_completed_at) {
    return (
      <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-4">
        <Breadcrumb athleteId={id} athleteName={profile.athlete.full_name} />
        <IntakeAlreadyDone profile={profile} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col">
      <IntakeHeader profile={profile} athleteId={id} />
      <div className="pt-5">
        <IntakeReview profile={profile} athleteId={id} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky identity header — bleeds past the gutter (negative -mx, re-padded),
// sticky under the app top bar, backdrop-blur. Breadcrumb + identity tier
// (avatar + name in italic-black display + neutral identity chips) + a
// warning-tint waiting chip pushed right.
// ─────────────────────────────────────────────────────────────────────────────

function IntakeHeader({ profile, athleteId }: { profile: IntakeProfile; athleteId: string }) {
  const { athlete } = profile;
  const waiting = waitingLabel(athlete.onboarded_at);
  const sexLabel = athlete.sex ? SEX_LABELS[athlete.sex] : null;

  return (
    <header className="sticky top-14 z-20 -mx-4 -mt-4 border-b border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 pb-4 pt-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-4">
      <Breadcrumb athleteId={athleteId} athleteName={athlete.full_name} className="mb-2.5" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <AthleteAvatar name={athlete.full_name} size="md" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="micro-label flex items-center gap-1.5 text-[color:var(--accent)]">
            <MIcon name="how_to_reg" size={13} filled aria-hidden />
            Intake pendiente de revisión
          </p>
          <h1 className="font-headline-md uppercase leading-none text-[color:var(--fg)]">
            {athlete.full_name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {athlete.age != null ? <IdentityChip>{athlete.age} años</IdentityChip> : null}
          {sexLabel ? <IdentityChip>{sexLabel}</IdentityChip> : null}
          {athlete.primary_discipline ? (
            <IdentityChip>{athlete.primary_discipline}</IdentityChip>
          ) : null}
        </div>

        {waiting ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--r-s)] bg-[color:var(--warning-tint)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[color:var(--warning)]">
            <MIcon name="hourglass_top" size={14} weight={600} aria-hidden />
            Esperando {waiting}
          </span>
        ) : null}
      </div>
    </header>
  );
}

const SEX_LABELS: Record<'male' | 'female' | 'other', string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
};

function IdentityChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-2.5 text-[11px] font-semibold text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}

function Breadcrumb({
  athleteId,
  athleteName,
  className,
}: {
  athleteId: string;
  athleteName: string | null;
  className?: string;
}) {
  return (
    <nav
      aria-label="Ruta"
      className={`flex items-center gap-1.5 text-xs${className ? ` ${className}` : ''}`}
    >
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

// onboarded_at → "3 h" / "2 días" / "menos de 1 h". Returns null when unknown.
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

// ─────────────────────────────────────────────────────────────────────────────
// Empty / error states.
// ─────────────────────────────────────────────────────────────────────────────

function IntakeAlreadyDone({ profile }: { profile: IntakeProfile }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-10 text-center">
      <MIcon name="task_alt" size={32} className="text-[color:var(--accent)]" filled />
      <h1 className="font-heading text-[color:var(--fg)]">Intake ya revisado</h1>
      <p className="max-w-md text-sm text-[color:var(--text-muted)]">
        El intake de {profile.athlete.full_name} ya fue procesado y su plan inicial está asignado.
      </p>
    </div>
  );
}

function IntakeErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--r-l)] border border-[color:color-mix(in_srgb,var(--danger)_30%,var(--border-subtle))] bg-[color:var(--surface-card)] p-10 text-center">
      <MIcon name="error" size={32} className="text-[color:var(--danger)]" filled />
      <h1 className="font-heading text-[color:var(--fg)]">No se pudo cargar el intake</h1>
      <p className="max-w-md text-sm text-[color:var(--text-muted)]">{message}</p>
    </div>
  );
}
