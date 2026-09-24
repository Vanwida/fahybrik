import 'server-only';

// PUBLICAR POR SEMANA (§4.7, DECISIONS 2026-09-23 decisión 6).
//
// La visibilidad es UNA puerta — `weekly_plans.status = 'draft'` esconde, sin fila
// se ve (2026-08-10) — y este módulo es quien escribe esa fila cuando:
//   · se entrega un programa (asignar a varios, avanzar el grupo, plan personal…),
//     según la entrega elegida: `visible` | `draft` | `auto` (N días antes);
//   · el coach publica o retiene UNA semana, o publica la misma semana a varios;
//   · el cron diario abre las semanas en borrador automático cuyo lunes está a N
//     días o menos (N = `coaches.auto_publish_days_before`, defecto en
//     `shared/domain/coach/week-publishing.ts`).
//
// RETENER = `draft` + `delivery_mode = 'manual'` (lo mismo que el borrador privado,
// el alta y el MCP `unpublish_week`): el cron no la toca nunca.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, BOX_TIMEZONE, isoDateString, parseIsoDate, zonedDayString } from '@fahybrid/shared/domain/dates';
import { loadCoachTimezone } from '@/lib/coach/coach-timezone';
import {
  AUTO_PUBLISH_DAYS_MAX,
  DEFAULT_AUTO_PUBLISH_DAYS_BEFORE,
  athleteSeesWeek,
  autoPublishDate,
  deliveryWeekWrite,
  effectiveAutoPublishDays,
  isHeld,
  isPastWeek,
  releaseHoldWrite,
  type WeekDelivery,
  type WeekRowState,
  type WeekWrite,
} from '@fahybrid/shared/domain/coach/week-publishing';
import type {
  AthleteWeekState,
  AutoPublishSetting,
  BulkWeekPublishResult,
  WeekPublishResult,
} from '@fahybrid/shared/schema/week-publishing';
import { notifyPlanPublished } from '@/lib/notifications/plan-published';

export class WeekPublishingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WeekPublishingError';
  }
}

/**
 * Hoy en el día del club, como YYYY-MM-DD. `tz` = el huso del coach
 * (`loadCoachTimezone`); sin él, el defecto del producto.
 */
export function boxToday(now: Date = new Date(), tz: string = BOX_TIMEZONE): string {
  return zonedDayString(now, tz);
}

// ── N días antes: el ajuste del coach ────────────────────────────────────────

export async function getAutoPublishSetting(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<AutoPublishSetting> {
  const rows = await client<Array<{ days: number | null }>>`
    select auto_publish_days_before as days from coaches where id = ${Number(coach_id)} limit 1
  `;
  const stored = rows[0]?.days ?? null;
  return {
    auto_publish_days_before: stored,
    effective_days: effectiveAutoPublishDays(stored),
    default_days: DEFAULT_AUTO_PUBLISH_DAYS_BEFORE,
  };
}

export async function setAutoPublishDays(
  coach_id: number | bigint,
  days: number | null,
  client: Sql = defaultSql,
): Promise<AutoPublishSetting> {
  if (days != null && (days < 0 || days > AUTO_PUBLISH_DAYS_MAX || !Number.isInteger(days))) {
    throw new WeekPublishingError(
      'invalid_days',
      `Los días antes van de 0 (el mismo lunes) a ${AUTO_PUBLISH_DAYS_MAX}.`,
      422,
    );
  }
  await client`update coaches set auto_publish_days_before = ${days} where id = ${Number(coach_id)}`;
  return getAutoPublishSetting(coach_id, client);
}

async function effectiveDays(client: Sql, coach_id: number | bigint): Promise<number> {
  return (await getAutoPublishSetting(coach_id, client)).effective_days;
}

// ── Leer y escribir filas de weekly_plans ────────────────────────────────────

/** Estado de N semanas de un atleta (una consulta). Sin fila → null (se ve). */
export async function loadWeekRows(
  client: Sql,
  athlete_id: number,
  week_starts: string[],
): Promise<Map<string, WeekRowState | null>> {
  const weeks = [...new Set(week_starts)];
  const rows =
    weeks.length === 0
      ? []
      : await client<Array<{ week_start: string; status: WeekRowState['status']; delivery_mode: WeekRowState['delivery_mode'] }>>`
          select to_char(week_start, 'YYYY-MM-DD') as week_start, status::text as status, delivery_mode
          from weekly_plans
          where athlete_id = ${athlete_id} and week_start = any(${weeks}::date[])
        `;
  const byWeek = new Map(rows.map((r) => [r.week_start, { status: r.status, delivery_mode: r.delivery_mode }]));
  return new Map(weeks.map((w) => [w, byWeek.get(w) ?? null]));
}

/**
 * Escribe UNA decisión en la fila de la semana. Publicar deja constancia de quién
 * (`approved_by`). Borrador automático y retener no la dejan: nadie ha aprobado.
 */
export async function writeWeek(
  client: Sql,
  params: { athlete_id: number; coach_id: number; week_start: string; write: WeekWrite },
): Promise<void> {
  const { athlete_id, coach_id, week_start, write } = params;
  switch (write.kind) {
    case 'keep':
      return;
    case 'publish':
      await client`
        insert into weekly_plans (athlete_id, week_start, status, approved_by, updated_at)
        values (${athlete_id}, ${week_start}::date, 'published', ${coach_id}, now())
        on conflict (athlete_id, week_start)
        do update set status = 'published', approved_by = ${coach_id}, updated_at = now()
      `;
      return;
    case 'draft_auto':
    case 'hold': {
      const mode = write.kind === 'hold' ? 'manual' : 'scheduled';
      await client`
        insert into weekly_plans (athlete_id, week_start, status, delivery_mode, updated_at)
        values (${athlete_id}, ${week_start}::date, 'draft', ${mode}, now())
        on conflict (athlete_id, week_start)
        do update set status = 'draft', delivery_mode = ${mode}, updated_at = now()
      `;
      return;
    }
  }
}

/** Qué queda en la fila tras aplicar `write` sobre `before`. */
export function rowAfter(before: WeekRowState | null, write: WeekWrite): WeekRowState | null {
  switch (write.kind) {
    case 'keep':
      return before;
    case 'publish':
      return { status: 'published', delivery_mode: before?.delivery_mode ?? 'scheduled' };
    case 'draft_auto':
      return { status: 'draft', delivery_mode: 'scheduled' };
    case 'hold':
      return { status: 'draft', delivery_mode: 'manual' };
  }
}

export interface DeliveryOutcome {
  before: Map<string, WeekRowState | null>;
  after: Map<string, WeekRowState | null>;
  /** Semanas que el atleta no veía y ahora sí. */
  became_visible: string[];
}

/**
 * Aplica una entrega a las semanas de un programa recién materializado. Corre en
 * el `client` que le den (la transacción del atleta, si la hay). La tenencia la
 * comprueba quien llama.
 */
export async function applyDeliveryToWeeks(
  client: Sql,
  params: {
    coach_id: number;
    athlete_id: number;
    week_starts: string[];
    delivery: WeekDelivery;
    today?: string;
    days_before?: number;
  },
): Promise<DeliveryOutcome> {
  const today = params.today ?? boxToday(new Date(), await loadCoachTimezone(params.coach_id, client));
  const days = params.days_before ?? (await effectiveDays(client, params.coach_id));
  const before = await loadWeekRows(client, params.athlete_id, params.week_starts);
  const after = new Map<string, WeekRowState | null>();
  const becameVisible: string[] = [];
  for (const [week, row] of before) {
    const write = deliveryWeekWrite(params.delivery, row, week, today, days);
    await writeWeek(client, { athlete_id: params.athlete_id, coach_id: params.coach_id, week_start: week, write });
    const next = rowAfter(row, write);
    after.set(week, next);
    if (!athleteSeesWeek(row) && athleteSeesWeek(next)) becameVisible.push(week);
  }
  return { before, after, became_visible: becameVisible };
}

// ── Lectura para el coach ────────────────────────────────────────────────────

async function assertOwned(client: Sql, coach_id: number, athlete_id: number): Promise<void> {
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  if (!owned[0]) {
    throw new WeekPublishingError('not_found', 'Atleta no encontrado entre los tuyos.', 404);
  }
}

async function sessionsByWeek(client: Sql, athlete_ids: number[], from: string, to: string) {
  const rows =
    athlete_ids.length === 0
      ? []
      : await client<Array<{ athlete_id: string; week_start: string; n: number }>>`
          select athlete_id::text as athlete_id,
                 to_char(date_trunc('week', scheduled_for)::date, 'YYYY-MM-DD') as week_start,
                 count(*)::int as n
          from workout_assignments
          where athlete_id = any(${athlete_ids}::bigint[])
            and scheduled_for between ${from}::date and ${to}::date
            and origin <> 'self'
          group by 1, 2
        `;
  return new Map(rows.map((r) => [`${r.athlete_id}|${r.week_start}`, r.n]));
}

function weekState(
  week_start: string,
  row: WeekRowState | null,
  sessions: number,
  days_before: number,
): AthleteWeekState {
  const autoDraft = row?.status === 'draft' && row.delivery_mode === 'scheduled';
  return {
    week_start,
    visible: athleteSeesWeek(row),
    held: isHeld(row),
    status: row?.status ?? null,
    opens_on: autoDraft ? autoPublishDate(week_start, days_before) : null,
    sessions,
  };
}

/** Las semanas de un atleta entre dos lunes (incluidos), máx. 53. */
export async function listAthleteWeeks(params: {
  coach_id: number | bigint;
  athlete_id: number;
  from: string;
  to: string;
  client?: Sql;
}): Promise<AthleteWeekState[]> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  await assertOwned(client, coachId, params.athlete_id);
  if (params.to < params.from) {
    throw new WeekPublishingError('bad_range', 'La semana final va después de la inicial.', 400);
  }
  const weeks: string[] = [];
  for (let d = parseIsoDate(params.from); isoDateString(d) <= params.to && weeks.length < 53; d = addDays(d, 7)) {
    weeks.push(isoDateString(d));
  }
  const days = await effectiveDays(client, coachId);
  const rows = await loadWeekRows(client, params.athlete_id, weeks);
  const lastSunday = isoDateString(addDays(parseIsoDate(weeks[weeks.length - 1]!), 6));
  const sessions = await sessionsByWeek(client, [params.athlete_id], weeks[0]!, lastSunday);
  return weeks.map((w) =>
    weekState(w, rows.get(w) ?? null, sessions.get(`${params.athlete_id}|${w}`) ?? 0, days),
  );
}

// ── Actos del coach ──────────────────────────────────────────────────────────

/** «Tu plan de la semana está listo», nombrando ESA semana desde el hoy del
 *  atleta («esta semana», «la semana que viene»…): el cron abre también la semana
 *  en curso, y el aviso decía «la próxima» para las dos (D-10). */
async function notifyWeekVisible(
  client: Sql,
  athlete_id: number,
  week_start: string,
  now?: Date,
): Promise<boolean> {
  try {
    const out = await notifyPlanPublished({ sql: client, athlete_id, variant: 'weekly', week_start, now });
    return Boolean(out);
  } catch {
    // Cortesía: la semana ya está publicada; la bandeja in-app es lo durable.
    return false;
  }
}

async function actOnWeek(params: {
  coach_id: number | bigint;
  athlete_id: number;
  week_start: string;
  decide: (row: WeekRowState | null, today: string, days: number) => WeekWrite;
  client?: Sql;
}): Promise<WeekPublishResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  await assertOwned(client, coachId, params.athlete_id);
  const today = boxToday(new Date(), await loadCoachTimezone(coachId, client));
  const days = await effectiveDays(client, coachId);

  const outcome = await client.begin(async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const before = (await loadWeekRows(tx, params.athlete_id, [params.week_start])).get(params.week_start) ?? null;
    const write = params.decide(before, today, days);
    await writeWeek(tx, { athlete_id: params.athlete_id, coach_id: coachId, week_start: params.week_start, write });
    return { before, after: rowAfter(before, write) };
  });

  const sunday = isoDateString(addDays(parseIsoDate(params.week_start), 6));
  const sessions =
    (await sessionsByWeek(client, [params.athlete_id], params.week_start, sunday)).get(
      `${params.athlete_id}|${params.week_start}`,
    ) ?? 0;
  const becameVisible = !athleteSeesWeek(outcome.before) && athleteSeesWeek(outcome.after);
  const notified = becameVisible && sessions > 0 ? await notifyWeekVisible(client, params.athlete_id, params.week_start) : false;
  return {
    athlete_id: String(params.athlete_id),
    week_start: params.week_start,
    week: weekState(params.week_start, outcome.after, sessions, days),
    became_visible: becameVisible,
    notified,
  };
}

/** Publicar UNA semana de un atleta: visible ya. Idempotente; avisa solo si cambió. */
export function publishAthleteWeek(params: {
  coach_id: number | bigint;
  athlete_id: number;
  week_start: string;
  client?: Sql;
}): Promise<WeekPublishResult> {
  return actOnWeek({
    ...params,
    decide: (row) => (row == null || row.status !== 'draft' ? { kind: 'keep' } : { kind: 'publish' }),
  });
}

/**
 * Retener o soltar UNA semana. `held` explícito es idempotente (doble clic no la
 * vuelve a soltar); sin él, alterna. Soltar la devuelve a lo automático: si ya
 * tocaba verla, se publica en el acto.
 */
export async function setAthleteWeekHeld(params: {
  coach_id: number | bigint;
  athlete_id: number;
  week_start: string;
  held?: boolean;
  client?: Sql;
}): Promise<WeekPublishResult> {
  return actOnWeek({
    ...params,
    decide: (row, today, days) => {
      const target = params.held ?? !isHeld(row);
      if (target) {
        if (isHeld(row)) return { kind: 'keep' };
        if (isPastWeek(params.week_start, today)) {
          throw new WeekPublishingError(
            'past_week',
            'Esa semana ya ha pasado: retenerla solo le escondería su historial. Retén una semana de hoy en adelante.',
            409,
          );
        }
        return { kind: 'hold' };
      }
      return isHeld(row) ? releaseHoldWrite(params.week_start, today, days) : { kind: 'keep' };
    },
  });
}

/**
 * Publicar la misma semana a varios atletas (Hoy: «Publicar a los 47»). Todos
 * tienen que ser del coach: si uno no lo es, no se publica ninguna.
 */
export async function publishWeekForAthletes(params: {
  coach_id: number | bigint;
  athlete_ids: number[];
  week_start: string;
  client?: Sql;
}): Promise<BulkWeekPublishResult> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ids = [...new Set(params.athlete_ids)];
  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where coach_id = ${coachId} and id = any(${ids}::bigint[])
  `;
  if (owned.length !== ids.length) {
    const missing = ids.length - owned.length;
    throw new WeekPublishingError(
      'not_found',
      `${missing} de los atletas no ${missing === 1 ? 'es tuyo o no existe' : 'son tuyos o no existen'}; no se ha publicado ninguna semana. Quítalos de la selección y vuelve a probar.`,
      404,
    );
  }

  const before = await client<Array<{ athlete_id: string; status: string | null }>>`
    select a.id::text as athlete_id, wp.status::text as status
    from unnest(${ids}::bigint[]) as a(id)
    left join weekly_plans wp on wp.athlete_id = a.id and wp.week_start = ${params.week_start}::date
  `;
  const hidden = new Set(before.filter((b) => b.status === 'draft').map((b) => Number(b.athlete_id)));
  const toPublish = [...hidden];
  if (toPublish.length > 0) {
    await client`
      update weekly_plans
      set status = 'published', approved_by = ${coachId}, updated_at = now()
      where week_start = ${params.week_start}::date
        and athlete_id = any(${toPublish}::bigint[])
        and status = 'draft'
    `;
  }

  const sunday = isoDateString(addDays(parseIsoDate(params.week_start), 6));
  const sessions = await sessionsByWeek(client, ids, params.week_start, sunday);
  const results: BulkWeekPublishResult['results'] = [];
  for (const id of ids) {
    const n = sessions.get(`${id}|${params.week_start}`) ?? 0;
    const became = hidden.has(id);
    const notified = became && n > 0 ? await notifyWeekVisible(client, id, params.week_start) : false;
    results.push({ athlete_id: String(id), became_visible: became, sessions: n, notified });
  }
  return {
    week_start: params.week_start,
    published: hidden.size,
    already_visible: ids.length - hidden.size,
    results,
  };
}

// ── Cron diario ──────────────────────────────────────────────────────────────

export interface AutoPublishRunResult {
  today: string;
  published: number;
  notified: number;
}

/**
 * Abre las semanas en borrador AUTOMÁTICO cuyo lunes está a N días o menos (N del
 * coach de cada atleta) y que no han acabado ya. Una semana retenida no se toca;
 * un atleta pausado o de baja tampoco (su plan está congelado). Un aviso por
 * atleta (la semana más temprana abierta) y solo si esa semana tiene entrenos.
 * Si un día falla, al siguiente recoge lo que quedó (no solo «el lunes que viene»).
 */
export async function runAutoPublish(
  params: {
    client?: Sql;
    now?: Date;
    /** Solo las semanas de los atletas de este coach (pruebas, relanzar un club). */
    coach_id?: number | bigint;
  } = {},
): Promise<AutoPublishRunResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const today = boxToday(now);
  const onlyCoach = params.coach_id == null ? null : Number(params.coach_id);
  // «Hoy» es el de CADA coach (su huso; uno que Postgres no conozca cae al
  // defecto en vez de tumbar el barrido de todos).
  const opened = await client<Array<{ athlete_id: string; week_start: string }>>`
    with valid as (select name from pg_timezone_names),
    coach_day as (
      select c.id as coach_id,
             c.auto_publish_days_before,
             (${now.toISOString()}::timestamptz at time zone
               coalesce((select v.name from valid v where v.name = c.timezone), ${BOX_TIMEZONE}))::date as today
      from coaches c
    )
    update weekly_plans wp
       set status = 'published', updated_at = now()
      from athletes a
      left join coach_day d on d.coach_id = a.coach_id
     where a.id = wp.athlete_id
       and wp.status = 'draft'
       and wp.delivery_mode = 'scheduled'
       and a.lifecycle_status = 'activo'
       and (${onlyCoach}::bigint is null or a.coach_id = ${onlyCoach}::bigint)
       and wp.week_start - coalesce(d.auto_publish_days_before, ${DEFAULT_AUTO_PUBLISH_DAYS_BEFORE})::int
           <= coalesce(d.today, ${today}::date)
       and wp.week_start + 6 >= coalesce(d.today, ${today}::date)
    returning wp.athlete_id::text as athlete_id, to_char(wp.week_start, 'YYYY-MM-DD') as week_start
  `;

  const firstByAthlete = new Map<number, string>();
  for (const row of opened) {
    const id = Number(row.athlete_id);
    const cur = firstByAthlete.get(id);
    if (!cur || row.week_start < cur) firstByAthlete.set(id, row.week_start);
  }
  if (firstByAthlete.size === 0) return { today, published: 0, notified: 0 };

  const ids = [...firstByAthlete.keys()];
  const lastSunday = isoDateString(addDays(parseIsoDate(today), 6 + AUTO_PUBLISH_DAYS_MAX));
  const sessions = await sessionsByWeek(client, ids, isoDateString(addDays(parseIsoDate(today), -6)), lastSunday);
  let notified = 0;
  for (const [id, week] of firstByAthlete) {
    if ((sessions.get(`${id}|${week}`) ?? 0) === 0) continue;
    if (await notifyWeekVisible(client, id, week, now)) notified += 1;
  }
  return { today, published: opened.length, notified };
}
