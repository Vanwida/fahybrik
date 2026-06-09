// Read-only "respuestas del atleta" panel for the coach intake-review screen.
// Pure presentation: receives the full `IntakeProfile` as a prop and renders
// EVERY answer the athlete gave, grouped into titled instrument-style cards.
// No data fetching, no mutation, no decision/assign controls (other agents own
// those). Honest empty states everywhere — never invents a value the athlete
// left blank.

import type { IntakeProfile } from '@/lib/coach/intake';

// =============================================================================
// Human-readable label maps for the structured enums (single source here).
// =============================================================================

const GOAL_TYPE_LABELS: Record<string, string> = {
  first_hyrox: 'Primera HYROX',
  improve_hyrox_mark: 'Mejorar marca HYROX',
  improve_running: 'Mejorar carrera',
  complete_fun: 'Completar / disfrutar',
  other: 'Otro',
};

const RUN_EXPERIENCE_LABELS: Record<string, string> = {
  enthusiast: 'Le encanta correr',
  comfortable: 'Cómodo corriendo',
  reluctant: 'Corre a regañadientes',
  none: 'Sin experiencia',
};

const STRENGTH_EXPERIENCE_LABELS: Record<string, string> = {
  loves_lifting: 'Le encanta la fuerza',
  weekly_ish: 'Entrena fuerza semanal',
  with_guidance: 'Fuerza con guía',
  none: 'Sin experiencia',
};

// Step 5 availability values (program | other_activity | rest).
const AVAILABILITY_LABELS: Record<string, string> = {
  program: 'Programa',
  other_activity: 'Otra',
  rest: 'Libre',
};

// Step 6 preferred day-type slugs.
const PREFERRED_TYPE_LABELS: Record<string, string> = {
  isolated_run: 'Carrera',
  strength_gym: 'Fuerza',
  hyrox_transitions: 'HYROX',
  ergo_conditioning: 'Ergo',
  specific_material: 'Material',
};

// Step 7 owned-equipment slugs.
const EQUIPMENT_LABELS: Record<string, string> = {
  barbells_plates: 'Barras y discos',
  dumbbells: 'Mancuernas',
  sleds: 'Trineos',
  bags_kb: 'Sacos / kettlebells',
  open_space: 'Espacio abierto',
  pulleys: 'Poleas',
  treadmill: 'Cinta',
  stationary_bike: 'Bici estática',
  rower: 'Remo',
  skierg: 'SkiErg',
  other: 'Otro',
};

// Specialized exercise-equipment tags the athlete may lack (Step 7 derived).
const MISSING_TAG_LABELS: Record<string, string> = {
  ski_erg: 'SkiErg',
  rower: 'Remo',
  sled: 'Trineo',
  assault_bike: 'Assault bike',
  bike_erg: 'BikeErg',
};

const SEVERITY_LABELS: Record<string, string> = {
  mild: 'Leve',
  moderate: 'Moderada',
  severe: 'Severa',
};

// Step 7 facility kind.
const FACILITY_TYPE_LABELS: Record<string, string> = {
  commercial_gym: 'Gimnasio comercial',
  crossfit_box: 'Box de CrossFit',
  multiple: 'Varias instalaciones',
  other: 'Otra',
};

// Step 9 viability self-report.
const ACHIEVABLE_LABELS: Record<string, string> = {
  yes: 'Sí',
  no: 'No',
  unknown: 'No lo sabe',
};

// Step 12 race periodization role.
const RACE_PRIORITY_LABELS: Record<string, string> = {
  target: 'Objetivo',
  secondary: 'Secundaria',
  tune_up: 'Tune-up',
};

// Step 12 race event type.
const RACE_EVENT_TYPE_LABELS: Record<string, string> = {
  hyrox: 'HYROX',
  deka: 'DEKA',
  other: 'Otra',
};

// Weekday display order + short labels (Mon→Sun, matching availability keys).
const WEEKDAYS: ReadonlyArray<{ key: string; short: string }> = [
  { key: 'mon', short: 'L' },
  { key: 'tue', short: 'M' },
  { key: 'wed', short: 'X' },
  { key: 'thu', short: 'J' },
  { key: 'fri', short: 'V' },
  { key: 'sat', short: 'S' },
  { key: 'sun', short: 'D' },
];

// Low sleep / high stress thresholds — mirror lib/coach/intake.ts so the visual
// flag and the server-side warning agree.
const LOW_SLEEP_THRESHOLD = 4;
const HIGH_STRESS_THRESHOLD = 7;

const EMPTY = '—';

function labelOr(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return EMPTY;
  return map[key] ?? key;
}

// Seconds → H:MM:SS / M:SS for race goal/finish times. Mirrors the server's
// formatHms so goal and result render identically.
function formatSeconds(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null) return EMPTY;
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Tri-state boolean → "Sí" / "No" / "—" (honest empty for null/undeclared).
function yesNo(v: boolean | null | undefined): string {
  if (v == null) return EMPTY;
  return v ? 'Sí' : 'No';
}

// =============================================================================
// Section primitives
// =============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-elevated p-5">
      <h3 className="micro-label mb-4 border-b border-[color:var(--border-subtle)] pb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="micro-label">{label}</span>
      <span className="text-sm text-[color:var(--fg)]">{children}</span>
    </div>
  );
}

function EmptyHint({ children = 'Sin datos' }: { children?: React.ReactNode }) {
  return <span className="text-sm text-[color:var(--text-muted)]">{children}</span>;
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warning';
}) {
  const styles =
    tone === 'accent'
      ? 'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]'
      : tone === 'warning'
        ? 'border-[color:color-mix(in_srgb,var(--warning)_40%,var(--border-subtle))] text-[color:var(--warning)] bg-[color:color-mix(in_srgb,var(--warning)_8%,transparent)]'
        : 'border-[color:var(--border-subtle)] text-[color:var(--fg)] bg-[color:var(--surface-container-low)]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

// 1-10 self-report readout. Mono tabular number + a track bar. `flagLow` /
// `flagHigh` paint the warning tone when the value crosses a calibration
// threshold (low sleep / high stress).
function ScaleReadout({
  label,
  value,
  flag,
}: {
  label: string;
  value: number | null;
  flag?: boolean;
}) {
  const isFlagged = flag === true && value != null;
  const barColor = isFlagged ? 'var(--warning)' : 'var(--accent)';
  const numColor = isFlagged ? 'var(--warning)' : 'var(--fg)';
  return (
    <div className="flex flex-col gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-3">
      <span className="micro-label">{label}</span>
      {value == null ? (
        <EmptyHint />
      ) : (
        <>
          <span className="metric-num text-2xl font-semibold leading-none" style={{ color: numColor }}>
            {value}
            <span className="text-sm text-[color:var(--text-muted)]">/10</span>
          </span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${value * 10}%`, background: barColor }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// IntakeAnswers
// =============================================================================

export function IntakeAnswers({ profile }: { profile: IntakeProfile }) {
  const { athlete, intake_structured: s, benchmarks, race_history, devices, target_event } = profile;

  // Benchmarks grouped for a readable table.
  const benchGroups: Array<{ key: string; title: string }> = [
    { key: 'one_rm', title: 'Fuerza (1RM)' },
    { key: 'endurance', title: 'Resistencia' },
    { key: 'hyrox_station', title: 'Estaciones HYROX' },
    { key: 'anaerobic_threshold', title: 'Umbral anaeróbico' },
    { key: 'other', title: 'Otros' },
  ];

  const hasEquipmentGap =
    s.equipment_incompatible_count > 0 || s.missing_equipment_tags.length > 0;

  return (
    <div className="flex flex-col gap-[var(--gutter)]">
      {/* 1 — OBJETIVOS ----------------------------------------------------- */}
      <Section title="Objetivos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tipo de objetivo">
            {s.goal_type ? labelOr(GOAL_TYPE_LABELS, s.goal_type) : <EmptyHint />}
          </Field>
          <Field label="Alcanzable en 2-4 meses">
            {athlete.achievable_2_4_months ? (
              <Chip
                tone={athlete.achievable_2_4_months === 'no' ? 'warning' : 'neutral'}
              >
                {labelOr(ACHIEVABLE_LABELS, athlete.achievable_2_4_months)}
              </Chip>
            ) : (
              <EmptyHint />
            )}
          </Field>
        </div>

        {/* Narrativa corto / medio / largo plazo. */}
        <div className="mt-4 flex flex-col gap-3">
          <Field label="Objetivo a corto plazo">
            {athlete.goal_short ? athlete.goal_short : <EmptyHint />}
          </Field>
          <Field label="Objetivo a medio plazo">
            {athlete.goal_mid ? athlete.goal_mid : <EmptyHint />}
          </Field>
          <Field label="Objetivo a largo plazo">
            {athlete.goal_long ? athlete.goal_long : <EmptyHint />}
          </Field>
          <Field label="Mayor obstáculo">
            {athlete.biggest_obstacle ? athlete.biggest_obstacle : <EmptyHint />}
          </Field>
          <Field label="% depende de mí">
            {athlete.pct_depends_on_me != null ? (
              <span className="metric-num">
                {athlete.pct_depends_on_me}
                <span className="text-sm text-[color:var(--text-muted)]">/10 depende de mí</span>
              </span>
            ) : (
              <EmptyHint />
            )}
          </Field>
          <Field label="Qué espera del coach">
            {athlete.coach_role ? athlete.coach_role : <EmptyHint />}
          </Field>
        </div>
      </Section>

      {/* 2 — READINESS ----------------------------------------------------- */}
      <Section title="Estado basal (autoreporte)">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScaleReadout
            label="Sueño"
            value={s.sleep_quality}
            flag={s.sleep_quality != null && s.sleep_quality <= LOW_SLEEP_THRESHOLD}
          />
          <ScaleReadout
            label="Estrés"
            value={s.stress_level}
            flag={s.stress_level != null && s.stress_level >= HIGH_STRESS_THRESHOLD}
          />
          <ScaleReadout label="Compromiso" value={s.commitment_level} />
        </div>
      </Section>

      {/* 3 — EXPERIENCIA --------------------------------------------------- */}
      <Section title="Experiencia">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Carrera">
            {s.run_experience ? labelOr(RUN_EXPERIENCE_LABELS, s.run_experience) : <EmptyHint />}
          </Field>
          <Field label="Fuerza">
            {s.strength_experience ? (
              labelOr(STRENGTH_EXPERIENCE_LABELS, s.strength_experience)
            ) : (
              <EmptyHint />
            )}
          </Field>
          <Field label="Disciplina principal">
            {athlete.primary_discipline ?? <EmptyHint />}
          </Field>
          <Field label="Años de entrenamiento">
            {athlete.training_experience_years != null ? (
              <span className="metric-num">{athlete.training_experience_years}</span>
            ) : (
              <EmptyHint />
            )}
          </Field>
        </div>
      </Section>

      {/* 4 — LESIONES ------------------------------------------------------ */}
      <Section title="Lesiones">
        {athlete.injuries.length === 0 ? (
          <EmptyHint>Sin lesiones reportadas</EmptyHint>
        ) : (
          <ul className="flex flex-col gap-2">
            {athlete.injuries.map((inj, i) => (
              <li
                key={`${inj.area}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-3 py-2"
              >
                <span className="text-sm font-medium text-[color:var(--fg)]">{inj.area}</span>
                {inj.type ? <Chip>{inj.type}</Chip> : null}
                {inj.severity ? (
                  <Chip>{labelOr(SEVERITY_LABELS, inj.severity)}</Chip>
                ) : null}
                {inj.active ? (
                  <Chip tone="warning">Activa</Chip>
                ) : (
                  <span className="micro-label">Resuelta</span>
                )}
                {inj.notes ? (
                  <span className="w-full text-xs text-[color:var(--text-muted)]">{inj.notes}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Derived movement contraindications — surfaced prominently. */}
        {s.injury_contraindications.length > 0 ? (
          <div className="mt-4 rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--warning)_40%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--warning)_6%,var(--surface-card))] p-3">
            <p className="micro-label mb-2 text-[color:var(--warning)]">Evitar</p>
            <ul className="flex flex-col gap-1.5">
              {s.injury_contraindications.map((c, i) => (
                <li key={`${c.area}-${i}`} className="text-sm text-[color:var(--fg)]">
                  <span className="font-medium">{c.area}</span>
                  <span className="text-[color:var(--text-muted)]"> → {c.flag}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {/* 5 — DISPONIBILIDAD ----------------------------------------------- */}
      <Section title="Disponibilidad semanal">
        {Object.keys(s.availability).length === 0 ? (
          <EmptyHint>El atleta no marcó disponibilidad</EmptyHint>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map(({ key, short }) => {
              const value = s.availability[key];
              const tone =
                value === 'program'
                  ? 'var(--accent)'
                  : value === 'other_activity'
                    ? 'var(--fg)'
                    : 'var(--text-muted)';
              return (
                <div
                  key={key}
                  className="flex flex-col items-center gap-1.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-2"
                >
                  <span className="micro-label">{short}</span>
                  <span
                    className="text-center text-[0.625rem] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: tone }}
                  >
                    {value ? AVAILABILITY_LABELS[value] : '·'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {s.program_days.length > 0 ? (
          <p className="mt-3 text-xs text-[color:var(--text-muted)]">
            <span className="metric-num">{s.program_days.length}</span> días de programa por semana
          </p>
        ) : null}

        {/* Ventana / sesión / flexibilidad. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ventana disponible">
            {s.available_from && s.available_to ? (
              <span className="metric-num">
                {s.available_from}–{s.available_to}
              </span>
            ) : (
              <EmptyHint />
            )}
          </Field>
          <Field label="Minutos por sesión">
            {s.session_minutes != null ? (
              <span className="metric-num">
                {s.session_minutes}
                <span className="text-sm text-[color:var(--text-muted)]"> min</span>
              </span>
            ) : (
              <EmptyHint />
            )}
          </Field>
          <Field label="Horario flexible">{yesNo(s.schedule_flexible)}</Field>
        </div>
      </Section>

      {/* 6 — SEMANA IDEAL -------------------------------------------------- */}
      <Section title="Semana ideal">
        {Object.keys(s.preferred_week).length === 0 ? (
          <EmptyHint>El atleta no marcó preferencias por día</EmptyHint>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map(({ key, short }) => {
              const types = s.preferred_week[key] ?? [];
              return (
                <div
                  key={key}
                  className="flex flex-col items-center gap-1.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-2"
                >
                  <span className="micro-label">{short}</span>
                  {types.length === 0 ? (
                    <span className="text-[color:var(--text-muted)]">·</span>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      {types.map((t) => (
                        <span
                          key={t}
                          className="rounded-[var(--r-s)] bg-[color:var(--surface-container-high)] px-1.5 py-0.5 text-[0.625rem] font-medium text-[color:var(--fg)]"
                        >
                          {labelOr(PREFERRED_TYPE_LABELS, t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 7 — INSTALACIÓN & EQUIPO ----------------------------------------- */}
      <Section title="Instalación y equipo">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Tipo de instalación">
            {s.facility_type ? (
              <>
                {labelOr(FACILITY_TYPE_LABELS, s.facility_type)}
                {s.facility_type === 'other' && s.facility_other_text ? (
                  <span className="text-[color:var(--text-muted)]"> · {s.facility_other_text}</span>
                ) : null}
              </>
            ) : (
              <EmptyHint />
            )}
          </Field>
          <Field label="Pista de atletismo">{yesNo(s.has_track)}</Field>
          <Field label="Recta / terreno llano">{yesNo(s.has_flat_run)}</Field>
        </div>

        <Field label="Equipo disponible">
          {s.owned_equipment.length === 0 ? (
            <EmptyHint>No declaró equipo</EmptyHint>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {s.owned_equipment.map((slug) => (
                <Chip key={slug}>{labelOr(EQUIPMENT_LABELS, slug)}</Chip>
              ))}
            </div>
          )}
        </Field>

        {hasEquipmentGap ? (
          <div className="mt-4 rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_6%,var(--surface-card))] p-3">
            <p className="micro-label mb-2 text-[color:var(--accent)]">Material que no tiene</p>
            {s.equipment_incompatible_count > 0 ? (
              <p className="mb-2 text-sm text-[color:var(--fg)]">
                <span className="metric-num">{s.equipment_incompatible_count}</span> ejercicios del
                catálogo necesitan máquina que el atleta no tiene — sustituir segmentos.
              </p>
            ) : null}
            {s.missing_equipment_tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {s.missing_equipment_tags.map((tag) => (
                  <Chip key={tag} tone="accent">
                    {labelOr(MISSING_TAG_LABELS, tag)}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      {/* 8 — BENCHMARKS ---------------------------------------------------- */}
      <Section title="Benchmarks">
        {benchmarks.length === 0 ? (
          <EmptyHint>Sin benchmarks registrados</EmptyHint>
        ) : (
          <div className="flex flex-col gap-4">
            {benchGroups.map((g) => {
              const rows = benchmarks.filter((b) => b.group === g.key);
              if (rows.length === 0) return null;
              return (
                <div key={g.key}>
                  <p className="micro-label mb-2">{g.title}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map((b) => (
                        <tr
                          key={b.exercise_slug}
                          className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                        >
                          <td className="py-2 pr-3 text-[color:var(--fg)]">{b.label}</td>
                          <td className="py-2 text-right">
                            <span className="metric-num font-semibold text-[color:var(--fg)]">
                              {b.value}
                            </span>{' '}
                            <span className="text-xs text-[color:var(--text-muted)]">{b.unit}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 9 — CARRERAS ------------------------------------------------------ */}
      <Section title="Carreras">
        {/* target_event (A-event) is the curated public event the athlete aimed
            at; race_history rows are the athlete's own race entries (0046 races
            table) with their periodization role + goal time. */}
        {target_event ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-3 py-2">
            <Chip tone="accent">A-event</Chip>
            <span className="text-sm font-medium text-[color:var(--fg)]">{target_event.name}</span>
            <span className="metric-num text-xs text-[color:var(--text-muted)]">
              {target_event.iso_date}
            </span>
            {target_event.division ? <Chip>{target_event.division}</Chip> : null}
            <span className="micro-label ml-auto">
              {target_event.is_in_past ? (
                <span className="text-[color:var(--danger)]">Pasado</span>
              ) : (
                <>
                  <span className="metric-num">{target_event.days_to_event}</span> días
                </>
              )}
            </span>
          </div>
        ) : null}

        {race_history.length === 0 ? (
          <EmptyHint>
            {target_event ? 'Sin más carreras en el historial' : 'Sin carreras registradas'}
          </EmptyHint>
        ) : (
          <ul className="flex flex-col gap-2">
            {race_history.map((r, i) => (
              <li
                key={`${r.name}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-3 py-2"
              >
                {r.priority ? (
                  <Chip tone={r.priority === 'target' ? 'accent' : 'neutral'}>
                    {labelOr(RACE_PRIORITY_LABELS, r.priority)}
                  </Chip>
                ) : null}
                <span className="text-sm font-medium text-[color:var(--fg)]">{r.name}</span>
                <span className="metric-num text-xs text-[color:var(--text-muted)]">
                  {r.iso_date}
                </span>
                {r.event_type ? <Chip>{labelOr(RACE_EVENT_TYPE_LABELS, r.event_type)}</Chip> : null}
                {r.division ? <Chip>{r.division}</Chip> : null}
                <span className="ml-auto flex items-center gap-3 text-xs">
                  {r.goal_time_seconds != null ? (
                    <span className="text-[color:var(--text-muted)]">
                      Meta{' '}
                      <span className="metric-num text-[color:var(--fg)]">
                        {formatSeconds(r.goal_time_seconds)}
                      </span>
                    </span>
                  ) : null}
                  {r.finish_time ? (
                    <span className="metric-num text-sm text-[color:var(--fg)]">{r.finish_time}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Dispositivos conectados (contexto de datos). */}
      <Section title="Dispositivos">
        {devices.length === 0 ? (
          <EmptyHint>Sin dispositivos conectados</EmptyHint>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {devices.map((d, i) => (
              <Chip key={`${d.type}-${i}`}>{d.display_name ?? d.type}</Chip>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
