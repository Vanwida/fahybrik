// ANALYTICS · DRILL-DOWN · STRENGTH — the source rows behind the strength
// numbers. `strength.lift` opens the versioned 1RM test history
// (athlete_strength_maxes); `strength.volume` opens the logged strength sessions
// and `strength.exercise` the best set per session for one lift (set_executions).

import 'server-only';

import type { Sql } from '@/lib/db';
import {
  type DrillDownResult,
  type ResolvedPeriod,
  type SourceSession,
  num,
} from '../core';
import { loadStrengthSets, setLabel, setMagnitude, tonnage, type WorkSet } from '../strength-work';

// ── Strength lift (versioned 1RM history) ────────────────────────────────────
export async function strengthDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const slug = params.slug ?? '';
  const rows = await client<Array<{ id: string; one_rm: string; version: number; on: string; source: string; method: string | null; tw: string | null; tr: number | null }>>`
    select id::text as id, one_rm_kg::text as one_rm, version,
      to_char(recorded_at, 'YYYY-MM-DD') as on, source, one_rm_method as method,
      test_weight_kg::text as tw, test_reps as tr
    from athlete_strength_maxes
    where athlete_id = ${athleteId} and exercise_slug = ${slug}
    order by version desc
  `;
  const sessions: SourceSession[] = rows.map((r, i) => ({
    id: r.id,
    date: r.on,
    title_es: r.tr && r.tr > 1 && r.tw ? `${num(r.tw)} kg × ${r.tr} (${r.method ?? 'est.'})` : 'Single directo',
    detail_es: r.source,
    value: `${formatKg(num(r.one_rm))} kg`,
    value_label: i === 0 ? 'actual' : null,
  }));
  const best = rows.length ? Math.max(...rows.map((r) => num(r.one_rm))) : null;
  return {
    kind: 'strength.lift',
    title_es: '1RM · historial',
    subtitle_es: `${rows.length} tests`,
    summary: [{ id: 'best', value: best != null ? `${formatKg(best)} kg` : '—', label: 'mejor', accent: true }],
    sessions,
    source_table: 'athlete_strength_maxes',
    period,
  };
}

function formatKg(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.', ',');
}

// ── Strength volume — the source strength SESSIONS behind the tonnage ────────
export async function strengthVolumeDrill(
  client: Sql,
  athleteId: number,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const sets = await loadStrengthSets(client, athleteId, period);
  const byExec = new Map<string, { day: string; assignmentId: string; kg: number; sets: number; exercises: Set<string> }>();
  for (const s of sets) {
    const e = byExec.get(s.executionId) ?? { day: s.day, assignmentId: s.assignmentId, kg: 0, sets: 0, exercises: new Set<string>() };
    e.sets += 1;
    if (s.load != null && s.load > 0 && s.reps != null) e.kg += s.load * s.reps * s.sides;
    if (s.exerciseName) e.exercises.add(s.exerciseName);
    byExec.set(s.executionId, e);
  }
  const sessions: SourceSession[] = [...byExec.entries()]
    .sort((a, b) => b[1].day.localeCompare(a[1].day))
    .map(([id, e]) => {
      const t = tonnage(e.kg);
      return {
        id,
        date: e.day,
        title_es: 'Sesión de fuerza',
        detail_es: `${e.sets} series · ${e.exercises.size} ${e.exercises.size === 1 ? 'ejercicio' : 'ejercicios'}`,
        value: `${t.value} ${t.unit}`,
        value_label: null,
        assignment_id: e.assignmentId,
      };
    });
  const totalKg = [...byExec.values()].reduce((a, e) => a + e.kg, 0);
  const total = tonnage(totalKg);
  return {
    kind: 'strength.volume',
    title_es: 'Fuerza · sesiones',
    subtitle_es: period.label_es,
    summary: [
      { id: 'count', value: String(sessions.length), label: 'sesiones', accent: false },
      { id: 'tonnage', value: `${total.value} ${total.unit}`, label: 'tonelaje', accent: true },
    ],
    sessions,
    source_table: 'set_executions',
    period,
  };
}

// ── Strength exercise — the best set per SESSION for one lift ─────────────────
export async function strengthExerciseDrill(
  client: Sql,
  athleteId: number,
  params: Record<string, string>,
  period: ResolvedPeriod,
): Promise<DrillDownResult> {
  const exerciseId = params.exercise_id ?? '';
  const sets = (await loadStrengthSets(client, athleteId, period)).filter((s) => s.exerciseId === exerciseId);

  // Best set (max magnitude) per session.
  const byExec = new Map<string, { set: WorkSet; mag: number }>();
  for (const s of sets) {
    const mag = setMagnitude(s);
    if (mag == null) continue;
    const cur = byExec.get(s.executionId);
    if (!cur || mag > cur.mag) byExec.set(s.executionId, { set: s, mag });
  }
  const best = [...byExec.values()].reduce<{ set: WorkSet; mag: number } | null>(
    (m, e) => (m == null || e.mag > m.mag ? e : m),
    null,
  );
  const name = sets[0]?.exerciseName ?? 'Ejercicio';
  const sessions: SourceSession[] = [...byExec.values()]
    .sort((a, b) => b.set.day.localeCompare(a.set.day))
    .map((e) => ({
      id: e.set.executionId,
      date: e.set.day,
      title_es: name,
      detail_es: 'mejor serie',
      value: setLabel(e.set),
      value_label: best != null && e.set.executionId === best.set.executionId ? 'mejor' : null,
      assignment_id: e.set.assignmentId,
    }));
  return {
    kind: 'strength.exercise',
    title_es: name,
    subtitle_es: `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}`,
    summary: [{ id: 'best', value: best ? (setLabel(best.set) ?? '—') : '—', label: 'mejor serie', accent: true }],
    sessions,
    source_table: 'set_executions',
    period,
  };
}
