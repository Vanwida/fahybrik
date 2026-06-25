// v2 · ATLETA · INTAKE — server component. The coach reviews a newly-onboarded
// athlete's onboarding/benchmarks, sees the suggested level + structure, and
// approves → which provisions the athlete (macrocycle + first-block draft + tests
// + welcome). Reuses the SAME backend as V1 (loadIntakeProfile / commitIntake via
// the /api/coach/intake/[id] route). This page owns the loader + not_found /
// error / already-reviewed states + the sticky identity header chrome; the
// client IntakeReviewV2 owns the decision form, gate, payload and POST.
//
// AGNOSTIC: loads the coach's methodology_phases and passes them to the client so
// phase labels/colors resolve via resolvePhase (the intake block_specs carry only
// ATR `type` codes → resolvePhase falls back to the canonical label + role color).

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadIntakeProfile, IntakeError, type IntakeProfile } from '@/lib/coach/intake';
import { loadCoachPhases } from '@/lib/dashboard/coach/phases';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { EmptyState } from '@/components/v2/EmptyState';
import { MIcon } from '@/components/dashboard/MIcon';
import { IntakeReviewV2 } from '@/components/v2/atletas/intake/IntakeReviewV2';

export const dynamic = 'force-dynamic';

export default async function V2AthleteIntakePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) notFound();

  const loaded = await loadIntakeProfileSafe(session.coach_id, athleteId);
  if (loaded.kind === 'not_found') notFound();

  // Coach methodology_phases for agnostic label/color resolution (degrade to []
  // → resolvePhase falls back to the canonical ATR label + role color).
  const coachPhases = await loadCoachPhases(session.coach_id).catch(() => [] as MethodologyPhase[]);

  if (loaded.kind === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
        <Breadcrumb athleteId={id} athleteName={null} />
        <EmptyState
          icon="error"
          title="No se pudo cargar el intake"
          description={loaded.message}
        />
      </div>
    );
  }

  const { profile } = loaded;

  // Already reviewed → nothing pending. Honest empty state instead of a stale form.
  if (profile.athlete.intake_completed_at) {
    return (
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
        <Breadcrumb athleteId={id} athleteName={profile.athlete.full_name} />
        <EmptyState
          icon="task_alt"
          title="Intake ya revisado"
          description={`El intake de ${profile.athlete.full_name} ya fue procesado y su plan inicial está asignado.`}
          action={
            <Link
              href={`/v2/atletas/${id}`}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-[13px] font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="person" size={17} />
              Ver atleta
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      <IntakeHeader profile={profile} athleteId={id} />
      <div className="pt-5">
        <IntakeReviewV2 profile={profile} athleteId={id} coachPhases={coachPhases} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky identity header — bleeds nothing here (the V2 shell already pads); a
// sticky band with breadcrumb + identity tier (avatar + display name + identity
// chips) + a warning-tint waiting chip pushed right.
// ─────────────────────────────────────────────────────────────────────────────

function IntakeHeader({ profile, athleteId }: { profile: IntakeProfile; athleteId: string }) {
  const { athlete } = profile;
  const waiting = waitingLabel(athlete.onboarded_at);
  const sexLabel = athlete.sex ? SEX_LABELS[athlete.sex] : null;

  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--v2-border)] bg-[color:color-mix(in_srgb,var(--v2-bg)_92%,transparent)] pb-4 pt-1 backdrop-blur-md">
      <Breadcrumb athleteId={athleteId} athleteName={athlete.full_name} className="mb-2.5" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <AthleteAvatar name={athlete.full_name} size="lg" />

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="v2-micro flex items-center gap-1.5 text-[color:var(--v2-accent)]">
            <MIcon name="how_to_reg" size={13} filled aria-hidden />
            Intake pendiente de revisión
          </p>
          <h1 className="v2-display text-2xl uppercase leading-none text-[color:var(--v2-fg)] sm:text-3xl">
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
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-warn-soft)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-warn)]">
            <MIcon name="hourglass_top" size={14} aria-hidden />
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
    <span className="inline-flex h-6 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-muted)]">
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
        href="/v2/atletas"
        className="v2-focus rounded-[var(--v2-r-s)] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
      >
        Atletas
      </Link>
      <MIcon name="chevron_right" size={14} className="text-[color:var(--v2-muted)]" aria-hidden />
      <Link
        href={`/v2/atletas/${athleteId}`}
        className="v2-focus rounded-[var(--v2-r-s)] font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
      >
        {athleteName ?? 'Ficha'}
      </Link>
      <MIcon name="chevron_right" size={14} className="text-[color:var(--v2-muted)]" aria-hidden />
      <span aria-current="page" className="font-semibold text-[color:var(--v2-fg)]">
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
