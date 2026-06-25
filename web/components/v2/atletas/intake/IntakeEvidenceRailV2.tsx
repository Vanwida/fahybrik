// Read-only evidence rail for the V2 coach intake-review screen. Condensed,
// instrument-style RailCards rendering EVERY datum the onboarding captured —
// Objetivos, Estado basal, Experiencia, Lesiones, Disponibilidad, Semana ideal,
// Instalación & equipo, Benchmarks, Carreras, Dispositivos. Pure presentation:
// receives the full IntakeProfile, never invents a value the athlete left blank
// (honest empty states). Ported faithfully from V1 in V2 tokens.

import type { IntakeProfile } from '@/lib/coach/intake';
import { MIcon } from '@/components/ui/MIcon';
import { RailCard } from './ui/RailCard';
import { Empty, Instrument, Ledger, MetaChip } from './ui/RailPrimitives';
import {
  ACHIEVABLE_LABELS,
  AVAILABILITY_LABELS,
  EQUIPMENT_LABELS,
  FACILITY_TYPE_LABELS,
  GOAL_TYPE_LABELS,
  HIGH_STRESS_THRESHOLD,
  LOW_SLEEP_THRESHOLD,
  MISSING_TAG_LABELS,
  PREFERRED_TYPE_LABELS,
  RACE_EVENT_TYPE_LABELS,
  RACE_PRIORITY_LABELS,
  RUN_EXPERIENCE_LABELS,
  SEVERITY_LABELS,
  STRENGTH_EXPERIENCE_LABELS,
  WEEKDAYS,
  formatSeconds,
  labelOr,
  yesNo,
} from './evidence-labels';

export function IntakeEvidenceRailV2({ profile }: { profile: IntakeProfile }) {
  const { athlete, intake_structured: s, benchmarks, race_history, devices, target_event } = profile;

  const benchGroups: Array<{ key: string; title: string }> = [
    { key: 'one_rm', title: 'Fuerza (1RM)' },
    { key: 'endurance', title: 'Resistencia' },
    { key: 'hyrox_station', title: 'Estaciones HYROX' },
    { key: 'anaerobic_threshold', title: 'Umbral anaeróbico' },
    { key: 'other', title: 'Otros' },
  ];
  const hasEquipmentGap =
    s.equipment_incompatible_count > 0 || s.missing_equipment_tags.length > 0;
  const hasGoalNarrative =
    athlete.goal_short || athlete.goal_mid || athlete.goal_long;

  return (
    <div className="flex flex-col gap-4">
      <span className="v2-micro px-0.5">Respuestas del atleta</span>

      {/* OBJETIVOS */}
      <RailCard title="Objetivos" icon="target">
        <div className="flex flex-col gap-2">
          <Ledger k="Tipo">
            {s.goal_type ? labelOr(GOAL_TYPE_LABELS, s.goal_type) : <Empty />}
          </Ledger>
          <Ledger k="Alcanzable 2-4 m">
            {athlete.achievable_2_4_months ? (
              <span
                style={
                  athlete.achievable_2_4_months === 'no'
                    ? { color: 'var(--v2-warn)' }
                    : undefined
                }
              >
                {labelOr(ACHIEVABLE_LABELS, athlete.achievable_2_4_months)}
              </span>
            ) : (
              <Empty />
            )}
          </Ledger>
          {athlete.pct_depends_on_me != null ? (
            <Ledger k="Depende de mí">
              <span className="v2-num">{athlete.pct_depends_on_me}/10</span>
            </Ledger>
          ) : null}
        </div>
        {hasGoalNarrative ? (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-[color:var(--v2-border)] pt-3">
            {athlete.goal_short ? (
              <p className="text-[12.5px]">
                <span className="text-[color:var(--v2-muted)]">Corto · </span>
                <span className="text-[color:var(--v2-fg)]">{athlete.goal_short}</span>
              </p>
            ) : null}
            {athlete.goal_mid ? (
              <p className="text-[12.5px]">
                <span className="text-[color:var(--v2-muted)]">Medio · </span>
                <span className="text-[color:var(--v2-fg)]">{athlete.goal_mid}</span>
              </p>
            ) : null}
            {athlete.goal_long ? (
              <p className="text-[12.5px]">
                <span className="text-[color:var(--v2-muted)]">Largo · </span>
                <span className="text-[color:var(--v2-fg)]">{athlete.goal_long}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {athlete.biggest_obstacle || athlete.coach_role ? (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-[color:var(--v2-border)] pt-3">
            {athlete.biggest_obstacle ? (
              <p className="text-[12.5px]">
                <span className="text-[color:var(--v2-muted)]">Obstáculo · </span>
                <span className="text-[color:var(--v2-fg)]">{athlete.biggest_obstacle}</span>
              </p>
            ) : null}
            {athlete.coach_role ? (
              <p className="text-[12.5px]">
                <span className="text-[color:var(--v2-muted)]">Espera del coach · </span>
                <span className="text-[color:var(--v2-fg)]">{athlete.coach_role}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </RailCard>

      {/* ESTADO BASAL */}
      <RailCard title="Estado basal" icon="monitor_heart">
        <div className="flex justify-between gap-2">
          <Instrument
            label="Sueño"
            value={s.sleep_quality}
            flag={s.sleep_quality != null && s.sleep_quality <= LOW_SLEEP_THRESHOLD}
          />
          <Instrument
            label="Estrés"
            value={s.stress_level}
            flag={s.stress_level != null && s.stress_level >= HIGH_STRESS_THRESHOLD}
          />
          <Instrument label="Compromiso" value={s.commitment_level} />
        </div>
      </RailCard>

      {/* EXPERIENCIA */}
      <RailCard title="Experiencia" icon="fitness_center">
        <div className="flex flex-col gap-2">
          <Ledger k="Carrera">
            {s.run_experience ? labelOr(RUN_EXPERIENCE_LABELS, s.run_experience) : <Empty />}
          </Ledger>
          <Ledger k="Fuerza">
            {s.strength_experience
              ? labelOr(STRENGTH_EXPERIENCE_LABELS, s.strength_experience)
              : <Empty />}
          </Ledger>
          <Ledger k="Disciplina">{athlete.primary_discipline ?? <Empty />}</Ledger>
          <Ledger k="Experiencia">
            {athlete.training_experience_years != null ? (
              <span className="v2-num">
                {athlete.training_experience_years} año
                {athlete.training_experience_years === 1 ? '' : 's'}
              </span>
            ) : (
              <Empty />
            )}
          </Ledger>
        </div>
      </RailCard>

      {/* LESIONES */}
      <RailCard title="Lesiones" icon="healing">
        {athlete.injuries.length === 0 ? (
          <Empty>Sin lesiones reportadas</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {athlete.injuries.map((inj, i) => (
              <li
                key={`${inj.area}-${i}`}
                className="flex flex-wrap items-center gap-1.5 text-[13px]"
              >
                <span className="font-medium text-[color:var(--v2-fg)]">{inj.area}</span>
                {inj.type ? <MetaChip>{inj.type}</MetaChip> : null}
                {inj.severity ? <MetaChip>{labelOr(SEVERITY_LABELS, inj.severity)}</MetaChip> : null}
                {inj.active ? (
                  <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-warn-soft)] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-warn)]">
                    <MIcon name="do_not_step" size={12} aria-hidden />
                    Activa
                  </span>
                ) : (
                  <span className="v2-micro">Resuelta</span>
                )}
                {inj.notes ? (
                  <span className="basis-full text-[11.5px] text-[color:var(--v2-muted)]">
                    {inj.notes}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {s.injury_contraindications.length > 0 ? (
          <div className="mt-3 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] p-2.5">
            <p className="v2-micro mb-1.5 text-[color:var(--v2-warn)]">Evitar</p>
            <ul className="flex flex-col gap-1">
              {s.injury_contraindications.map((c, i) => (
                <li key={`${c.area}-${i}`} className="text-[12.5px] text-[color:var(--v2-fg)]">
                  <span className="font-medium">{c.area}</span>
                  <span className="text-[color:var(--v2-muted)]"> → {c.flag}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </RailCard>

      {/* DISPONIBILIDAD */}
      <RailCard title="Disponibilidad" icon="event_available">
        {Object.keys(s.availability).length === 0 ? (
          <Empty>El atleta no marcó disponibilidad</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
              {s.program_days.length > 0 ? (
                <span>
                  <span className="v2-num text-lg font-semibold text-[color:var(--v2-fg)]">
                    {s.program_days.length}
                  </span>{' '}
                  <span className="text-[12.5px] text-[color:var(--v2-muted)]">días/sem</span>
                </span>
              ) : null}
              {s.available_from && s.available_to ? (
                <>
                  <span aria-hidden className="text-[color:var(--v2-faint)]">·</span>
                  <span className="v2-num text-[12.5px]">
                    {s.available_from}–{s.available_to}
                  </span>
                </>
              ) : null}
              {s.session_minutes != null ? (
                <>
                  <span aria-hidden className="text-[color:var(--v2-faint)]">·</span>
                  <span className="v2-num text-[12.5px] text-[color:var(--v2-muted)]">
                    {s.session_minutes} min/sesión
                  </span>
                </>
              ) : null}
            </div>
            <div
              className="mt-2 flex gap-1.5"
              aria-label="Días de la semana programados"
            >
              {WEEKDAYS.map(({ key, short }) => {
                const value = s.availability[key];
                const on = value === 'program';
                return (
                  <span
                    key={key}
                    className={
                      on
                        ? 'flex size-[26px] items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[10px] font-bold text-[color:var(--v2-accent)]'
                        : 'flex size-[26px] items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[10px] font-bold text-[color:var(--v2-muted)]'
                    }
                    title={value ? AVAILABILITY_LABELS[value] : undefined}
                  >
                    {short}
                  </span>
                );
              })}
            </div>
            <div className="mt-2">
              <Ledger k="Horario flexible">{yesNo(s.schedule_flexible)}</Ledger>
            </div>
          </>
        )}
      </RailCard>

      {/* SEMANA IDEAL */}
      <RailCard title="Semana ideal" icon="calendar_view_week">
        {Object.keys(s.preferred_week).length === 0 ? (
          <Empty>El atleta no marcó preferencias por día</Empty>
        ) : (
          <div className="flex gap-1.5">
            {WEEKDAYS.map(({ key, short }) => {
              const types = s.preferred_week[key] ?? [];
              return (
                <div key={key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="v2-micro">{short}</span>
                  {types.length === 0 ? (
                    <span className="text-[color:var(--v2-muted)]">·</span>
                  ) : (
                    types.map((t) => (
                      <span
                        key={t}
                        className="rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] px-1 py-0.5 text-[9.5px] font-medium text-[color:var(--v2-fg)]"
                      >
                        {labelOr(PREFERRED_TYPE_LABELS, t)}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </RailCard>

      {/* INSTALACIÓN & EQUIPO */}
      <RailCard title="Instalación & equipo" icon="warehouse">
        <p className="text-[13px] font-semibold text-[color:var(--v2-fg)]">
          {s.facility_type ? (
            <>
              {labelOr(FACILITY_TYPE_LABELS, s.facility_type)}
              {s.facility_type === 'other' && s.facility_other_text ? (
                <span className="font-normal text-[color:var(--v2-muted)]">
                  {' '}· {s.facility_other_text}
                </span>
              ) : null}
            </>
          ) : (
            <Empty />
          )}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-[color:var(--v2-muted)]">
          <span>Pista: {yesNo(s.has_track)}</span>
          <span>Llano: {yesNo(s.has_flat_run)}</span>
        </div>
        {s.owned_equipment.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.owned_equipment.map((slug) => (
              <MetaChip key={slug}>{labelOr(EQUIPMENT_LABELS, slug)}</MetaChip>
            ))}
          </div>
        ) : (
          <p className="mt-2.5">
            <Empty>No declaró equipo</Empty>
          </p>
        )}
        {hasEquipmentGap ? (
          <div className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-[color:var(--v2-muted)]">
            <MIcon name="swap_horiz" size={13} className="mt-px shrink-0 text-[color:var(--v2-warn)]" aria-hidden />
            <span>
              {s.equipment_incompatible_count > 0 ? (
                <>
                  <span className="v2-num">{s.equipment_incompatible_count}</span> ejercicios con
                  sustitución
                </>
              ) : null}
              {s.equipment_incompatible_count > 0 && s.missing_equipment_tags.length > 0 ? ' · ' : ''}
              {s.missing_equipment_tags.length > 0
                ? `Sin ${s.missing_equipment_tags.map((t) => labelOr(MISSING_TAG_LABELS, t)).join(', ')}`
                : ''}
            </span>
          </div>
        ) : null}
      </RailCard>

      {/* BENCHMARKS */}
      <RailCard title="Benchmarks" icon="leaderboard">
        {benchmarks.length === 0 ? (
          <Empty>Sin benchmarks registrados</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {benchGroups.map((g) => {
              const rows = benchmarks.filter((b) => b.group === g.key);
              if (rows.length === 0) return null;
              return (
                <div key={g.key}>
                  <p className="v2-micro mb-1.5">{g.title}</p>
                  <div className="flex flex-col gap-1">
                    {rows.map((b) => (
                      <div
                        key={b.exercise_slug}
                        className="flex items-baseline justify-between gap-3 text-[12.5px]"
                      >
                        <span className="text-[color:var(--v2-muted)]">{b.label}</span>
                        <span className="text-right">
                          <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
                            {b.value}
                          </span>{' '}
                          <span className="text-[11px] text-[color:var(--v2-muted)]">{b.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </RailCard>

      {/* CARRERAS */}
      <RailCard title="Carreras" icon="flag">
        {target_event ? (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-2">
            <span className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-accent)]">
              A-event
            </span>
            <span className="text-[12.5px] font-medium text-[color:var(--v2-fg)]">{target_event.name}</span>
            <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">
              {target_event.iso_date}
            </span>
            {target_event.division ? <MetaChip>{target_event.division}</MetaChip> : null}
            <span className="v2-micro ml-auto">
              {target_event.is_in_past ? (
                <span className="text-[color:var(--v2-danger)]">Pasado</span>
              ) : (
                <>
                  <span className="v2-num">{target_event.days_to_event}</span> días
                </>
              )}
            </span>
          </div>
        ) : null}
        {race_history.length === 0 ? (
          <Empty>
            {target_event ? 'Sin más carreras en el historial' : 'Sin carreras registradas'}
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {race_history.map((r, i) => (
              <li
                key={`${r.name}-${i}`}
                className="flex flex-wrap items-center gap-1.5 text-[12.5px]"
              >
                {r.priority ? (
                  <span
                    className={
                      r.priority === 'target'
                        ? 'inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-accent)]'
                        : 'inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-muted)]'
                    }
                  >
                    {labelOr(RACE_PRIORITY_LABELS, r.priority)}
                  </span>
                ) : null}
                <span className="font-medium text-[color:var(--v2-fg)]">{r.name}</span>
                <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">{r.iso_date}</span>
                {r.event_type ? <MetaChip>{labelOr(RACE_EVENT_TYPE_LABELS, r.event_type)}</MetaChip> : null}
                {r.division ? <MetaChip>{r.division}</MetaChip> : null}
                <span className="ml-auto flex items-center gap-2 text-[11px]">
                  {r.goal_time_seconds != null ? (
                    <span className="text-[color:var(--v2-muted)]">
                      Meta{' '}
                      <span className="v2-num text-[color:var(--v2-fg)]">
                        {formatSeconds(r.goal_time_seconds)}
                      </span>
                    </span>
                  ) : null}
                  {r.finish_time ? (
                    <span className="v2-num text-[color:var(--v2-fg)]">{r.finish_time}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </RailCard>

      {/* DISPOSITIVOS */}
      <RailCard title="Dispositivos" icon="watch">
        {devices.length === 0 ? (
          <Empty>Sin dispositivos conectados</Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {devices.map((d, i) => (
              <MetaChip key={`${d.type}-${i}`}>{d.display_name ?? d.type}</MetaChip>
            ))}
          </div>
        )}
      </RailCard>
    </div>
  );
}
