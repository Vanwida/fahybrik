'use client';

// v2 · ALTA · RESPUESTAS — lo que el atleta contestó en su cuestionario de
// entrada, de solo lectura, en una tarjeta densa: una fila por respuesta. Lo que
// no contestó no ocupa una tarjeta vacía con «—»: se resume en una línea al final.

import type { ReactNode } from 'react';
import { Card, CardHeader, List, ListRow, Tag } from '@/components/v2/ui';
import type { IntakeProfile } from '@/lib/coach/intake';

const GOAL_TYPE: Record<string, string> = {
  first_hyrox: 'Primer HYROX',
  improve_hyrox_mark: 'Mejorar su marca HYROX',
  improve_running: 'Mejorar corriendo',
  complete_fun: 'Terminar y disfrutar',
  other: 'Otro',
};
const RUN_EXPERIENCE: Record<string, string> = {
  enthusiast: 'le encanta',
  comfortable: 'cómodo',
  reluctant: 'a regañadientes',
  none: 'sin experiencia',
};
const STRENGTH_EXPERIENCE: Record<string, string> = {
  loves_lifting: 'le encanta',
  weekly_ish: 'casi cada semana',
  with_guidance: 'con guía',
  none: 'sin experiencia',
};
const FACILITY: Record<string, string> = {
  commercial_gym: 'Gimnasio',
  crossfit_box: 'Box de CrossFit',
  multiple: 'Varios sitios',
  other: 'Otro',
};
const SEVERITY: Record<string, string> = { mild: 'leve', moderate: 'moderada', severe: 'grave' };
const DAYS: Array<[string, string]> = [
  ['mon', 'L'],
  ['tue', 'M'],
  ['wed', 'X'],
  ['thu', 'J'],
  ['fri', 'V'],
  ['sat', 'S'],
  ['sun', 'D'],
];

/** «sled_push» → «sled push». */
const human = (slug: string) => slug.replace(/_/g, ' ');

export function AthleteAnswers({ profile }: { profile: IntakeProfile }) {
  const { athlete, benchmarks, devices } = profile;
  const s = profile.intake_structured;
  const rows: Array<{ key: string; title: string; detail: ReactNode }> = [];
  const missing: string[] = [];
  const add = (key: string, title: string, detail: ReactNode | null, missingLabel: string) => {
    if (detail == null || detail === '') missing.push(missingLabel);
    else rows.push({ key, title, detail });
  };

  const goal = [
    s.goal_type ? GOAL_TYPE[s.goal_type] : null,
    athlete.goal_short,
    athlete.achievable_2_4_months === 'yes' ? 'lo ve alcanzable en 2–4 meses' : athlete.achievable_2_4_months === 'no' ? 'lo ve difícil en 2–4 meses' : null,
  ].filter(Boolean);
  add('objetivo', 'Objetivo', goal.length ? goal.join(' · ') : null, 'objetivo');

  const exp = [
    s.run_experience ? `correr: ${RUN_EXPERIENCE[s.run_experience]}` : null,
    s.strength_experience ? `fuerza: ${STRENGTH_EXPERIENCE[s.strength_experience]}` : null,
    athlete.training_experience_years != null
      ? `${athlete.training_experience_years} ${athlete.training_experience_years === 1 ? 'año' : 'años'} entrenando`
      : null,
  ].filter(Boolean);
  add('experiencia', 'Experiencia', exp.length ? exp.join(' · ') : null, 'experiencia');

  const basal = [
    s.sleep_quality != null ? `sueño ${s.sleep_quality}/10` : null,
    s.stress_level != null ? `estrés ${s.stress_level}/10` : null,
    s.commitment_level != null ? `compromiso ${s.commitment_level}/10` : null,
  ].filter(Boolean);
  add('basal', 'Cómo llega', basal.length ? basal.join(' · ') : null, 'sueño y estrés');

  const trainingDays = athlete.training_days_per_week ?? (s.program_days.length || null);
  const programDays = DAYS.filter(([k]) => s.availability[k] === 'program').map(([, l]) => l);
  const avail = [
    trainingDays != null ? `${trainingDays} días por semana` : null,
    programDays.length ? programDays.join(' ') : null,
    s.available_from && s.available_to ? `${s.available_from}–${s.available_to}` : null,
    s.session_minutes != null ? `${s.session_minutes} min por sesión` : null,
  ].filter(Boolean);
  add('dias', 'Disponibilidad', avail.length ? avail.join(' · ') : null, 'disponibilidad');

  const injuries = athlete.injuries.map(
    (i) => `${i.area}${i.severity ? ` (${SEVERITY[i.severity]})` : ''}${i.active ? ', activa' : ''}`,
  );
  rows.push({
    key: 'lesiones',
    title: 'Lesiones',
    detail: injuries.length ? injuries.join(' · ') : 'ninguna declarada',
  });

  add(
    'marcas',
    'Marcas',
    benchmarks.length ? benchmarks.map((b) => `${b.label} ${b.value} ${b.unit}`).join(' · ') : null,
    'marcas',
  );

  const place = s.facility_type
    ? s.facility_type === 'other'
      ? s.facility_other_text || FACILITY.other
      : FACILITY[s.facility_type]
    : null;
  const equip = s.owned_equipment.length ? s.owned_equipment.map(human).join(', ') : null;
  add('sitio', 'Dónde entrena', place ? [place, equip].filter(Boolean).join(' · ') : null, 'dónde entrena');

  add(
    'reloj',
    'Reloj',
    devices.length ? devices.map((d) => d.display_name ?? human(d.type)).join(' · ') : null,
    'reloj',
  );

  return (
    <Card padding="none">
      <CardHeader title="Sus respuestas" subtitle="Cuestionario de entrada" className="px-4 pt-4" />
      <List aria-label="Sus respuestas" className="rounded-none border-x-0 border-b-0">
        {rows.map((r) => (
          <ListRow key={r.key} density="compact" title={r.title} detail={<span className="whitespace-normal">{r.detail}</span>} className="py-2" />
        ))}
      </List>
      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-v2-border px-4 py-3">
          <span className="t-body-sm text-v2-muted">Sin responder:</span>
          {missing.map((m) => (
            <Tag key={m}>{m}</Tag>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
