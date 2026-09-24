import type { Sql } from 'postgres';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '../dates';
import { buildAthleteContextPack, type AthleteContextPack, type BodySignal } from './coach-ia-context';
import {
  BODY_SIGNAL_TRIGGER,
  evaluateWeeklyVerdictFromContext,
  type WeeklyVerdict,
} from './weekly-verdict-rules';

export type { WeeklyVerdict } from './weekly-verdict-rules';
export { evaluateWeeklyVerdictFromContext } from './weekly-verdict-rules';

/**
 * Una señal del veredicto YA DISPARADA, lista para pintar sin recalcular.
 * `code` es el mismo de `weekly-verdict-rules`; `label` + `value` traen el
 * número REAL del context_pack para que el panel del coach muestre "Readiness
 * 38 ▼" en vez de un código. `tone` decide el color del token (warning/danger).
 */
export type FiredTrigger = {
  code: string;
  label: string;
  value: string;
  tone: 'warning' | 'danger';
};

/** Una sesión del feed de la semana evaluada (LO QUE HIZO el atleta). */
export type WeekFeedSession = {
  title: string;
  status: 'scheduled' | 'completed' | 'missed' | 'skipped';
};

/** Un día de la semana evaluada (lun→dom) con sus sesiones. */
export type WeekFeedDay = {
  iso_date: string;
  /** 1 = lunes … 7 = domingo. */
  day_of_week: number;
  sessions: WeekFeedSession[];
};

/** Resumen de cumplimiento de la semana evaluada (mismos números del veredicto). */
export type WeekFeedSummary = {
  scheduled: number;
  completed: number;
  missed: number;
  days: WeekFeedDay[];
};

export type WeeklyEvaluationResult = {
  athlete_id: string;
  week_start: string;
  week_end: string;
  verdict: WeeklyVerdict;
  context_pack: AthleteContextPack;
  triggers: string[];
  /** Triggers disparados, ya con etiqueta + número real (para el panel del coach). */
  fired_triggers: FiredTrigger[];
  /** Sesiones de la semana evaluada (lun→dom) — "lo que hizo el atleta". */
  week_feed: WeekFeedSummary;
};

function parseWeekStart(iso: string): Date {
  return mondayOfWeek(parseIsoDate(iso));
}

/**
 * La semana que se evalúa cuando no se dice cuál: el lunes de la ANTERIOR a la
 * que contiene `today` (YYYY-MM-DD). `today` es el día de quien decide — el del
 * CLUB: el veredicto lo lee el coach y decide con él (DECISIONS 2026-09-23, «Qué
 * día es en cada sitio»). Quien llama sin semana la calcula con esto.
 */
export function evaluationWeekStartFor(today: string): string {
  // mondayOfWeek(today - 7d) = lunes de la semana anterior.
  return isoDateString(mondayOfWeek(addDays(parseIsoDate(today), -7)));
}

/** Lunes de la semana N-1 respecto a hoy (zona del box) — default cuando no se pasa week_start. */
export function defaultEvaluationWeekStart(now: Date = new Date()): string {
  return evaluationWeekStartFor(isoDateString(startOfDayInBox(now)));
}

export async function evaluateAthleteWeek(params: {
  athlete_id: number | bigint;
  week_start?: string;
  /**
   * Las señales vivas de Hoy que piden tocar la semana. Quien pide la evaluación
   * las carga (`web/lib/coach/week-adjust-signals.ts`); son el veredicto: sin
   * ellas, «ok».
   */
  body_signals?: BodySignal[];
  client: Sql;
}): Promise<WeeklyEvaluationResult> {
  const client = params.client;
  // Sin semana, la del defecto del producto. Los llamadores de la web la pasan
  // ya resuelta en el calendario del club (`evaluationWeekStartFor`).
  const weekStart = parseWeekStart(params.week_start ? params.week_start : defaultEvaluationWeekStart());
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  const pack: AthleteContextPack = await buildAthleteContextPack({
    athlete_id: params.athlete_id,
    on_date: addDays(weekStart, 6),
    body_signals: params.body_signals ?? [],
    client,
  });

  const { verdict, triggers } = evaluateWeeklyVerdictFromContext(pack);

  const week_feed = await loadEvaluatedWeekFeed({
    athlete_id: params.athlete_id,
    week_start: weekStartIso,
    week_end: weekEndIso,
    client,
  });

  const fired_triggers = buildFiredTriggers(triggers, pack);

  return {
    athlete_id: String(params.athlete_id),
    week_start: weekStartIso,
    week_end: weekEndIso,
    verdict,
    context_pack: pack,
    triggers,
    fired_triggers,
    week_feed,
  };
}

/**
 * Carga las sesiones de la semana evaluada (lun→dom) agrupadas por día, con su
 * estado real de cumplimiento. Es la fuente de "LO QUE HIZO" + el conteo
 * scheduled/completed/missed que acompaña al trigger de cumplimiento (mismos
 * números que ve el coach en el feed → cero contradicción).
 */
async function loadEvaluatedWeekFeed(params: {
  athlete_id: number | bigint;
  week_start: string;
  week_end: string;
  client: Sql;
}): Promise<WeekFeedSummary> {
  // Título: el coach puede renombrar la sesión por-asignación; ese override se
  // guarda como línea `coach_title:` dentro de wa.notes (mismo contrato que
  // decodeCoachAssignmentNotes). Lo resolvemos en SQL para no acoplar shared al
  // decoder web: coach_title > nombre de plantilla > 'Entreno'.
  const rows = await params.client<
    Array<{ iso_date: string; coach_title: string | null; template_name: string | null; status: string }>
  >`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      nullif(trim((regexp_match(wa.notes, '(?m)^coach_title:(.*)$'))[1]), '') as coach_title,
      t.name as template_name,
      wa.status::text as status
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${params.week_start}::date
      and wa.scheduled_for <= ${params.week_end}::date
    order by wa.scheduled_for asc, wa.id asc
  `;

  const byDate = new Map<string, WeekFeedDay>();
  // Sembrar los 7 días de la semana (lun→dom) para que el feed sea estable
  // aunque un día no tenga sesiones (día de descanso visible).
  for (let i = 0; i < 7; i += 1) {
    const iso = isoDateString(addDays(parseIsoDate(params.week_start), i));
    byDate.set(iso, { iso_date: iso, day_of_week: i + 1, sessions: [] });
  }

  let scheduled = 0;
  let completed = 0;
  let missed = 0;
  for (const r of rows) {
    const status = normalizeFeedStatus(r.status);
    const day = byDate.get(r.iso_date);
    const title = r.coach_title ?? r.template_name ?? 'Entreno';
    if (day) day.sessions.push({ title, status });
    scheduled += 1;
    if (status === 'completed') completed += 1;
    else if (status === 'missed') missed += 1;
  }

  return {
    scheduled,
    completed,
    missed,
    days: [...byDate.values()],
  };
}

function normalizeFeedStatus(raw: string): WeekFeedSession['status'] {
  if (raw === 'completed' || raw === 'missed' || raw === 'skipped') return raw;
  return 'scheduled';
}

/**
 * Re-deriva los triggers disparados a partir SOLO del `context_pack` persistido
 * en la propuesta — sin tocar la DB ni recalcular nada nuevo. Usa las MISMAS
 * reglas puras del veredicto (`evaluateWeeklyVerdictFromContext`) y el mismo
 * formateo (`buildFiredTriggers`), de modo que el "por qué" de la card y la
 * evaluación en vivo nunca puedan divergir. Read-only; pensado para explicar al
 * coach por qué la IA propuso un ajuste (cumplimiento, readiness, HRV, perdidas).
 */
export function firedTriggersFromContext(pack: AthleteContextPack): FiredTrigger[] {
  const { triggers } = evaluateWeeklyVerdictFromContext(pack);
  return buildFiredTriggers(triggers, pack);
}

/**
 * Traduce los códigos de trigger disparados a {label, value, tone} con las
 * palabras de la señal de Hoy que los disparó (su etiqueta y su evidencia). NO
 * recalcula reglas — sólo da formato a lo que `evaluateWeeklyVerdictFromContext`
 * ya decidió.
 */
function buildFiredTriggers(
  triggers: string[],
  pack: AthleteContextPack,
): FiredTrigger[] {
  const fired: FiredTrigger[] = [];
  for (const code of triggers) {
    // La señal viva que llevó a pedirlo, con SUS palabras (las de Hoy).
    const kind = code.startsWith(BODY_SIGNAL_TRIGGER) ? code.slice(BODY_SIGNAL_TRIGGER.length) : code;
    const s = (pack.body_signals ?? []).find((b) => b.kind === kind);
    fired.push({
      code,
      label: s?.label ?? kind,
      value: s?.evidence || '—',
      tone: s?.severity === 'critical' ? 'danger' : 'warning',
    });
  }

  return fired;
}
