// AthleteAnswers — the READ-ONLY "Respuestas del atleta" right column of the
// athlete-intake review screen (mock: /public/intake-redesign.html, right rail).
// Pure presentational: the coach reads what the athlete declared at onboarding so
// every assignment decision on the left is anchored to evidence. No data fetching,
// no mutations, no state — it renders whatever `IntakeProfile` it is handed.

import type { ReactNode } from 'react';
import type { IntakeProfile } from '@/lib/coach/intake';
import { MIcon } from '@/components/ui/MIcon';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';

// =============================================================================
// Enum → Spanish display labels (display concern — kept local to the view).
// =============================================================================

const GOAL_TYPE_LABELS: Record<
  NonNullable<IntakeProfile['intake_structured']['goal_type']>,
  string
> = {
  first_hyrox: 'Primer HYROX',
  improve_hyrox_mark: 'Mejorar marca HYROX',
  improve_running: 'Mejorar carrera',
  complete_fun: 'Completar y disfrutar',
  other: 'Otro',
};

const RUN_EXPERIENCE_LABELS: Record<
  NonNullable<IntakeProfile['intake_structured']['run_experience']>,
  string
> = {
  enthusiast: 'Entusiasta',
  comfortable: 'Cómodo',
  reluctant: 'A regañadientes',
  none: 'Sin experiencia',
};

const STRENGTH_EXPERIENCE_LABELS: Record<
  NonNullable<IntakeProfile['intake_structured']['strength_experience']>,
  string
> = {
  loves_lifting: 'Le encanta',
  weekly_ish: 'Semanal',
  with_guidance: 'Con guía',
  none: 'Sin experiencia',
};

const FACILITY_LABELS: Record<
  NonNullable<IntakeProfile['intake_structured']['facility_type']>,
  string
> = {
  commercial_gym: 'Gimnasio comercial',
  crossfit_box: 'Box CrossFit',
  multiple: 'Varios',
  other: 'Otro',
};

const SEVERITY_LABELS: Record<'mild' | 'moderate' | 'severe', string> = {
  mild: 'leve',
  moderate: 'moderada',
  severe: 'severa',
};

// Week strip: mon→sun with single-letter Spanish weekday labels (L M X J V S D).
const WEEK_DAYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'mon', label: 'L' },
  { key: 'tue', label: 'M' },
  { key: 'wed', label: 'X' },
  { key: 'thu', label: 'J' },
  { key: 'fri', label: 'V' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'D' },
];

const AVAIL_TITLES: Record<'program' | 'other_activity' | 'rest', string> = {
  program: 'Programado',
  other_activity: 'Otra actividad',
  rest: 'Descanso',
};

// Self-reported stress at/above this (1-10) reads as a caution signal — mirrors
// the server-side HIGH_STRESS_THRESHOLD that flags load calibration at intake.
const HIGH_STRESS_THRESHOLD = 7;

// =============================================================================
// Small presentational helpers
// =============================================================================

/** Slug → human-readable label ("sled_push" → "Sled Push"). */
function humanizeSlug(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function pluralES(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/** Intersperse a faint "·" separator between inline segments. */
function joinDots(parts: ReactNode[]): ReactNode[] {
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={`sep-${i}`} aria-hidden className="text-[color:var(--v2-faint)]">
            ·
          </span>,
          part,
        ],
  );
}

/** A rail panel: section heading (left) + the section icon (right) via Panel's
 *  action slot, then the card body — the recurring unit of this column. */
function RailPanel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <Panel
      title={title}
      action={<MIcon name={icon} size={16} className="text-[color:var(--v2-muted)]" />}
    >
      {children}
    </Panel>
  );
}

/** A single "N/10" stat (Estado basal). Caution-tinted when flagged. */
function Stat({
  label,
  value,
  caution = false,
}: {
  label: string;
  value: number | null;
  caution?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      {value != null ? (
        <span
          className={cn(
            'v2-num text-2xl font-semibold leading-none',
            caution ? 'text-[color:var(--v2-warn)]' : 'text-[color:var(--v2-fg)]',
          )}
        >
          {value}
          <span className="text-xs font-medium text-[color:var(--v2-muted)]">/10</span>
        </span>
      ) : (
        <span className="v2-num text-2xl font-semibold leading-none text-[color:var(--v2-faint)]">
          —
        </span>
      )}
      <span className="v2-micro mt-1.5">{label}</span>
    </div>
  );
}

/** A "Clave · valor" line (Experiencia). */
function KeyLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 text-body">
      <span className="text-[color:var(--v2-muted)]">{k}</span>
      <span aria-hidden className="text-[color:var(--v2-faint)]">
        ·
      </span>
      <span className="text-[color:var(--v2-fg)]">{v}</span>
    </div>
  );
}

/** A goal-horizon term: micro key ("Corto") + the athlete's narrative. */
function GoalTerm({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="v2-micro min-w-[44px] shrink-0 pt-px">{term}</span>
      <span className="text-[color:var(--v2-fg)]">{value}</span>
    </div>
  );
}

/** A single weekday cell tinted by its availability value. */
function AvailCell({
  label,
  value,
}: {
  label: string;
  value?: 'program' | 'other_activity' | 'rest';
}) {
  const isProgram = value === 'program';
  const isOther = value === 'other_activity';
  return (
    <span
      title={AVAIL_TITLES[value ?? 'rest']}
      className={cn(
        'flex h-[26px] w-[26px] items-center justify-center rounded-[var(--v2-r-s)] border text-eyebrow font-bold',
        isProgram &&
          'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]',
        isOther &&
          'border-[color:var(--v2-border)] bg-[color:var(--v2-info-soft)] text-[color:var(--v2-info)]',
        !isProgram &&
          !isOther &&
          'border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]',
      )}
    >
      {label}
    </span>
  );
}

/** A muted single line used when a panel has nothing to show. */
function MutedLine({ children }: { children: ReactNode }) {
  return <p className="text-body text-[color:var(--v2-muted)]">{children}</p>;
}

// =============================================================================
// Component
// =============================================================================

export function AthleteAnswers({ profile }: { profile: IntakeProfile }) {
  const { athlete, benchmarks, devices } = profile;
  const s = profile.intake_structured;

  const goalTypeLabel = s.goal_type != null ? GOAL_TYPE_LABELS[s.goal_type] : '—';
  const achievable = athlete.achievable_2_4_months;
  const hasGoalTerms = Boolean(athlete.goal_short || athlete.goal_mid || athlete.goal_long);

  const runLabel = s.run_experience != null ? RUN_EXPERIENCE_LABELS[s.run_experience] : '—';
  const strengthLabel =
    s.strength_experience != null ? STRENGTH_EXPERIENCE_LABELS[s.strength_experience] : '—';
  const expYears = athlete.training_experience_years;

  const contraindications = s.injury_contraindications;
  const hasInjuryData = athlete.injuries.length > 0 || contraindications.length > 0;

  const trainingDays = athlete.training_days_per_week ?? (s.program_days.length || null);
  const window =
    s.available_from && s.available_to ? `${s.available_from}–${s.available_to}` : null;

  const availParts: ReactNode[] = [];
  if (trainingDays != null) {
    availParts.push(
      <span key="days" className="flex items-baseline gap-1">
        <span className="v2-num text-lg font-semibold text-[color:var(--v2-fg)]">
          {trainingDays}
        </span>
        <span className="text-xs text-[color:var(--v2-muted)]">días/sem</span>
      </span>,
    );
  }
  if (window) {
    availParts.push(
      <span key="window" className="v2-num text-body text-[color:var(--v2-fg)]">
        {window}
      </span>,
    );
  }
  if (s.session_minutes != null) {
    availParts.push(
      <span key="mins" className="text-xs text-[color:var(--v2-muted)]">
        <span className="v2-num">{s.session_minutes}</span> min/sesión
      </span>,
    );
  }

  const facilityLabel =
    s.facility_type == null
      ? '—'
      : s.facility_type === 'other'
        ? s.facility_other_text || FACILITY_LABELS.other
        : FACILITY_LABELS[s.facility_type];

  return (
    <div className="flex flex-col gap-4">
      {/* 1 · OBJETIVOS */}
      <RailPanel title="Objetivos" icon="target">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[color:var(--v2-fg)]">
          <span>{goalTypeLabel}</span>
          {achievable === 'yes' ? (
            <Pill tone="ok">
              <MIcon name="trending_up" size={13} />
              Alcanzable 2-4 meses
            </Pill>
          ) : achievable === 'no' ? (
            <Pill tone="warn">
              <MIcon name="trending_down" size={13} />
              Difícil en 2-4 meses
            </Pill>
          ) : null}
        </div>
        {hasGoalTerms ? (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {athlete.goal_short ? <GoalTerm term="Corto" value={athlete.goal_short} /> : null}
            {athlete.goal_mid ? <GoalTerm term="Medio" value={athlete.goal_mid} /> : null}
            {athlete.goal_long ? <GoalTerm term="Largo" value={athlete.goal_long} /> : null}
          </div>
        ) : null}
      </RailPanel>

      {/* 2 · ESTADO BASAL */}
      <RailPanel title="Estado basal" icon="monitor_heart">
        <div className="flex items-start justify-between gap-2">
          <Stat label="Sueño" value={s.sleep_quality} />
          <Stat
            label="Estrés"
            value={s.stress_level}
            caution={s.stress_level != null && s.stress_level >= HIGH_STRESS_THRESHOLD}
          />
          <Stat label="Compromiso" value={s.commitment_level} />
        </div>
      </RailPanel>

      {/* 3 · EXPERIENCIA */}
      <RailPanel title="Experiencia" icon="fitness_center">
        <div className="flex flex-col gap-1.5">
          <KeyLine k="Carrera" v={runLabel} />
          <KeyLine k="Fuerza" v={strengthLabel} />
          <KeyLine
            k="Experiencia"
            v={
              expYears != null
                ? `${expYears} ${pluralES(expYears, 'año', 'años')} declarados`
                : 'Sin declarar'
            }
          />
        </div>
      </RailPanel>

      {/* 4 · LESIONES */}
      <RailPanel title="Lesiones" icon="healing">
        {!hasInjuryData ? (
          <MutedLine>Sin lesiones declaradas</MutedLine>
        ) : (
          <div className="flex flex-col gap-2.5">
            {athlete.injuries.map((inj, i) => (
              <div
                key={`${inj.area}-${i}`}
                className="flex flex-wrap items-center gap-1.5 text-body text-[color:var(--v2-fg)]"
              >
                <span>{inj.area}</span>
                {inj.severity ? (
                  <>
                    <span aria-hidden className="text-[color:var(--v2-faint)]">
                      ·
                    </span>
                    <span className="text-[color:var(--v2-muted)]">
                      {SEVERITY_LABELS[inj.severity]}
                    </span>
                  </>
                ) : null}
                {inj.active ? (
                  <>
                    <span aria-hidden className="text-[color:var(--v2-faint)]">
                      ·
                    </span>
                    <span className="text-[color:var(--v2-muted)]">activa</span>
                  </>
                ) : null}
              </div>
            ))}
            {contraindications.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {contraindications.map((c, i) => (
                  <div
                    key={`${c.area}-${c.flag}-${i}`}
                    className="flex items-center gap-1.5 text-xs text-[color:var(--v2-muted)]"
                  >
                    <MIcon
                      name="do_not_step"
                      size={14}
                      className="shrink-0 text-[color:var(--v2-warn)]"
                    />
                    <span>
                      {c.area} → evita {c.flag}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </RailPanel>

      {/* 5 · DISPONIBILIDAD */}
      <RailPanel title="Disponibilidad" icon="event_available">
        <div className="flex flex-col gap-2.5">
          {availParts.length > 0 ? (
            <div className="flex flex-wrap items-baseline gap-2">{joinDots(availParts)}</div>
          ) : (
            <MutedLine>Sin disponibilidad declarada</MutedLine>
          )}
          <div className="flex gap-1.5" aria-label="Días de la semana programados">
            {WEEK_DAYS.map(({ key, label }) => (
              <AvailCell key={key} label={label} value={s.availability[key]} />
            ))}
          </div>
        </div>
      </RailPanel>

      {/* 6 · BENCHMARKS */}
      <RailPanel title="Benchmarks" icon="leaderboard">
        {benchmarks.length === 0 ? (
          <MutedLine>Sin benchmarks</MutedLine>
        ) : (
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
            {benchmarks.map((b) => (
              <div key={b.exercise_slug} className="flex flex-col gap-0.5">
                <span className="text-label text-[color:var(--v2-muted)]">{b.label}</span>
                <span className="v2-num text-sm font-semibold text-[color:var(--v2-fg)]">
                  {b.value} {b.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </RailPanel>

      {/* 7 · INSTALACIÓN & EQUIPO */}
      <RailPanel title="Instalación & equipo" icon="warehouse">
        <p className="text-body font-semibold text-[color:var(--v2-fg)]">{facilityLabel}</p>
        {s.owned_equipment.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.owned_equipment.map((e) => (
              <Pill key={e} tone="neutral">
                {humanizeSlug(e)}
              </Pill>
            ))}
          </div>
        ) : null}
        {s.equipment_incompatible_count > 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-label text-[color:var(--v2-muted)]">
            <MIcon name="swap_horiz" size={13} className="shrink-0 text-[color:var(--v2-warn)]" />
            <span>
              Sin {s.missing_equipment_tags.map(humanizeSlug).join(', ')} ·{' '}
              {s.equipment_incompatible_count}{' '}
              {pluralES(s.equipment_incompatible_count, 'ejercicio', 'ejercicios')} con sustitución
            </span>
          </p>
        ) : null}
      </RailPanel>

      {/* 8 · DISPOSITIVOS */}
      <RailPanel title="Dispositivos" icon="watch">
        {devices.length === 0 ? (
          <MutedLine>Sin dispositivos</MutedLine>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {devices.map((d, i) => (
              <Pill key={`${d.type}-${i}`} tone="neutral">
                {d.display_name ?? humanizeSlug(d.type)}
              </Pill>
            ))}
          </div>
        )}
      </RailPanel>
    </div>
  );
}
