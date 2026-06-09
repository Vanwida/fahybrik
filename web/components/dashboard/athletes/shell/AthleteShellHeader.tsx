'use client';

// Header sticky de la ficha de atleta (UX redesign §2b): identidad + chips
// (nivel, modalidad, pareja Dobles, A-event countdown), KPIs inline
// (.metric-num), acciones (Asignar microciclo, invitación) y la nav de
// secciones anclada (Calendario · Cuerpo · Rendimiento) con el zoom segmentado
// del calendario. Cambiar de sección NO navega — estado local de la shell.

import { Link } from '@/i18n/navigation';
import type { AthleteProfileShell } from '@/lib/dashboard/coach/athlete-profile-shell';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { PlanViewMode } from '@/lib/dashboard/coach/athlete-plan';
import { cn } from '@/lib/utils';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { InviteAthleteButton } from '@/components/dashboard/athletes/InviteAthleteButton';
import { MIcon } from '@/components/dashboard/MIcon';

export type AthleteSection = 'calendario' | 'cuerpo' | 'rendimiento';

export const ATHLETE_SECTIONS: ReadonlyArray<{ key: AthleteSection; label: string }> = [
  { key: 'calendario', label: 'Calendario' },
  { key: 'cuerpo', label: 'Cuerpo' },
  { key: 'rendimiento', label: 'Rendimiento' },
];

const ZOOM_OPTIONS: ReadonlyArray<{ key: PlanViewMode; label: string }> = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'macro', label: 'Macro' },
];

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  pro: 'Pro',
  elite: 'Elite',
};

const MODALITY_LABELS: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro Elite',
};

interface AthleteShellHeaderProps {
  profile: AthleteProfileShell;
  resumen: AthleteResumen;
  /** Línea de fase ATR bajo el nombre, p.ej. "Acumulación · Semana 3 de 5". */
  phaseLine: string | null;
  section: AthleteSection;
  onSectionChange: (section: AthleteSection) => void;
  zoom: PlanViewMode;
  onZoomChange: (zoom: PlanViewMode) => void;
  onAssignOpen: () => void;
}

function kpiTone(value: number | null, okFrom: number, warnFrom: number): string {
  if (value == null) return 'text-[color:var(--text-muted)]';
  if (value >= okFrom) return 'text-[color:var(--status-success)]';
  if (value >= warnFrom) return 'text-[color:var(--status-warning)]';
  return 'text-[color:var(--danger)]';
}

function weeksUntil(days: number): string {
  const weeks = Math.max(0, Math.ceil(days / 7));
  return weeks === 1 ? '1 sem' : `${weeks} sem`;
}

export function AthleteShellHeader({
  profile,
  resumen,
  phaseLine,
  section,
  onSectionChange,
  zoom,
  onZoomChange,
  onAssignOpen,
}: AthleteShellHeaderProps) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const checkinLabel =
    resumen.last_checkin_at === todayIso ? 'Check-in hoy' : 'Check-in';
  const levelLabel = profile.program_level
    ? (LEVEL_LABELS[profile.program_level] ?? profile.program_level)
    : null;

  return (
    <header className="sticky top-14 z-20 -mx-4 -mt-4 border-b border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] px-4 pt-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-4">
      <nav aria-label="Ruta" className="mb-2 flex items-center gap-1.5 text-xs">
        <Link
          href="/atletas"
          className="focus-ring rounded-[var(--r-s)] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
        >
          Atletas
        </Link>
        <MIcon name="chevron_right" size={14} className="text-[color:var(--text-muted)]" aria-hidden />
        <span aria-current="page" className="font-semibold text-[color:var(--fg)]">
          {profile.full_name}
        </span>
      </nav>

      {profile.intake_pending ? (
        <Link
          href={`/atletas/${profile.athlete_id}/intake`}
          className="banner-review mb-3 transition-opacity hover:opacity-90"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <MIcon name="how_to_reg" size={18} filled className="shrink-0 text-[color:var(--accent)]" />
            <span className="truncate text-[13px] font-semibold text-[color:var(--fg)]">
              Intake pendiente{' '}
              <span className="font-medium text-[color:var(--text-muted)]">
                · terminó el onboarding — revísalo para asignar el plan
              </span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.04em] text-[color:var(--accent)]">
            Revisar intake →
          </span>
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <AthleteAvatar name={profile.full_name} size="md" />

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-headline-md uppercase leading-none text-[color:var(--fg)]">
              {profile.full_name}
            </h1>
            {levelLabel ? <Chip accent>{levelLabel}</Chip> : null}
            {profile.modality ? <Chip>{MODALITY_LABELS[profile.modality]}</Chip> : null}
            {profile.modality === 'dobles' && profile.partner ? (
              <Link
                href={`/atletas/${profile.partner.athlete_id}`}
                className="focus-ring inline-flex h-5 items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--fg)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border-subtle))]"
                aria-label={`Pareja de Dobles: ${profile.partner.full_name} — abrir su ficha`}
              >
                <MIcon name="group" size={12} className="text-[color:var(--accent)]" aria-hidden />
                {profile.partner.full_name}
              </Link>
            ) : null}
            {profile.a_event ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--fg)]">
                <MIcon name="flag" size={12} className="text-[color:var(--accent)]" aria-hidden />
                {profile.a_event.name} ·{' '}
                <span className="metric-num">{weeksUntil(profile.a_event.days_until)}</span>
              </span>
            ) : null}
          </div>
          {phaseLine ? <p className="micro-label">{phaseLine}</p> : null}
        </div>

        <div
          role="group"
          aria-label="Indicadores del atleta"
          className="ml-auto hidden items-center gap-5 md:flex"
        >
          <Kpi
            label="Readiness"
            value={resumen.readiness_score != null ? String(resumen.readiness_score) : '—'}
            unit={resumen.readiness_score != null ? '%' : undefined}
            tone={kpiTone(resumen.readiness_score, 70, 45)}
          />
          <KpiDivider />
          <Kpi
            label={checkinLabel}
            value={
              resumen.checkin_sub_score != null ? resumen.checkin_sub_score.toFixed(1) : '—'
            }
            unit={resumen.checkin_sub_score != null ? '/10' : undefined}
            tone={kpiTone(resumen.checkin_sub_score, 7, 5)}
          />
          <KpiDivider />
          <Kpi
            label="Cumplimiento sem"
            value={resumen.compliance_pct_7d != null ? String(resumen.compliance_pct_7d) : '—'}
            unit={resumen.compliance_pct_7d != null ? '%' : undefined}
            tone={kpiTone(resumen.compliance_pct_7d, 80, 50)}
          />
        </div>

        <div className="flex items-center gap-2">
          <InviteAthleteButton athleteId={profile.athlete_id} athleteName={profile.full_name} />
          <button
            type="button"
            onClick={onAssignOpen}
            aria-haspopup="dialog"
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 text-[13px] font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
          >
            <MIcon name="event_repeat" size={17} aria-hidden />
            Asignar microciclo
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <nav aria-label="Secciones de la ficha" className="flex">
          {ATHLETE_SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSectionChange(key)}
              aria-current={section === key ? 'true' : undefined}
              className={cn(
                'focus-ring -mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors',
                section === key
                  ? 'border-[color:var(--accent)] text-[color:var(--fg)]'
                  : 'border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {section === 'calendario' ? (
          <div
            role="group"
            aria-label="Nivel de zoom del calendario"
            className="mb-1.5 inline-flex items-center gap-0.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-[3px]"
          >
            {ZOOM_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onZoomChange(key)}
                aria-pressed={zoom === key}
                className={cn(
                  'focus-ring h-[26px] rounded-[var(--r-s)] px-3.5 text-xs font-semibold transition-colors',
                  zoom === key
                    ? 'bg-[color:var(--surface-container-highest)] text-[color:var(--fg)] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[var(--r-pill)] border px-2 text-[10px] font-bold uppercase tracking-[0.08em]',
        accent
          ? 'border-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] text-[color:var(--accent)]'
          : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
      )}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  tone: string;
}) {
  return (
    <p className="flex flex-col gap-0.5">
      <span className={cn('metric-num text-xl font-semibold leading-none', tone)}>
        {value}
        {unit ? (
          <span className="ml-0.5 text-xs font-medium text-[color:var(--text-muted)]">{unit}</span>
        ) : null}
      </span>
      <span className="micro-label">{label}</span>
    </p>
  );
}

function KpiDivider() {
  return <span aria-hidden className="h-7 w-px bg-[color:var(--border-subtle)]" />;
}
