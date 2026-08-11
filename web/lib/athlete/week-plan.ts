// =============================================================================
// Athlete WEEK PLAN resolver — the single source of truth for "the athlete's
// week" (Mon–Sun, rest days included), extracted from the plan/week route so it
// can be reused wherever a week is needed without re-deriving the mapping
// (individual "Tu semana" AND the Dobles connected plan). Behaviour is identical
// to the prior in-route implementation; only its home changed.
//
// Per day: the day's sessions with their title, REAL modality (principal-block
// dominant), status, partner_visibility, origin, derived duration/blocks/short
// prescription, and the raw template_id + format (used by callers that classify
// sessions, e.g. the Dobles togetherness resolver). `is_rest` when the day has
// no assignment.
// =============================================================================

import { z } from 'zod';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import {
  recoverySuggestionSchema,
  type RecoverySuggestion,
  type WeekDayKind,
} from '@fahybrid/shared/schema/program-templates';
import {
  safeParsePrescription,
  sessionDuration,
  type DurationUnknownReason,
  type PrescriptionRole,
  type SessionDurationItem,
} from '@fahybrid/shared/domain/prescription';
import { sql } from '@/lib/db';
import { weekStates, type WeekPublishState } from '@/lib/mcp/shape-write';

export interface AthleteWeekDaySession {
  assignment_id: string;
  /** Raw template id (for callers that compare/identify the session). */
  template_id: string | null;
  /** Raw template format (amrap/emom/hyrox_sim/…); drives sim detection. */
  format: string | null;
  slot: 'am' | 'pm';
  title: string;
  modality: string | null;
  status: string;
  partner_visibility: 'shared' | 'self_only';
  origin: 'coach' | 'self';
  /**
   * The clock the PLAN WRITES DOWN, in minutes — never an estimate of how long
   * the athlete will take. Null whenever the session's principal work has no
   * written duration (a `for_time` block, reps without a tempo, a distance
   * without a pace, an undosed item); `duration_unknown_reason` then says why.
   * Read it as a FLOOR ("al menos X"): the seconds nobody writes down only add.
   * Owned by `shared/domain/prescription/duration.ts`.
   */
  est_duration_minutes: number | null;
  /**
   * Why there is no duration, when there isn't one. Null when
   * `est_duration_minutes` carries a number. Additive field — older clients that
   * do not decode it simply keep hiding the duration, as they already do.
   */
  duration_unknown_reason: DurationUnknownReason | null;
  blocks_count: number | null;
  short_prescription: string | null;
  is_test: boolean;
}

export interface AthleteWeekDay {
  day_of_week: number;
  iso_date: string;
  sessions: AthleteWeekDaySession[];
  is_rest: boolean;
  /**
   * Día TIPADO (workout | rest) para que iOS/coach lo distingan sin re-derivar del
   * conteo de sesiones. Se deriva de la MATERIALIZACIÓN: un día con ≥1 sesión
   * asignada es 'workout'; sin asignaciones es 'rest'. Post-materialización, para
   * el atleta "vacío" y "descanso" coinciden — sus días de descanso salen de SU
   * disponibilidad (availability_json), no de la plantilla — así que rest = sin
   * sesiones. Extensible a 'test'|'competition' en el futuro (no implementado;
   * `is_test` ya viaja por sesión). `is_rest` se mantiene por retro-compatibilidad.
   */
  kind: WeekDayKind;
  /**
   * Sugerencias de RECUPERACIÓN (oferta blanda del coach) para un día de descanso.
   * Vacío en días de entreno y en descansos sin sugerencias. El coach las autora
   * por weekday canónico en la plantilla; aquí se exponen en el día de descanso del
   * atleta del MISMO weekday (los descansos del atleta salen de su disponibilidad,
   * así que el match es por weekday — si no coincide, se degrada a vacío, nunca se
   * inventa). NO es un entreno: no cuenta adherencia, sin intensidad/carga.
   */
  recovery_suggestions: RecoverySuggestion[];
}

export interface AthleteWeekPlan {
  week_start: string;
  week_end: string;
  today_iso: string;
  microciclo_name: string | null;
  focus: string | null;
  has_next_week: boolean;
  days: AthleteWeekDay[];
  // #13 — lifecycle freeze. `paused` = the athlete is frozen (lifecycle_status !=
  // 'activo'); the client renders an "en pausa" state instead of an empty/failed
  // week. We still return the real week structure (no invented sessions) — the flag
  // just lets the app frame it. `paused_since`/`paused_reason` come from the OPEN
  // pause (null when none, e.g. baja closed its interval).
  paused: boolean;
  paused_since: string | null;
  paused_reason: string | null;
  /**
   * La fecha (ISO, lunes) en la que EMPIEZA el trabajo ya programado, cuando cae
   * DESPUÉS de la ventana que se está sirviendo. `null` = no hay nada programado
   * más adelante.
   *
   * Existe para que un estado vacío no mienta. Un plan siempre arranca en lunes
   * (el materializador alinea a lunes), así que un atleta al que se le asigna el
   * plan un martes tiene entre 1 y 7 días sin nada — y hasta hoy la app le decía
   * «tu coach aún no ha publicado tu plan», que es FALSO: está publicado y
   * empieza más tarde. El atleta lo leía como negligencia de su coach.
   *
   * Con esto el cliente distingue los dos vacíos: «se está preparando» (null) y
   * «empieza el lunes 10» (fecha). NO afirma nada sobre lo que el coach hará ni
   * cuándo — solo refleja lo que YA está programado (docs/DECISIONS.md, 7-ago).
   */
  plan_starts_on: string | null;
}

export async function buildAthleteWeekPlan(
  athlete_id: number | bigint,
  weekOffset = 0,
): Promise<AthleteWeekPlan> {
  // "Today" must resolve in the box timezone (Europe/Madrid), not UTC —
  // otherwise between 00:00–02:00 BCN the athlete is shown yesterday's week.
  // `weekOffset` shifts the window forward by N weeks (0 = this week, 1 = the
  // next-week peek); `today_iso` stays the real today, so a peeked week has no
  // "today" row and reads as a preview.
  const today = startOfDayInBox(new Date());
  const weekStart = addDays(mondayOfWeek(today), weekOffset * 7);
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  const rows = await sql<
    Array<{
      assignment_id: string;
      iso_date: string;
      template_id: string | null;
      microcycle_id: string | null;
      template_name: string | null;
      template_format: string | null;
      template_day_position: string | null;
      is_test: boolean;
      status: string;
      notes: string | null;
      partner_visibility: 'shared' | 'self_only';
      origin: 'coach' | 'self';
    }>
  >`
    select
      wa.id::text as assignment_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      wa.template_id::text as template_id,
      wa.microcycle_id::text as microcycle_id,
      t.name as template_name,
      t.format::text as template_format,
      t.day_position as template_day_position,
      -- is_test: a session is a TEST when it was scheduled from a coach calibration
      -- test — i.e. it carries the calibration_test_id FK (#34). Its purpose is to
      -- measure and feed the athlete's profile/resolver, not to train. Coach-owned and
      -- data-driven; the methodology group (running, race-sim…) does NOT identify a test
      -- (a VDOT track test and regular intervals share group 4; a HYROX EMOM and the
      -- HYROX competition share group 7).
      (wa.calibration_test_id is not null) as is_test,
      wa.status::text as status,
      wa.notes,
      wa.partner_visibility as partner_visibility,
      -- origin (mig 0090): 'self' = athlete's entreno libre (renders a "Libre"
      -- tag on iOS), 'coach' = prescribed plan session.
      wa.origin::text as origin
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for >= ${weekStartIso}::date
      and wa.scheduled_for <= ${weekEndIso}::date
      -- PUBLISH GATE: hide assignments whose week is still a coach DRAFT.
      -- All rows here belong to one week (weekStartIso = Monday in box tz), so a
      -- single weekly_plans lookup gates the whole result. Backward-compatible:
      -- existing data + /hoy's live-approve create NO draft row, so NOT EXISTS is
      -- true and everything stays visible exactly as before. Only weeks the coach
      -- explicitly saved as 'draft' (future create-in-draft flow) are hidden;
      -- 'published' and 'archived' weeks are shown.
      and not exists (
        select 1 from weekly_plans wp
        where wp.athlete_id = ${athlete_id as number}
          and wp.week_start = ${weekStartIso}::date
          and wp.status = 'draft'
      )
    order by wa.scheduled_for asc, wa.id asc
  `;

  // Per-session DERIVED metadata (est_duration / blocks_count / short_prescription).
  // Source of truth is the materialized template content (template_segments),
  // NOT program_week_templates.slots_json — once a week is materialized into
  // workout_assignments the per-session blocks live in templates/template_segments.
  // One batched lookup keyed by the week's distinct template_ids; sessions whose
  // template carries no segments simply get null fields (honest fallback on iOS).
  const templateIds = Array.from(
    new Set(rows.map((r) => r.template_id).filter((id): id is string => !!id)),
  );
  const summaries = await loadTemplateSummaries(templateIds);

  // The week's microcycle name (periodization phase). All assignments in a week
  // share one microcycle; we resolve the first non-null microcycle_id.
  const microcycleId = rows.find((r) => r.microcycle_id)?.microcycle_id ?? null;
  const [microciclo_name, weekMeta, weekState, has_next_week, pausedState, plan_starts_on] =
    await Promise.all([
      resolveMicrocicloName(microcycleId),
      // Coach-authored week meta from the source week template, resolved through the
      // assignment in ONE query: the athlete-facing "Foco de la semana"
      // (program_week_templates.focus) AND the per-rest-day recovery suggestions (#47).
      resolveWeekTemplateMeta(microcycleId),
      // El estado REAL de esta semana en `weekly_plans` — reutiliza el mismo lector
      // que ya usa el portón de visibilidad del conector (`shape-write.ts`), así que
      // esto no es una consulta nueva y aislada: es la misma fila que ya se mira
      // para saber si la semana está en borrador, ahora también por su `focus`.
      weekStates({ athlete_id, week_starts: [weekStartIso] }),
      // Whether the athlete can peek a NEXT week with real, published content
      // (drives the "Próxima semana" affordance). Relative to the returned week.
      hasPublishedWeek(athlete_id, isoDateString(addDays(weekStart, 7))),
      // #13 — lifecycle freeze state (paused/baja + the open pause's since/reason).
      loadPausedState(athlete_id),
      // Cuándo empieza lo ya programado, si cae después de esta ventana — para que
      // un estado vacío pueda decir «empieza el lunes 10» en vez de mentir.
      firstScheduledAfter(athlete_id, weekEndIso),
    ]);
  // El foco de LA SEMANA DEL ATLETA manda; el de la plantilla es el defecto
  // heredado (docs/DECISIONS.md — el foco vive en la semana, no solo en la
  // plantilla). Una semana en 'draft' no adelanta su foco por esta puerta: el
  // mismo portón que esconde sus sesiones (la NOT EXISTS de arriba) esconde su
  // foco propio, aunque `weekStates` lo lea crudo para quien SÍ puede verlo
  // (el coach en su panel, el conector).
  const focus = resolveAthleteFacingFocus(weekState.get(weekStartIso)!, weekMeta.focus);

  // C35 — partner_visibility is exposed as-is. The DB filter by athlete_id
  // already isolates each user's sessions, so the only rows here belong to
  // the caller. iOS uses this field to render the "shared with partner"
  // badge. No additional server-side filtering needed.
  const days: AthleteWeekDay[] = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
    const dayDate = isoDateString(addDays(weekStart, dow - 1));
    const daySessions = rows.filter((r) => r.iso_date === dayDate);
    return {
      day_of_week: dow,
      iso_date: dayDate,
      sessions: daySessions.map((s) => {
        const summary = s.template_id ? summaries.get(s.template_id) : undefined;
        return {
          assignment_id: s.assignment_id,
          template_id: s.template_id,
          format: s.template_format,
          slot: slotFromNotes(s.notes, s.template_day_position),
          // Session TITLE the athlete reads at a glance ("Entreno de pierna").
          // Source of truth = the coach's workout title (WeekSession.focus): the
          // materializer writes it into templates.name for inline sessions
          // (instantiate-program.ts → `session.focus?.trim() || name_base`), so
          // template_name already carries the focus when the coach set one. Falls
          // back to the template's own name, then a generic label — never empty.
          title: s.template_name ?? 'Sesión',
          // G5 — the REAL training modality (run/row/ski/bike/strength/functional/
          // core/mobility/other) of the session's PRINCIPAL block (the main work,
          // never the warmup mobility drills or the cooldown stretch). Derived
          // from the template's segments (each line's exercise modality is the
          // single source of truth; a per-line prescription override wins), or —
          // for a segment-less box CLOCK — from the prescription it declared. This
          // is what colors the iOS day dot. Falls back to the workout FORMAT
          // (amrap/emom/…) only for a template that states neither, so the field is
          // never empty. A free workout NEVER reaches that fallback: a format is
          // not a modality, and here we always know the real one.
          modality: summary?.modality ?? s.template_format,
          status: s.status,
          partner_visibility: s.partner_visibility,
          // 'self' = athlete's entreno libre (no prescrito), 'coach' = plan session.
          origin: s.origin,
          // DERIVED, additive. Null when the template has no segments to read.
          est_duration_minutes: summary?.est_duration_minutes ?? null,
          duration_unknown_reason: summary?.duration_unknown_reason ?? null,
          blocks_count: summary?.blocks_count ?? null,
          short_prescription: summary?.short_prescription ?? null,
          // A session is a TEST when its template stores measurable results
          // (computed in SQL above) — its purpose is to measure, not to train.
          is_test: s.is_test,
        };
      }),
      is_rest: daySessions.length === 0,
      // Día TIPADO (#47): sin asignaciones ⇒ 'rest', si no 'workout'. Para el
      // atleta, un día sin sesiones ES descanso (sus días libres salen de su
      // disponibilidad), así que rest = ausencia de sesiones.
      kind: (daySessions.length > 0 ? 'workout' : 'rest') as WeekDayKind,
      // Recuperación (oferta blanda): solo en días de descanso, tomada de la
      // plantilla por weekday canónico. Vacío si el día es de entreno o no hay
      // sugerencias para ese weekday.
      recovery_suggestions:
        daySessions.length === 0 ? (weekMeta.recoveryByDow.get(dow) ?? []) : [],
    };
  });

  return {
    week_start: weekStartIso,
    week_end: weekEndIso,
    today_iso: isoDateString(today),
    microciclo_name,
    // Athlete-facing week focus (a short coach line, no per-day detail). Null
    // when the week wasn't materialized from a month template / has no focus.
    focus,
    // True when a next week with published content exists (peek affordance).
    has_next_week,
    days,
    // #13 — the client shows "en pausa" when paused; the week structure is still
    // returned (no invented sessions), the flag just frames it.
    paused: pausedState.paused,
    paused_since: pausedState.paused_since,
    paused_reason: pausedState.paused_reason,
    // Null cuando no hay nada programado más adelante: el cliente dirá «se está
    // preparando» en vez de afirmar que el coach no ha publicado.
    plan_starts_on,
  };
}

/**
 * El foco que ve el atleta para SU semana: el override de `weekly_plans.focus`
 * manda; el de la plantilla (`program_week_templates.focus`, vía
 * `resolveWeekTemplateMeta`) es el defecto heredado; sin ninguno de los dos,
 * `null` (nunca se inventa una línea). Pura y exportada para poder probar las
 * cuatro combinaciones (semana / plantilla / ninguno / borrador) sin tocar la
 * base de datos.
 *
 * Un 'draft' NO adelanta su foco: es el mismo portón que ya esconde las
 * sesiones de esa semana (la NOT EXISTS de la consulta principal). `weekStates`
 * lee el foco CRUDO porque otros llamantes (el panel del coach, el conector) SÍ
 * pueden ver un borrador propio — aquí, en el lector del atleta, es donde se
 * aplica el portón.
 */
export function resolveAthleteFacingFocus(
  weekState: { state: WeekPublishState; focus: string | null },
  templateFocus: string | null,
): string | null {
  const weeklyFocus = weekState.state === 'draft' ? null : weekState.focus;
  return weeklyFocus ?? templateFocus;
}

/**
 * La primera fecha con trabajo programado DESPUÉS de `afterIso`, o null.
 *
 * Misma verja de publicación que el resto del fichero (`hasPublishedWeek`): una
 * semana todavía en borrador NO cuenta, porque para el atleta aún no existe.
 * Devuelve la fecha del primer entreno, no el lunes de su semana — el copy dice
 * literalmente cuándo empieza a entrenar, que es lo que pregunta el atleta.
 */
async function firstScheduledAfter(
  athlete_id: number | bigint,
  afterIso: string,
): Promise<string | null> {
  const rows = await sql<Array<{ starts_on: string }>>`
    select min(wa.scheduled_for)::text as starts_on
    from workout_assignments wa
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for > ${afterIso}::date
      and not exists (
        select 1 from weekly_plans wp
        where wp.athlete_id = ${athlete_id as number}
          and wp.week_start = date_trunc('week', wa.scheduled_for)::date
          and wp.status = 'draft'
      )
  `;
  return rows[0]?.starts_on ?? null;
}

/**
 * #13 — the athlete's lifecycle freeze state for the week payload. `paused` is true
 * for any non-`activo` lifecycle_status (pausado OR baja — both are frozen). The
 * `paused_since`/`paused_reason` come from the currently-OPEN pause interval
 * (end_date null); a baja athlete has no open pause, so those stay null. Reads are
 * null-safe: a missing athlete simply reads as not paused.
 */
async function loadPausedState(
  athlete_id: number | bigint,
): Promise<{ paused: boolean; paused_since: string | null; paused_reason: string | null }> {
  const rows = await sql<
    Array<{ lifecycle_status: string; paused_since: string | null; paused_reason: string | null }>
  >`
    select
      a.lifecycle_status::text as lifecycle_status,
      p.start_date::text as paused_since,
      p.reason as paused_reason
    from athletes a
    left join lateral (
      select start_date, reason from athlete_pauses
      where athlete_id = a.id and end_date is null
      order by start_date desc
      limit 1
    ) p on true
    where a.id = ${athlete_id as number}
    limit 1
  `;
  const r = rows[0];
  const paused = r != null && r.lifecycle_status !== 'activo';
  return {
    paused,
    paused_since: paused ? r!.paused_since : null,
    paused_reason: paused ? r!.paused_reason : null,
  };
}

type WeekTemplateMeta = {
  /** Athlete-facing "Foco de la semana" (program_week_templates.focus), or null. */
  focus: string | null;
  /**
   * Recovery suggestions keyed by the template's CANONICAL weekday (1=Mon..7=Sun).
   * Only rest days that carry suggestions appear. The athlete read-path attaches
   * these to its rest day of the SAME weekday (honest weekday match — no invention).
   */
  recoveryByDow: Map<number, RecoverySuggestion[]>;
};

/**
 * Resolve THIS week's coach-authored meta = the `program_week_templates` row that
 * materialized into this microcycle: its athlete-facing `focus` line AND its
 * per-rest-day recovery suggestions, in ONE query. The materializer pushes one
 * microcycle per week in position order into `athlete_month_assignments.microcycle_ids[]`,
 * so the microcycle's 1-based index there is the week's position within the month.
 * We pick the Nth week template by `program_month_weeks.position` (OFFSET N-1) to
 * stay agnostic of whether positions are 0- or 1-based. Empty (focus null, empty
 * map) when the microcycle isn't part of a month assignment (free-planned week) —
 * the athlete then sees no focus/recovery, never invented ones.
 */
async function resolveWeekTemplateMeta(microcycleId: string | null): Promise<WeekTemplateMeta> {
  const empty: WeekTemplateMeta = { focus: null, recoveryByDow: new Map() };
  if (!microcycleId) return empty;
  const rows = await sql<Array<{ focus: string | null; slots_json: unknown }>>`
    select w.focus, w.slots_json
    from athlete_month_assignments ama
    join lateral (
      select pmw.week_template_id
      from program_month_weeks pmw
      where pmw.month_template_id = ama.month_template_id
      order by pmw.position
      offset greatest(array_position(ama.microcycle_ids, ${microcycleId}::bigint) - 1, 0)
      limit 1
    ) wk on true
    join program_week_templates w on w.id = wk.week_template_id
    where ${microcycleId}::bigint = any(ama.microcycle_ids)
    limit 1
  `;
  const row = rows[0];
  if (!row) return empty;
  const focus = row.focus?.trim();
  return {
    focus: focus ? focus : null,
    recoveryByDow: extractRecoveryByDow(row.slots_json),
  };
}

/**
 * Extract a map dow → recovery suggestions from a week template's slots_json. Only
 * days that actually carry suggestions land in the map; each list is validated
 * (recoverySuggestionSchema) so a malformed stored shape degrades to nothing, never
 * a fabricated hint. Recovery is a rest-day-only concept (the write path enforces
 * it), so we simply read whatever suggestions a day carries.
 */
function extractRecoveryByDow(slotsJson: unknown): Map<number, RecoverySuggestion[]> {
  const out = new Map<number, RecoverySuggestion[]>();
  const days = (slotsJson as { days?: unknown[] } | null)?.days;
  if (!Array.isArray(days)) return out;
  for (const d of days) {
    const day = d as { day_of_week?: unknown; recovery_suggestions?: unknown };
    const dow = Number(day.day_of_week);
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) continue;
    const parsed = z.array(recoverySuggestionSchema).safeParse(day.recovery_suggestions);
    if (parsed.success && parsed.data.length > 0) out.set(dow, parsed.data);
  }
  return out;
}

/**
 * Whether the athlete has a NON-DRAFT week with at least one assignment starting
 * on `weekStartIso` (a Monday). Mirrors the publish gate in the main week query
 * so a still-draft next week reads as "not available yet" (no peek), keeping the
 * weekly-delivery promise (next week unlocks Saturday) honest.
 */
async function hasPublishedWeek(
  athlete_id: number | bigint,
  weekStartIso: string,
): Promise<boolean> {
  const weekEndIso = isoDateString(addDays(parseIsoDate(weekStartIso), 6));
  const rows = await sql<Array<{ has_next: boolean }>>`
    select exists (
      select 1
      from workout_assignments wa
      where wa.athlete_id = ${athlete_id as number}
        and wa.scheduled_for >= ${weekStartIso}::date
        and wa.scheduled_for <= ${weekEndIso}::date
        and not exists (
          select 1 from weekly_plans wp
          where wp.athlete_id = ${athlete_id as number}
            and wp.week_start = ${weekStartIso}::date
            and wp.status = 'draft'
        )
    ) as has_next
  `;
  return rows[0]?.has_next ?? false;
}

type TemplateSummary = {
  est_duration_minutes: number | null;
  duration_unknown_reason: DurationUnknownReason | null;
  blocks_count: number | null;
  short_prescription: string | null;
  // G5 — the session's REAL modality (the colorable run/row/ski/bike/strength/…),
  // derived from its segments. Null when no segment carries a modality.
  modality: string | null;
};

/** A template with NO segments whose `meta_json.prescription` describes the
 *  session anyway — the box CLOCK written by the entreno libre (see
 *  create-free-workout.ts). It is the one segment-less template that still knows
 *  its own modality and, when the format bounds it, its duration. */
type ClockRow = {
  template_id: string;
  prescription: unknown;
};

type SegmentRow = {
  template_id: string;
  block_position: number | null;
  block_title: string | null;
  position: number;
  params_json: Record<string, unknown> | null;
  /** The TYPED prescription — the source of truth for this line's dosage, and
   *  the only one that can close a clock honestly. `params_json` is the legacy
   *  flat mirror and states neither `for_time` nor a pace. */
  prescription_json: unknown;
  // exercises.modality is the single source of truth (migration 0053, NOT NULL);
  // a per-line prescription_json.modality override wins when set on the segment.
  exercise_modality: string | null;
  prescription_modality: string | null;
};

// Batched per-template segment aggregation. Returns a map template_id ->
// derived summary. A template with zero segments and no clock prescription is
// absent from the map (its sessions get null fields). NOTE: `block_position`
// groups segments into blocks (warmup / metcon / cooldown …); `block_title`
// names them.
async function loadTemplateSummaries(
  templateIds: string[],
): Promise<Map<string, TemplateSummary>> {
  const out = new Map<string, TemplateSummary>();
  if (templateIds.length === 0) return out;

  const segs = await sql<SegmentRow[]>`
    select
      ts.template_id::text as template_id,
      ts.block_position as block_position,
      ts.block_title as block_title,
      ts.position as position,
      ts.params_json as params_json,
      ts.prescription_json as prescription_json,
      e.modality as exercise_modality,
      ts.prescription_json->>'modality' as prescription_modality
    from template_segments ts
    left join exercises e on e.id = ts.exercise_id
    where ts.template_id = any(${templateIds}::bigint[])
    order by ts.template_id, ts.block_position nulls first, ts.position
  `;

  // Group rows per template, then derive blocks_count / short_prescription /
  // est_duration_minutes in one pass.
  const byTemplate = new Map<string, SegmentRow[]>();
  for (const row of segs) {
    const list = byTemplate.get(row.template_id) ?? [];
    list.push(row);
    byTemplate.set(row.template_id, list);
  }

  for (const [templateId, list] of byTemplate) {
    // Distinct blocks: prefer block_position grouping; fall back to one block
    // when no segment carries a position (legacy flat templates).
    const positions = new Set(
      list.map((r) => (r.block_position == null ? '_flat' : String(r.block_position))),
    );
    const blocks_count = positions.size > 0 ? positions.size : null;

    // Ordered, de-duplicated block titles for the one-line summary.
    const titles: string[] = [];
    const seenTitles = new Set<string>();
    for (const r of list) {
      const title = r.block_title?.trim();
      if (title && !seenTitles.has(title)) {
        seenTitles.add(title);
        titles.push(title);
      }
    }
    const short_prescription = buildShortPrescription(titles, blocks_count);

    const duration = sessionDuration(list.map(segmentDurationItem));

    const modality = principalModality(list);

    out.set(templateId, {
      est_duration_minutes: duration.known ? duration.minutes : null,
      duration_unknown_reason: duration.known ? null : duration.reason,
      blocks_count,
      short_prescription,
      modality,
    });
  }

  // CLOCK templates (entreno libre run as a bare box timer): no segments, so the
  // loop above never saw them, but their `meta_json.prescription` states the
  // session's real modality and — when the format bounds the clock — its exact
  // duration. Read ONLY for ids the segment pass left uncovered, so a template can
  // never be described twice.
  const uncovered = templateIds.filter((id) => !out.has(id));
  if (uncovered.length > 0) {
    const clocks = await sql<ClockRow[]>`
      select t.id::text as template_id, t.meta_json->'prescription' as prescription
      from templates t
      where t.id = any(${uncovered}::bigint[])
        and t.meta_json ? 'prescription'
    `;
    for (const row of clocks) {
      const parsed = safeParsePrescription(row.prescription);
      if (!parsed.success) continue;
      // The SAME reader as the segment path — a box clock is one principal item.
      // Two duration formulas in one file is exactly how the athlete's week and
      // the coach's queue came to disagree about adherence, TSS and stations.
      const duration = sessionDuration([
        { prescription: parsed.data, role: 'principal' },
      ]);
      out.set(row.template_id, {
        est_duration_minutes: duration.known ? duration.minutes : null,
        duration_unknown_reason: duration.known ? null : duration.reason,
        // No segments means nothing to count and nothing to name: the session
        // title already reads as its shape ("EMOM 10 · cada 1:00").
        blocks_count: null,
        short_prescription: null,
        modality: parsed.data.modality ?? null,
      });
    }
  }

  return out;
}

// One segment as a duration input: its TYPED prescription plus where it sits in
// the session. The role matters because it decides whether an unwritten clock
// kills the session's number: an open PRINCIPAL block does (the HYROX sim's
// warm-up and cool-down really do add to 26 min, and 26 for a 73-min race is the
// bug this replaced), while an unwritten mobility drill only makes the number a
// floor. A segment whose prescription does not parse contributes no clock —
// never a fabricated one.
function segmentDurationItem(r: SegmentRow): SessionDurationItem {
  const parsed = r.prescription_json ? safeParsePrescription(r.prescription_json) : null;
  return {
    prescription: parsed && parsed.success ? parsed.data : null,
    role: prescriptionRole(classifyBlock(r.block_title)),
  };
}

// The block's role in the vocabulary the domain speaks. `main` (an untitled
// block) counts as principal: an untitled block is the work until proven otherwise.
function prescriptionRole(role: BlockRole): PrescriptionRole {
  if (role === 'warmup') return 'calentamiento';
  if (role === 'cooldown') return 'vuelta';
  return 'principal';
}

// Per-segment modality: a deliberate per-line prescription override wins, else
// the exercise's intrinsic modality (the NOT-NULL single source of truth set by
// migration 0053). Null only when neither is present (orphan/legacy segment).
function segmentModality(r: SegmentRow): string | null {
  return r.prescription_modality ?? r.exercise_modality ?? null;
}

// The session's REAL modality for the weekly card (G5). A session can mix
// modalities (a HYROX sim, a compromised block); the card shows ONE colorable
// dot, so we pick the DOMINANT modality by segment count. Tie-break is
// deterministic: the first modality to reach the max count in segment order
// (block_position, position — the query's ORDER BY), so the result is stable.
// Returns null when no segment carries a modality (caller falls back to format).
function dominantModality(segments: SegmentRow[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const seg of segments) {
    const m = segmentModality(seg);
    if (!m) continue;
    const next = (counts.get(m) ?? 0) + 1;
    counts.set(m, next);
    if (next > bestCount) {
      bestCount = next;
      best = m;
    }
  }
  return best;
}

// A block's role inferred from its coach-authored title. The materializer
// preserves block titles, so we read them to find the PRINCIPAL (main work)
// block — the one whose modality is the session's actual point — instead of
// letting a warmup with many mobility drills or a cooldown stretch skew the
// weekly card's dot. Untitled blocks are treated as 'main' (no skew signal).
type BlockRole = 'warmup' | 'cooldown' | 'principal' | 'main';

// Lowercase + strip diacritics so "Activación" / "activacion" / "MIÉ" match.
function normalizeBlockTitle(title: string | null): string {
  return (title ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function classifyBlock(title: string | null): BlockRole {
  const t = normalizeBlockTitle(title);
  if (!t) return 'main';
  if (t.includes('principal')) return 'principal';
  if (t.includes('calent') || t.includes('warm') || t.includes('activaci')) return 'warmup';
  if (
    t.includes('calma') ||
    t.includes('cooldown') ||
    t.includes('cool down') ||
    t.includes('cool-down') ||
    t.includes('enfriamiento')
  ) {
    return 'cooldown';
  }
  return 'main';
}

// The session's PRINCIPAL-block modality for the weekly card (G5). Groups the
// segments into blocks (by block_position; flat fallback), classifies each by
// title, then derives the dominant modality WITHIN the principal block: the
// explicitly "principal"-named block when present, else the largest non-warmup/
// cooldown block (ties broken by segment order for determinism). Falls back to
// the whole-session dominant modality when no main block carries a modality
// (e.g. every block is untitled or warmup/cooldown only), so it's never lost.
function principalModality(segments: SegmentRow[]): string | null {
  // Group preserving first-seen order (the query orders by block_position, position).
  const order: string[] = [];
  const groups = new Map<string, SegmentRow[]>();
  const roles = new Map<string, BlockRole>();
  for (const seg of segments) {
    const key = seg.block_position == null ? '_flat' : String(seg.block_position);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
      roles.set(key, classifyBlock(seg.block_title));
    }
    groups.get(key)!.push(seg);
  }

  // Candidate blocks, most-specific first: an explicit principal block wins
  // outright; else the main (non-warmup/cooldown) blocks; else every block.
  const principalKeys = order.filter((k) => roles.get(k) === 'principal');
  const mainKeys = order.filter(
    (k) => roles.get(k) === 'principal' || roles.get(k) === 'main',
  );
  const candidates =
    principalKeys.length > 0 ? principalKeys : mainKeys.length > 0 ? mainKeys : order;

  // The principal block = the candidate with the most segments; ties keep the
  // earliest (order is deterministic), so the result is stable across requests.
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const k of candidates) {
    const count = groups.get(k)!.length;
    if (count > bestCount) {
      bestCount = count;
      bestKey = k;
    }
  }

  const principal = bestKey ? groups.get(bestKey)! : segments;
  return dominantModality(principal) ?? dominantModality(segments);
}

// One-line human summary of a session's structure. Prefers the named blocks
// (e.g. "Calentamiento · Series · Vuelta a la calma"), capped at 3 to stay one
// line; falls back to a block count. Null when there's nothing to say.
function buildShortPrescription(titles: string[], blocksCount: number | null): string | null {
  if (titles.length > 0) {
    const shown = titles.slice(0, 3);
    const suffix = titles.length > shown.length ? ` +${titles.length - shown.length}` : '';
    return shown.join(' · ') + suffix;
  }
  if (blocksCount && blocksCount > 0) {
    return `${blocksCount} ${blocksCount === 1 ? 'bloque' : 'bloques'}`;
  }
  return null;
}

// Resolve the week's microciclo label = the COACH'S microciclo name (agnostic,
// no hardcoded periodization vocabulary). The materializer records every assigned
// plan in `athlete_month_assignments`, whose `microcycle_ids[]` holds the
// microcycles it created and whose `month_template_id` points at the coach's
// `program_month_templates` row — the same microciclo the coach named in su
// biblioteca. We read that template's name. Null when the microcycle wasn't
// materialized from a month template (e.g. a block-only / free-planned week): the
// athlete simply sees no label, never an invented one.
async function resolveMicrocicloName(microcycleId: string | null): Promise<string | null> {
  if (!microcycleId) return null;
  const rows = await sql<Array<{ name: string | null }>>`
    select pmt.name
    from athlete_month_assignments ama
    join program_month_templates pmt on pmt.id = ama.month_template_id
    where ${microcycleId}::bigint = any(ama.microcycle_ids)
    limit 1
  `;
  return rows[0]?.name ?? null;
}

function slotFromNotes(notes: string | null, dayPos: string | null): 'am' | 'pm' {
  if (notes?.includes('pm')) return 'pm';
  if (notes?.includes('am')) return 'am';
  if (dayPos?.toUpperCase().includes('PM')) return 'pm';
  return 'am';
}
