import { Link } from '@/i18n/navigation';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { disciplineLabel } from '@/lib/dashboard/athletes/discipline-label';
import {
  alertChipVariant,
  readinessTone,
  resolveStatusPill,
} from '@/lib/dashboard/athletes/status-pills';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { cn } from '@/lib/utils';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { RaceCountdownBadge } from '@/components/dashboard/athletes/RaceCountdownBadge';

interface AthleteCardProps {
  athlete: AthleteRow;
  /** Index within the list — drives the staggered reveal cadence on load. */
  index?: number;
}

const READINESS_COLOR = {
  success: 'text-[color:var(--status-success)]',
  warning: 'text-[color:var(--status-warning)]',
  muted: 'text-[color:var(--text-muted)]',
} as const;

const ALERT_CHIP = {
  critical: 'bg-[color:color-mix(in_srgb,var(--error)_12%,transparent)] text-[color:var(--error)] border-[color:color-mix(in_srgb,var(--error)_35%,transparent)]',
  warning: 'bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color:var(--status-warning)] border-[color:color-mix(in_srgb,var(--status-warning)_25%,transparent)]',
  info: 'bg-[color:color-mix(in_srgb,var(--tertiary)_10%,transparent)] text-[color:var(--tertiary)] border-[color:color-mix(in_srgb,var(--tertiary)_25%,transparent)]',
} as const;

export function AthleteCard({ athlete, index = 0 }: AthleteCardProps) {
  const pill = resolveStatusPill(athlete);
  const readinessClass = READINESS_COLOR[readinessTone(athlete.readiness_score)];
  const compliance = athlete.compliance_pct ?? 0;
  const dimmed = pill.kind === 'descanso';
  const phaseLabel = athlete.block_type ? atrPhaseLabel(athlete.block_type) : null;

  return (
    <Link
      href={`/atletas/${athlete.athlete_id}`}
      style={{ '--stagger-i': index } as React.CSSProperties}
      className={cn(
        'stagger-in card-elevated group relative flex flex-col gap-4 overflow-hidden p-5',
        'hover:border-[color:var(--primary-container)]',
        pill.kind === 'revision' && 'hover:border-[color:var(--primary-container)]',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full blur-[40px]',
          'bg-[color:color-mix(in_srgb,var(--primary-container)_10%,transparent)]',
          'transition-all group-hover:bg-[color:color-mix(in_srgb,var(--primary-container)_20%,transparent)]',
        )}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AthleteAvatar
            name={athlete.full_name}
            size="md"
            className={cn(dimmed && 'opacity-60 grayscale')}
          />
          <div className="min-w-0">
            <h3 className="truncate font-display text-xl font-black italic leading-tight text-[color:var(--fg)]">
              {athlete.full_name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="truncate micro-label normal-case tracking-[0.06em]">
                {disciplineLabel(athlete.primary_discipline)}
              </p>
              {athlete.intake_pending ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5',
                    'text-[9px] font-bold uppercase tracking-wider',
                    'border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]',
                    'bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]',
                  )}
                  title="Terminó el onboarding — revisa su intake para asignar el plan"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                  Intake pendiente
                </span>
              ) : null}
              {phaseLabel ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5',
                    'micro-label',
                    'border-[color:color-mix(in_srgb,var(--accent)_28%,var(--border-subtle))]',
                    'bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[color:var(--accent)]',
                  )}
                  title={`Bloque ATR actual: ${phaseLabel}`}
                >
                  {phaseLabel}
                </span>
              ) : null}
              {athlete.is_comp ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5',
                    'text-[9px] font-bold uppercase tracking-wider',
                    'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-high)] text-[color:var(--text-muted)]',
                  )}
                  title="Acceso de cortesía (sin cobro)"
                >
                  Cortesía
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md border border-[color:var(--border-subtle)]',
            'bg-[color:var(--surface-container-high)] px-2 py-1',
            dimmed && 'opacity-60',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              pill.dotClass,
              pill.pulse && 'animate-pulse',
            )}
          />
          <span className="micro-label text-[color:var(--fg)]">
            {pill.label}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'relative z-10 grid grid-cols-2 gap-4 border-t border-[color:var(--border-subtle)] pt-3',
          dimmed && 'opacity-70',
        )}
      >
        <div>
          <div className="flex items-baseline gap-1">
            <span className={cn('metric-num text-[1.75rem] font-semibold leading-none', readinessClass)}>
              {athlete.readiness_score != null ? athlete.readiness_score : '—'}
            </span>
            {athlete.readiness_score != null ? (
              <span className={cn('metric-num text-sm', readinessClass)}>%</span>
            ) : null}
          </div>
          <p className="mt-1.5 flex items-center gap-1 micro-label">
            <BatteryIcon />
            Readiness
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="metric-num text-[1.75rem] font-semibold leading-none text-[color:var(--fg)]">
              {athlete.compliance_pct != null ? athlete.compliance_pct : '—'}
            </span>
            {athlete.compliance_pct != null ? (
              <span className="metric-num text-sm text-[color:var(--text-muted)]">%</span>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
            <div
              className="h-full rounded-full bg-[color:var(--status-success)]"
              style={{ width: `${Math.min(100, compliance)}%` }}
            />
          </div>
          <p className="mt-1.5 flex items-center gap-1 micro-label">
            <TrendIcon />
            Cumplimiento
          </p>
        </div>
      </div>

      {athlete.target_race ? (
        <div className="relative z-10 pt-1">
          <RaceCountdownBadge race={athlete.target_race} />
        </div>
      ) : null}

      {athlete.alert_label ? (
        <div className="relative z-10 mt-auto pt-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
              'text-[10px] font-bold uppercase tracking-wider',
              ALERT_CHIP[alertChipVariant(athlete.alert_severity)],
            )}
          >
            <InfoIcon />
            {athlete.alert_label}
          </span>
        </div>
      ) : null}
    </Link>
  );
}

function BatteryIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm2-8H7c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V6c0-.55-.45-1-1-1zm1 11H6V6h10v10z" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="m16 6 2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
    </svg>
  );
}
