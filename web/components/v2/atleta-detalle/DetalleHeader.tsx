'use client';

// DetalleHeader — the athlete detail header band: 58px avatar + display name +
// status/level/tenure/phase sub-line, a 4-tile stat cluster (VO₂ · FC reposo ·
// adherencia · VFC), and the right-aligned "Mensaje" / "Ver plan" actions. Pure
// presentational; data comes from the loaded detalle payload. Responsive: the
// stat cluster wraps under the identity on narrow viewports.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { StatusDot } from '@/components/v2/StatusDot';
import { StatTile } from '@/components/v2/StatTile';
import { cn } from '@/lib/utils';
import type { DetalleHeader as HeaderData, DetalleStat } from '@/lib/dashboard/v2/atleta-detalle-types';

function HeaderAction({
  href,
  icon,
  label,
  primary,
}: {
  href: string;
  icon: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-[13px] font-semibold transition-colors',
        primary
          ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
          : 'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
      )}
    >
      <MIcon name={icon} size={17} />
      {label}
    </Link>
  );
}

export function DetalleHeader({
  header,
  stats,
}: {
  header: HeaderData;
  stats: DetalleStat[];
}) {
  const sub = [
    header.level != null ? `Nivel ${header.level}` : null,
    header.status_label,
    header.tenure_label,
    header.phase_label,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      {/* Identity */}
      <div className="flex min-w-0 items-center gap-4">
        <span className="relative shrink-0">
          <AthleteAvatar name={header.full_name} size="lg" className="h-[58px] w-[58px] text-base" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="v2-display truncate text-2xl text-[color:var(--v2-fg)] sm:text-3xl">
              {header.full_name}
            </h1>
            <LevelBadge level={header.level} />
            {header.modality_label ? (
              <span className="v2-micro hidden sm:inline">{header.modality_label}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--v2-muted)]">
            <StatusDot status={header.status} />
            {sub.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 ? <span className="text-[color:var(--v2-faint)]">·</span> : null}
                <span className={i === 0 ? 'font-semibold text-[color:var(--v2-fg)]' : undefined}>
                  {s}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cluster + actions */}
      <div className="flex flex-col items-stretch gap-4 lg:items-end">
        <div className="flex items-end gap-6 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-5 py-3 shadow-[var(--v2-shadow-card)]">
          {stats.map((s) => (
            <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} className="gap-0.5" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <HeaderAction href="/v2/mensajes" icon="forum" label="Mensaje" />
          {header.status === 'alta' ? (
            // Intake pending (loader sets status 'alta' / 'Alta · revisar intake')
            // → the primary action is the intake review, which provisions the plan.
            <HeaderAction
              href={`/v2/atletas/${header.athlete_id}/intake`}
              icon="how_to_reg"
              label="Revisar intake"
              primary
            />
          ) : (
            <HeaderAction
              href={`/v2/atletas/${header.athlete_id}?tab=plan`}
              icon="calendar_month"
              label="Ver plan"
              primary
            />
          )}
        </div>
      </div>
    </div>
  );
}
