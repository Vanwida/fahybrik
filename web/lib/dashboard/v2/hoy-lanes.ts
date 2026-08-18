import 'server-only';

// v2 Hoy — the 4-LANE triage model. The flagship screen organizes the coach's
// day into four ACTION buckets (not the v1 critico/vigilar severity split):
//
//   1. fallo_sesiones    — missed work / low adherence / no active plan.
//   2. listo_progresar   — earned the next step (high adherence, no flags).
//   3. vigilar_fisiologia — biometric/readiness flags (fatigue, low readiness).
//   4. espera_respuesta  — athlete is waiting on a coach reply.
//
// Mapping is FAITHFUL to the real loaders — it reuses the exact fields already
// produced for v1 (no new queries, no invented athletes):
//   • roster rows  → fetchAthletesForCoach (AthleteRow: compliance_pct,
//                    readiness_score, programming_status, alert_*, week_ok, level…)
//   • threads      → listThreadsForCoach (unread_count → "espera respuesta")
//   • inbox alerts → loadCoachInbox (alert_inactivity reinforces "falló sesiones")
//
// An athlete surfaces in AT MOST ONE of the three roster lanes (priority:
// falló > vigilar > listo) so a low-adherence AND fatigued athlete shows once,
// in the most actionable lane. Messages are thread-based and INDEPENDENT: the
// same athlete may also sit in "espera respuesta" (two distinct coach actions).

import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import type { CoachThreadSummary } from '@/lib/chat/service';
import type { CoachInbox, InboxDiffRow } from '@/lib/dashboard/coach/inbox';
import type { FiredTrigger } from '@fahybrid/shared/domain/coach/weekly-evaluation';
import { readinessBucket } from '@/lib/dashboard/constants/readiness';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { sql } from '@/lib/db';
import {
  resolveSequenceForAthlete,
  type ResolveFailureReason,
  type ResolveSequenceResult,
} from '@/lib/dashboard/coach/assign-sequence';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import {
  SEQUENCE_DAYS_MAX,
  SEQUENCE_DAYS_MIN,
} from '@fahybrid/shared/schema/program-sequences';
import {
  estadoProgramaAtleta,
  recetaDesdeFallo,
  tieneHueco,
  type EstadoProgramaAtleta,
  type EstadoRecetaNivel,
} from '@fahybrid/shared/domain/coach/hoy-asignacion';

// ── Thresholds (single source: signal-config) ────────────────────────────────
/** Compliance below this % counts as "falló sesiones". */
const COMPLIANCE_ATTENTION_MAX = SIGNAL_THRESHOLDS.compliance_attention_max_pct; // 70
/**
 * "Listo para progresar" adherence FALLBACK floor. The first-class signal is the
 * progress-readiness engine (transition_ready: phase-near-end + benchmark
 * improving) — when it fires for an athlete they land here regardless of this
 * number. This heuristic (clean week + strong adherence + no alert) is the honest
 * fallback ONLY for athletes the engine can't judge yet (no benchmark delta / no
 * active microciclo), so a compliant athlete still surfaces.
 */
const READY_ADHERENCE_MIN = 90;

// ── Lane identity ─────────────────────────────────────────────────────────────

export type V2LaneId =
  | 'fallo_sesiones'
  | 'listo_progresar'
  | 'vigilar_fisiologia'
  | 'espera_respuesta';

/** Action a card can offer; the page wires these to links/handlers. */
export type V2LaneAction =
  | 'ver'
  | 'mensaje'
  | 'responder'
  // "Descargar carga": crea una propuesta de ajuste de semana (suavizar/descanso)
  // por la vía existente — el coach la revisa en el strip de Ajuste de semana.
  | 'descargar_carga';

export interface V2LaneCard {
  /** Stable key within its lane. */
  id: string;
  athlete_id: string;
  athlete_name: string;
  /** Real level name from athlete_levels.name (e.g. 'N1'–'N5'); null = not assigned. */
  level: string | null;
  /** One-line reason the athlete is in this lane. */
  reason: string;
  /** Optional adherence to draw a mini bar (null when no scheduled work). */
  adherence_pct: number | null;
  /** Optional readiness 0–100 for the physiology lane signal. */
  readiness_score: number | null;
  /** Optional age label for message cards (e.g. "hace 3 h"). */
  age_label: string | null;
  /** Unread count for message cards (badge when > 1). */
  unread_count: number | null;
  /** SOFT INFO: the athlete completed this week's sessions OUT of their planned
   *  order (true = "cumplió pero cambió el orden / los días"). NO penalty — drives
   *  a calm info chip, never an error. Sourced from AthleteRow.order_altered. */
  order_altered: boolean;
  /** Actions to render, in order. */
  actions: V2LaneAction[];
}

export interface V2Lane {
  id: V2LaneId;
  title: string;
  /** Dot token color var for the lane header. */
  dot_var: string;
  cards: V2LaneCard[];
  /** Total in the lane (cards may be capped by the page for display). */
  count: number;
}

export interface V2HoyData {
  lanes: V2Lane[];
  total_athletes: number;
  /** Distinct athletes flagged across the three roster lanes (red top chip). */
  need_attention_count: number;
  /** Athletes waiting on a reply (blue top chip). */
  awaiting_reply_count: number;
  /** Athletes with an algorithm-suggested level pending coach confirmation. */
  nivel_sugerido_cards: V2NivelSugeridoCard[];
  /**
   * Classified athletes (level set) with NO active sequence enrollment: the
   * coach's one-click auto-assignment proposals — or, when their (level × days)
   * cell can't resolve, an ACTIONABLE "why not" so it's NEVER silently hidden.
   */
  asignacion_sugerida_cards: V2AsignacionSugeridaCard[];
  /**
   * Athletes whose CURRENT microciclo has finished: a one-click proposal to walk
   * the sequence to the next microciclo (or repeat / level up / close per policy).
   */
  siguiente_microciclo_cards: V2SiguienteMicrocicloCard[];
  /**
   * Pending weekly-adjustment proposals from Coach IA (the cron-generated
   * `week_adjustment_proposals`). Already computed by the inbox loader as
   * `InboxWeekAdjustmentItem` — here we just lift them to their own decision strip.
   */
  week_adjustment_cards: V2WeekAdjustmentCard[];
}

/**
 * A pending weekly-adjustment proposal surfaced as a decision card. Mirrors the
 * inbox's `InboxWeekAdjustmentItem` (no new data path) — accept/reject wire to the
 * existing /week-adjustment/[proposalId]/approve|reject endpoints.
 */
export interface V2WeekAdjustmentCard {
  /** Stable React key: `week_adjustment:${proposal_id}`. */
  id: string;
  athlete_id: number;
  athlete_name: string;
  proposal_id: number;
  /** ISO week-start (YYYY-MM-DD) of the week being adjusted. */
  week_start: string;
  /** Recommendation title, e.g. "Ajuste de volumen" / "Cambio de sesión". */
  title: string;
  /** Coach-facing summary (coach_summary, falling back to the AI rationale). */
  summary: string;
  /** Up to 3 day-level changes (día · antes → después). */
  diff_rows: InboxDiffRow[];
  /** Changes beyond the shown rows (drives the "+N más" hint). */
  extra_change_count: number;
  /**
   * Señales que dispararon la propuesta (cumplimiento, readiness, HRV, sesiones
   * perdidas) — el "por qué" para que el coach no apruebe a ciegas. Vacío cuando
   * no hay context_pack o ninguna regla disparó. Read-only desde datos existentes.
   */
  triggers: FiredTrigger[];
}

/**
 * A decision card for a new athlete whose level has been algorithmically
 * suggested but not yet confirmed by the coach.
 *
 * Rendered above the 4-lane board; requires two interactive buttons
 * (Aceptar / Ver atleta) so it lives outside the standard V2LaneCard shape.
 */
export interface V2NivelSugeridoCard {
  /** Stable React key: `nivel:${athlete_id}` */
  id: string;
  athlete_id: number;
  athlete_name: string;
  /** Confirmed level_id to write on accept (FK → athlete_levels.id). */
  suggested_level_id: number;
  /** Short code, e.g. "N2". */
  suggested_level_name: string;
  /** Human label, e.g. "Desarrollo". */
  suggested_level_label: string;
  confidence: 'low' | 'medium' | 'high';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Level is derived by the shared `athleteLevel()` util (lib/dashboard/v2/level)
// so every surface — and every lane within this screen — agrees on the rung.

/** True when the athlete has no usable plan / a structurally broken week. */
function hasPlanGap(a: AthleteRow): boolean {
  return (
    a.programming_status === 'no_month' ||
    a.programming_status === 'month_2_pending' ||
    a.programming_status === 'empty_week'
  );
}

/** True when the athlete has a fatigue/readiness biometric flag. */
function hasPhysiologyFlag(a: AthleteRow): boolean {
  return a.readiness_score != null && readinessBucket(a.readiness_score) !== 'ok';
}

/** True when adherence is below the attention threshold. */
function lowAdherence(a: AthleteRow): boolean {
  return a.compliance_pct != null && a.compliance_pct < COMPLIANCE_ATTENTION_MAX;
}

// ── Builders per lane ─────────────────────────────────────────────────────────

function fallaReason(a: AthleteRow, inactivityDays: number | null): string {
  if (a.programming_status === 'no_month') return 'Sin plan activo esta semana.';
  if (a.programming_status === 'month_2_pending') return 'Falta el siguiente bloque del plan.';
  if (a.programming_status === 'empty_week') return 'Semana sin sesiones programadas.';
  if (inactivityDays != null) return `${inactivityDays} días sin completar ni registrar nada.`;
  if (a.compliance_pct != null) return `Solo ${a.compliance_pct}% de la semana completado.`;
  return 'Sesiones sin completar esta semana.';
}

function physioReason(a: AthleteRow): string {
  if (a.alert_label) return a.alert_label;
  if (a.readiness_score != null) {
    const bucket = readinessBucket(a.readiness_score);
    return bucket === 'low'
      ? `Readiness en rojo (${a.readiness_score}%) — fatiga alta.`
      : `Readiness con cautela (${a.readiness_score}%).`;
  }
  return 'Señal fisiológica a vigilar.';
}

// ── Level suggestion query ────────────────────────────────────────────────────

interface NivelSugeridoRow {
  athlete_id: string;
  athlete_name: string;
  suggested_level_id: string;
  suggested_level_name: string;
  suggested_level_label: string;
  level_confidence: string;
}

/**
 * Returns all athletes for this coach that have a suggested level but no
 * confirmed level yet. Called by the page alongside the main loaders.
 */
export async function fetchNivelSugeridoCards(
  coachId: bigint | number,
): Promise<V2NivelSugeridoCard[]> {
  const rows = await sql<NivelSugeridoRow[]>`
    SELECT
      a.id::text                   AS athlete_id,
      a.full_name                  AS athlete_name,
      a.suggested_level_id::text   AS suggested_level_id,
      al.name                      AS suggested_level_name,
      al.label                     AS suggested_level_label,
      a.level_confidence
    FROM athletes a
    JOIN athlete_levels al ON al.id = a.suggested_level_id
    WHERE a.coach_id = ${coachId as number}
      AND a.suggested_level_id IS NOT NULL
      AND a.level_id IS NULL
    ORDER BY a.created_at ASC
  `;

  return rows.map((r) => ({
    id: `nivel:${r.athlete_id}`,
    athlete_id: Number(r.athlete_id),
    athlete_name: r.athlete_name,
    suggested_level_id: Number(r.suggested_level_id),
    suggested_level_name: r.suggested_level_name,
    suggested_level_label: r.suggested_level_label,
    confidence: r.level_confidence as V2NivelSugeridoCard['confidence'],
  }));
}

// ── Auto-assignment proposals (Hoy) ───────────────────────────────────────────
//
// For each CLASSIFIED athlete with NO active sequence enrollment we resolve their
// (level × days) sequence cell via the SAME `resolveSequenceForAthlete` contract
// the assign endpoint uses (single source of truth — no parallel resolution).
//
//   · ok        → an "Asignación sugerida" card: accept → one POST materializes
//                 the first microciclo. The card shows the first microciclo's name
//                 + week count so the coach SEES what they're approving.
//   · why-not   → an ACTIONABLE card (e.g. "no hay secuencia para N4·5d → crear
//                 una"). NEVER silently hidden (the failure mode of the old B6).
//
// `not_classified` athletes are intentionally EXCLUDED here: that's the
// NivelSugeridoCard's job (confirm level first), so we don't double-surface them.

/**
 * Lo que le falta a un atleta clasificado sin inscripción de secuencia. La tarjeta
 * lleva LOS DOS EJES separados (shared/domain/coach/hoy-asignacion):
 *
 *   · `programa` — el hecho del atleta: nunca tuvo bloque, o el suyo terminó. Es
 *     el TITULAR. No depende de lo que el coach tenga montado.
 *   · `receta`   — lo que falta en su celda (nivel × días). Solo explica por qué
 *     no cabe la propuesta de un clic, y su arreglo es del MÉTODO.
 *
 * Antes solo existía el segundo, y hablaba por el primero: Marc (bloque de
 * biblioteca terminado el 26 de julio) y Guillem (que nunca tuvo ninguno) salían
 * los dos con «No hay secuencia para N3·5d» y un único botón que llevaba a
 * periodización. Ver docs/coach-ux-recorrido.html.
 *
 * Dos formas, discriminadas por `kind`:
 *   · 'ok'     → la receta resuelve; se puede proponer el primer microciclo.
 *   · 'blocked'→ no resuelve; el titular sigue siendo del atleta y las dos
 *                salidas (atleta / método) van separadas.
 */
export type V2AsignacionSugeridaCard =
  | {
      kind: 'ok';
      /** Stable React key: `asig:${athlete_id}`. */
      id: string;
      athlete_id: number;
      athlete_name: string;
      /** Real level code from athlete_levels.name (e.g. "N2"). */
      level_name: string;
      /** Training days per week resolved for the athlete. */
      days_per_week: number;
      /** Eje A — qué le pasó a SU programa (titular de la tarjeta). */
      programa: EstadoProgramaAtleta;
      /** Name of the FIRST microciclo to materialize on accept. */
      first_microciclo_name: string;
      /** Weeks defined in that first microciclo (via program_month_weeks). */
      first_microciclo_weeks: number;
    }
  | {
      kind: 'blocked';
      id: string;
      athlete_id: number;
      athlete_name: string;
      /** Real level code (always present — these athletes are classified). */
      level_name: string;
      /** Eje A — qué le pasó a SU programa (titular de la tarjeta). */
      programa: EstadoProgramaAtleta;
      /** Eje B — qué falta en su celda, tipado (nunca hablando por el atleta). */
      receta: EstadoRecetaNivel;
      /** The structured "why not" code from the resolver. */
      reason: ResolveFailureReason;
      /** Human one-liner from the resolver (e.g. "No hay secuencia para N4·5d."). */
      message: string;
    };

type EligibleAthleteRow = {
  athlete_id: string;
  athlete_name: string;
};

/** El recibo de microciclo más reciente por atleta (eje A). */
type UltimoReciboRow = {
  athlete_id: string;
  end_date: string;
  month_name: string | null;
};

function recetaDesdeResolver(
  res: Extract<ResolveSequenceResult, { ok: false }>,
): EstadoRecetaNivel {
  const nivel = res.athlete?.level_name ?? 'su nivel';
  const dias = res.athlete?.training_days_per_week;
  const celda = dias != null ? `${nivel} · ${dias} días` : nivel;
  return recetaDesdeFallo({
    reason: res.reason,
    celda,
    dias: dias ?? null,
    min: SEQUENCE_DAYS_MIN,
    max: SEQUENCE_DAYS_MAX,
  });
}

type FirstItemPreviewRow = {
  athlete_id: string;
  name: string;
  week_count: number;
};

/**
 * Compute auto-assignment proposals for every classified athlete who follows
 * the shared periodization and has no active sequence enrollment yet.
 * `plan_mode = personal` is out: that athlete is not waiting on the matrix.
 * Resolution uses `resolveSequenceForAthlete` (the assign endpoint's contract)
 * so the card and the action can never diverge.
 *
 * Degrades safely: any unexpected error on a single athlete drops that athlete
 * from the strip rather than failing the page (the page also catch-wraps us).
 */
export async function fetchAsignacionSugeridaCards(
  coachId: bigint | number,
): Promise<V2AsignacionSugeridaCard[]> {
  // Eligible = classified (level_id set) AND no active enrollment. Ordered oldest
  // first so the longest-unassigned athlete surfaces at the front of the strip.
  const eligible = await sql<EligibleAthleteRow[]>`
    SELECT a.id::text AS athlete_id, a.full_name AS athlete_name
    FROM athletes a
    WHERE a.coach_id = ${coachId as number}
      AND a.level_id IS NOT NULL
      AND a.plan_mode <> 'personal'
      AND NOT EXISTS (
        SELECT 1 FROM athlete_sequence_progress asp
        WHERE asp.athlete_id = a.id AND asp.status = 'active'
      )
    ORDER BY a.created_at ASC
  `;
  if (eligible.length === 0) return [];

  // Resolve each athlete's cell via the real contract.
  const resolutions = await Promise.all(
    eligible.map(async (row) => {
      const athleteId = Number(row.athlete_id);
      try {
        const res = await resolveSequenceForAthlete(athleteId, coachId);
        return { row, res };
      } catch {
        // Integrity throw (athlete vanished mid-read) — drop, don't fail the strip.
        return null;
      }
    }),
  );

  // Collect the first microciclo (position 1) of each resolvable sequence so we
  // can show its name + week count in ONE batched query (DRY with secuencias:
  // week_count = count of program_month_weeks rows for the template).
  const firstItemByAthlete = new Map<string, { month_template_id: number | bigint }>();
  for (const r of resolutions) {
    if (r?.res.ok) {
      const first =
        r.res.sequence.items.find((it) => it.position === 1) ?? r.res.sequence.items[0]!;
      firstItemByAthlete.set(r.row.athlete_id, {
        month_template_id: first.month_template_id,
      });
    }
  }

  const previewByAthlete = new Map<string, { name: string; week_count: number }>();
  if (firstItemByAthlete.size > 0) {
    const monthIds = [...new Set([...firstItemByAthlete.values()].map((v) => v.month_template_id))];
    const previews = await sql<FirstItemPreviewRow[]>`
      SELECT pmt.id::text AS athlete_id,
             pmt.name      AS name,
             (SELECT count(*) FROM program_month_weeks pmw
               WHERE pmw.month_template_id = pmt.id)::int AS week_count
      FROM program_month_templates pmt
      WHERE pmt.id = ANY(${monthIds}::bigint[])
        -- Defensive (0164): a sequence item can never legally point at a personal
        -- plan (saveCoachSequence rejects it at write time) — this is a second
        -- backstop so a future write-path regression degrades to "no preview"
        -- instead of showing one athlete's bespoke plan on another's card.
        AND pmt.athlete_id IS NULL
    `;
    const byTemplate = new Map<string, { name: string; week_count: number }>();
    for (const p of previews) {
      byTemplate.set(p.athlete_id, { name: p.name, week_count: p.week_count });
    }
    for (const [athleteId, { month_template_id }] of firstItemByAthlete) {
      const preview = byTemplate.get(String(month_template_id));
      if (preview) previewByAthlete.set(athleteId, preview);
    }
  }

  const athleteIds = eligible.map((e) => Number(e.athlete_id));
  const recibos = await sql<UltimoReciboRow[]>`
    SELECT DISTINCT ON (ama.athlete_id)
      ama.athlete_id::text AS athlete_id,
      to_char(ama.end_date, 'YYYY-MM-DD') AS end_date,
      pmt.name AS month_name
    FROM athlete_month_assignments ama
    LEFT JOIN program_month_templates pmt ON pmt.id = ama.month_template_id
    WHERE ama.athlete_id = ANY(${athleteIds}::bigint[])
    ORDER BY ama.athlete_id, ama.start_date DESC
  `;
  const reciboByAthlete = new Map<string, UltimoReciboRow>();
  for (const rec of recibos) reciboByAthlete.set(rec.athlete_id, rec);
  const hoyIso = isoDateString(startOfDayInBox(new Date()));

  const cards: V2AsignacionSugeridaCard[] = [];
  for (const r of resolutions) {
    if (!r) continue;
    const { row, res } = r;
    const athleteId = Number(row.athlete_id);
    const recibo = reciboByAthlete.get(row.athlete_id);
    const programa = estadoProgramaAtleta(
      recibo ? { end_date: recibo.end_date, month_name: recibo.month_name } : null,
      hoyIso,
    );
    // Un bloque vigente no es caso de esta tira: el hueco es del atleta, no
    // de que falte inscripción en secuencia.
    if (!tieneHueco(programa)) continue;

    if (res.ok) {
      const preview = previewByAthlete.get(row.athlete_id);
      // No preview means the first microciclo template vanished — treat as a
      // blocked (empty) state rather than rendering a nameless proposal.
      if (!preview) {
        cards.push({
          kind: 'blocked',
          id: `asig:${athleteId}`,
          athlete_id: athleteId,
          athlete_name: row.athlete_name,
          level_name: res.athlete.level_name ?? `Nivel ${res.athlete.level_id}`,
          programa,
          receta: recetaDesdeFallo({
            reason: 'empty_sequence',
            celda: res.athlete.level_name ?? `Nivel ${res.athlete.level_id}`,
            dias: res.athlete.training_days_per_week,
            min: SEQUENCE_DAYS_MIN,
            max: SEQUENCE_DAYS_MAX,
          }),
          reason: 'empty_sequence',
          message: 'El primer microciclo de la secuencia ya no existe.',
        });
        continue;
      }
      cards.push({
        kind: 'ok',
        id: `asig:${athleteId}`,
        athlete_id: athleteId,
        athlete_name: row.athlete_name,
        level_name: res.athlete.level_name ?? `Nivel ${res.athlete.level_id}`,
        days_per_week: res.athlete.training_days_per_week!,
        programa,
        first_microciclo_name: preview.name,
        first_microciclo_weeks: preview.week_count,
      });
      continue;
    }

    // why-not — ACTIONABLE card. `not_classified` can't occur here (filtered by
    // the eligible query), but if it ever did we'd skip it (NivelSugerido's job).
    if (res.reason === 'not_classified') continue;
    cards.push({
      kind: 'blocked',
      id: `asig:${athleteId}`,
      athlete_id: athleteId,
      athlete_name: row.athlete_name,
      level_name: res.athlete?.level_name ?? 'Sin nivel',
      programa,
      receta: recetaDesdeResolver(res),
      reason: res.reason,
      message: res.message,
    });
  }

  return cards;
}

// ── Siguiente microciclo (sequence walk) ────────────────────────────────────────
// For athletes whose CURRENT microciclo has FINISHED (its dated window is in the
// past OR every session in it is terminal), a one-click proposal to advance the
// sequence walk. The action label reflects what advancing will DO, derived from the
// cursor position vs the sequence length + the end-policy:
//   · 'advance'  → next microciclo exists           → "siguiente: «{name}»"
//   · 'repeat'   → last item + end_policy 'repeat'   → "repetir el ciclo" (+% deferred)
//   · 'level_up' → last item + end_policy 'level_up' → "subir a {nivel}" (when resolvable)
//   · 'stop'     → last item + 'stop' / level_up dead-end → "cerrar el plan"
// Mirrors AsignacionSugeridaCard's one-click + optimistic-remove pattern; the
// action POSTs to /advance-sequence which runs advanceSequenceForAthlete.

export type V2SiguienteMicrocicloAction = 'advance' | 'repeat' | 'level_up' | 'stop';

export interface V2SiguienteMicrocicloCard {
  /** Stable React key: `seq-next:${athlete_id}`. */
  id: string;
  athlete_id: number;
  athlete_name: string;
  /** Real level code from athlete_levels.name (e.g. "N2"). */
  level_name: string;
  /** What advancing will do (drives the copy + button). */
  action: V2SiguienteMicrocicloAction;
  /** Name of the microciclo the athlete just finished. */
  finished_microciclo_name: string;
  /** 1-indexed position the athlete is finishing (for "terminó microciclo N"). */
  finished_position: number;
  /** Name of the NEXT microciclo to materialize ('advance'/'repeat' only). */
  next_microciclo_name: string | null;
  /** Target level name when action is 'level_up' (e.g. "N3"). */
  next_level_name: string | null;
}

type SeqEnrollmentRow = {
  athlete_id: string;
  athlete_name: string;
  level_name: string | null;
  sequence_id: string;
  current_position: number;
  end_policy: string;
};

type SeqItemRow = {
  sequence_id: string;
  position: number;
  month_template_id: string;
  month_name: string | null;
};

/**
 * Build "siguiente microciclo" cards. ONE batched pass:
 *   1. all active enrollments for the coach (+ the cell's end_policy);
 *   2. all their sequence items (position → microciclo name);
 *   3. the latest materialization receipt per (athlete, current microciclo) to
 *      decide FINISHED (end_date past) and, when not past, whether all its sessions
 *      are terminal. Only finished ones yield a card.
 * Degrades safely: any single bad row is dropped, never fails the strip.
 */
export async function fetchSiguienteMicrocicloCards(
  coachId: bigint | number,
): Promise<V2SiguienteMicrocicloCard[]> {
  const enrollments = await sql<SeqEnrollmentRow[]>`
    SELECT a.id::text          AS athlete_id,
           a.full_name         AS athlete_name,
           al.name             AS level_name,
           asp.sequence_id::text AS sequence_id,
           asp.current_position,
           ps.end_policy
    FROM athlete_sequence_progress asp
    JOIN athletes a   ON a.id = asp.athlete_id
    JOIN program_sequences ps ON ps.id = asp.sequence_id
    LEFT JOIN athlete_levels al ON al.id = a.level_id
    WHERE asp.coach_id = ${coachId as number}
      AND asp.status = 'active'
    ORDER BY asp.updated_at ASC
  `;
  if (enrollments.length === 0) return [];

  const seqIds = [...new Set(enrollments.map((e) => e.sequence_id))];
  const items = await sql<SeqItemRow[]>`
    SELECT psi.sequence_id::text AS sequence_id,
           psi.position,
           psi.month_template_id::text AS month_template_id,
           pmt.name AS month_name
    FROM program_sequence_items psi
    -- Defensive (0164), same backstop as fetchAsignacionSugeridaCards above.
    LEFT JOIN program_month_templates pmt ON pmt.id = psi.month_template_id AND pmt.athlete_id IS NULL
    WHERE psi.sequence_id = ANY(${seqIds}::bigint[])
    ORDER BY psi.sequence_id, psi.position
  `;
  const itemsBySeq = new Map<string, SeqItemRow[]>();
  for (const it of items) {
    const list = itemsBySeq.get(it.sequence_id) ?? [];
    list.push(it);
    itemsBySeq.set(it.sequence_id, list);
  }

  const cards: V2SiguienteMicrocicloCard[] = [];
  for (const e of enrollments) {
    const seqItems = itemsBySeq.get(e.sequence_id);
    if (!seqItems || seqItems.length === 0) continue;
    const currentItem = seqItems.find((it) => it.position === e.current_position);
    if (!currentItem) continue;

    // FINISHED check — reuse the same definition as the advancement core
    // (time-done OR work-done) so the card and the action can never diverge.
    const finished = await isMicrocicloFinishedForCard(
      Number(e.athlete_id),
      Number(currentItem.month_template_id),
    );
    if (!finished) continue;

    const lastPosition = seqItems.reduce((m, it) => Math.max(m, it.position), 0);
    let action: V2SiguienteMicrocicloAction;
    let nextName: string | null = null;
    let nextLevelName: string | null = null;

    if (e.current_position < lastPosition) {
      action = 'advance';
      nextName = seqItems.find((it) => it.position === e.current_position + 1)?.month_name ?? null;
    } else if (e.end_policy === 'repeat') {
      action = 'repeat';
      nextName = seqItems.find((it) => it.position === 1)?.month_name ?? null;
    } else if (e.end_policy === 'level_up') {
      // Only show "subir a N" when a higher level WITH a sequence actually exists;
      // otherwise it degrades to a stop (close the plan) — never promise a level
      // the coach hasn't built a sequence for.
      const promo = await resolveLevelUpTargetForCard(coachId, e.sequence_id);
      if (promo) {
        action = 'level_up';
        nextLevelName = promo;
      } else {
        action = 'stop';
      }
    } else {
      action = 'stop';
    }

    cards.push({
      id: `seq-next:${e.athlete_id}`,
      athlete_id: Number(e.athlete_id),
      athlete_name: e.athlete_name,
      level_name: e.level_name ?? 'Sin nivel',
      action,
      finished_microciclo_name: currentItem.month_name ?? `Microciclo ${e.current_position}`,
      finished_position: e.current_position,
      next_microciclo_name: nextName,
      next_level_name: nextLevelName,
    });
  }

  return cards;
}

/**
 * The set of athlete ids the progress-readiness engine currently flags 'advance'
 * — read straight from the persisted attention items (signal_kind='transition_
 * ready'), so the listo_progresar lane reuses the SAME engine output the HOY queue
 * shows (no recompute, no parallel path, no N+1). Best-effort: an empty set just
 * falls the lane back to the adherence heuristic.
 */
export async function fetchTransitionReadyAthleteIds(
  coachId: bigint | number,
): Promise<Set<string>> {
  const rows = await sql<Array<{ athlete_id: string }>>`
    select athlete_id::text as athlete_id
    from coach_attention_items
    where coach_id = ${coachId as number} and signal_kind = 'transition_ready'
  `;
  return new Set(rows.map((r) => r.athlete_id));
}

/**
 * FINISHED check for the card — mirrors isCurrentMicrocicloFinished in
 * assign-sequence.ts: time-done (end_date past, box tz) OR work-done (every
 * workout terminal). Kept here to avoid a server-only import cycle; both read the
 * identical receipt + status model so the card and the action agree.
 */
async function isMicrocicloFinishedForCard(
  athleteId: number,
  monthTemplateId: number,
): Promise<boolean> {
  const receipts = await sql<{ end_date: string; microcycle_ids: string[] }[]>`
    SELECT to_char(end_date, 'YYYY-MM-DD') AS end_date, microcycle_ids
    FROM athlete_month_assignments
    WHERE athlete_id = ${athleteId} AND month_template_id = ${monthTemplateId}
    ORDER BY start_date DESC
    LIMIT 1
  `;
  const receipt = receipts[0];
  if (!receipt) return false;

  const todayIso = isoDateString(startOfDayInBox(new Date()));
  if (receipt.end_date < todayIso) return true;

  const microIds = receipt.microcycle_ids.map(Number).filter((n) => Number.isFinite(n));
  if (microIds.length === 0) return false;
  const counts = await sql<{ total: number; outstanding: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'scheduled')::int AS outstanding
    FROM workout_assignments
    WHERE athlete_id = ${athleteId}
      AND microcycle_id = ANY(${microIds}::bigint[])
  `;
  const c = counts[0];
  return !!c && c.total > 0 && c.outstanding === 0;
}

/**
 * For a 'level_up' card: the name of the next level (sort_order strictly greater,
 * nearest) that ALSO has a sequence for the same days. Null when none — mirrors
 * resolveLevelUp in assign-sequence.ts so the card never promises a level the
 * advancement would fall back from.
 */
async function resolveLevelUpTargetForCard(
  coachId: bigint | number,
  sequenceId: string,
): Promise<string | null> {
  const rows = await sql<{ next_level_name: string }[]>`
    WITH cur AS (
      SELECT ps.level_id, ps.days_per_week, al.sort_order
      FROM program_sequences ps
      JOIN athlete_levels al ON al.id = ps.level_id
      WHERE ps.id = ${sequenceId}::bigint AND ps.coach_id = ${coachId as number}
    )
    SELECT al.name AS next_level_name
    FROM athlete_levels al
    JOIN cur ON al.sort_order > cur.sort_order
    JOIN program_sequences nps
      ON nps.coach_id = ${coachId as number}
     AND nps.level_id = al.id
     AND nps.days_per_week = cur.days_per_week
    WHERE al.coach_id = ${coachId as number}
      AND EXISTS (
        SELECT 1 FROM program_sequence_items psi WHERE psi.sequence_id = nps.id
      )
    ORDER BY al.sort_order ASC
    LIMIT 1
  `;
  return rows[0]?.next_level_name ?? null;
}

// ── Public assembler ──────────────────────────────────────────────────────────

export function buildHoyLanes(params: {
  athletes: AthleteRow[];
  threads: CoachThreadSummary[];
  inbox: CoachInbox | null;
  nivel_sugerido_cards?: V2NivelSugeridoCard[];
  asignacion_sugerida_cards?: V2AsignacionSugeridaCard[];
  siguiente_microciclo_cards?: V2SiguienteMicrocicloCard[];
  /** Athlete ids the progress-readiness engine flags 'advance' (transition_ready
   *  firing in coach_attention_items). These take the listo lane regardless of the
   *  adherence fallback. */
  transition_ready_ids?: Set<string>;
}): V2HoyData {
  const {
    athletes,
    threads,
    inbox,
    nivel_sugerido_cards = [],
    asignacion_sugerida_cards = [],
    siguiente_microciclo_cards = [],
    transition_ready_ids = new Set<string>(),
  } = params;

  // Inactivity days by athlete (reinforces "falló sesiones" reasons) and the
  // pending week-adjustment proposals — both lifted from the already-computed
  // inbox items (no new query, no parallel data path).
  const inactivityByAthlete = new Map<string, number>();
  const week_adjustment_cards: V2WeekAdjustmentCard[] = [];
  for (const item of inbox?.items ?? []) {
    if (item.type === 'alert_inactivity') {
      inactivityByAthlete.set(item.athlete_id, item.days_inactive);
    } else if (item.type === 'week_adjustment') {
      week_adjustment_cards.push({
        id: item.id,
        athlete_id: Number(item.athlete_id),
        athlete_name: item.athlete_name,
        proposal_id: Number(item.proposal_id),
        week_start: item.week_start,
        title: item.title,
        summary: item.summary,
        diff_rows: item.diff_rows,
        extra_change_count: item.extra_change_count,
        triggers: item.triggers,
      });
    }
  }

  const fallo: V2LaneCard[] = [];
  const listo: V2LaneCard[] = [];
  const vigilar: V2LaneCard[] = [];
  const flaggedAthleteIds = new Set<string>();

  // Level per athlete from the shared util — the espera-respuesta lane (built
  // from threads, which carry no modality) reuses this so the SAME athlete shows
  // the SAME level in every lane.
  // order_altered is per-athlete on the roster row; the thread-built espera lane
  // (no AthleteRow) reads it from this map so EVERY lane agrees on the same flag.
  const levelByAthlete = new Map<string, string | null>();
  const orderAlteredByAthlete = new Map<string, boolean>();
  for (const a of athletes) {
    levelByAthlete.set(a.athlete_id, athleteLevel(a));
    orderAlteredByAthlete.set(a.athlete_id, a.order_altered);
  }

  for (const a of athletes) {
    const level = levelByAthlete.get(a.athlete_id) ?? athleteLevel(a);
    const base = {
      athlete_id: a.athlete_id,
      athlete_name: a.full_name,
      level,
      readiness_score: a.readiness_score,
      age_label: null,
      unread_count: null,
      order_altered: a.order_altered,
    };
    const inactivity = inactivityByAthlete.get(a.athlete_id) ?? null;

    // Priority order: falló (missed work) wins, then vigilar (biometric), then
    // listo (earned progress). One lane per athlete. Plan-gap athletes are NEVER
    // here — with no active plan there's nothing to "fail" (an inactivity alert on
    // a planless athlete is spurious: nothing was scheduled). They're surfaced in
    // "Asignación sugerida" / "Siguiente microciclo" instead. lowAdherence is
    // null-safe (planless ⇒ compliance null ⇒ not < threshold ⇒ excluded).
    if (!hasPlanGap(a) && (lowAdherence(a) || inactivity != null)) {
      flaggedAthleteIds.add(a.athlete_id);
      fallo.push({
        ...base,
        id: `fallo:${a.athlete_id}`,
        reason: fallaReason(a, inactivity),
        adherence_pct: a.compliance_pct,
        // Plan gap → la acción real es asignar/materializar plan (ya cubierta por
        // los strips de Asignación/Siguiente microciclo + "Ver" en la ficha); sin
        // botón "ajustar fase" falso. Sesiones falladas → mensaje al atleta.
        actions: hasPlanGap(a) ? ['ver'] : ['ver', 'mensaje'],
      });
      continue;
    }
    if (hasPhysiologyFlag(a)) {
      flaggedAthleteIds.add(a.athlete_id);
      vigilar.push({
        ...base,
        id: `vigilar:${a.athlete_id}`,
        reason: physioReason(a),
        adherence_pct: a.compliance_pct,
        actions: ['ver', 'descargar_carga'],
      });
      continue;
    }
    // Listo: the progress-readiness engine ('advance' = phase near end + benchmark
    // improving) is the first-class signal; it answers "did they actually get
    // fitter?", not just "did they comply?". When it fires, the athlete lands here.
    if (transition_ready_ids.has(a.athlete_id)) {
      listo.push({
        ...base,
        id: `listo:${a.athlete_id}`,
        reason: 'Microciclo terminado y rindiendo — listo para progresar.',
        adherence_pct: a.compliance_pct,
        actions: ['ver'],
      });
    } else if (a.week_ok && a.compliance_pct != null && a.compliance_pct >= READY_ADHERENCE_MIN) {
      // Fallback (no engine verdict yet — e.g. no benchmark delta / no active
      // microciclo): a clean, strongly-adhered week still surfaces here.
      listo.push({
        ...base,
        id: `listo:${a.athlete_id}`,
        reason: `Semana al ${a.compliance_pct}% sin incidencias — lista para subir carga.`,
        adherence_pct: a.compliance_pct,
        // El avance seguro (cuando el microciclo ha terminado) ya tiene su propia
        // card gated (Siguiente microciclo → /advance-sequence). Desde la mera
        // heurística "listo" no avanzamos (saltaría trabajo sin terminar): "Ver".
        actions: ['ver'],
      });
    }
  }

  // Espera respuesta — every thread the athlete is waiting on. Oldest first so
  // the coach clears the most-ghosted athlete first (matches v1 message sort).
  const waiting = threads.filter((t) => t.unread_count > 0);
  const espera: V2LaneCard[] = waiting
    .slice()
    .sort((x, y) => {
      const xt = x.last_message_at ? Date.parse(x.last_message_at) : Infinity;
      const yt = y.last_message_at ? Date.parse(y.last_message_at) : Infinity;
      return xt - yt; // oldest first
    })
    .map((t) => ({
      id: `espera:${t.thread_id}`,
      athlete_id: t.athlete_id,
      athlete_name: t.athlete_full_name,
      // Threads carry no modality — resolve the level from the roster map so this
      // lane agrees with the roster lanes. Null when the athlete isn't on the
      // roster (e.g. a thread with an athlete outside the current coach filter).
      level: levelByAthlete.get(t.athlete_id) ?? null,
      reason: oneLine(t.last_message_body) || 'Mensaje sin responder.',
      adherence_pct: null,
      readiness_score: null,
      age_label: t.last_message_at ? formatRelative(t.last_message_at) : null,
      unread_count: t.unread_count,
      order_altered: orderAlteredByAthlete.get(t.athlete_id) ?? false,
      actions: ['responder', 'ver'],
    }));

  const lanes: V2Lane[] = [
    {
      id: 'fallo_sesiones',
      title: 'Falló sesiones',
      dot_var: '--v2-mod-carrera',
      cards: fallo,
      count: fallo.length,
    },
    {
      id: 'listo_progresar',
      title: 'Listo para progresar',
      dot_var: '--v2-ok',
      cards: listo,
      count: listo.length,
    },
    {
      id: 'vigilar_fisiologia',
      title: 'Vigilar fisiología',
      dot_var: '--v2-warn',
      cards: vigilar,
      count: vigilar.length,
    },
    {
      id: 'espera_respuesta',
      title: 'Espera respuesta',
      dot_var: '--v2-info',
      cards: espera,
      count: espera.length,
    },
  ];

  // Athletes waiting on a reply, counted distinctly (a thread is per-athlete).
  const awaitingIds = new Set(waiting.map((t) => t.athlete_id));

  return {
    lanes,
    total_athletes: athletes.length,
    need_attention_count: flaggedAthleteIds.size,
    awaiting_reply_count: awaitingIds.size,
    nivel_sugerido_cards,
    asignacion_sugerida_cards,
    siguiente_microciclo_cards,
    week_adjustment_cards,
  };
}

/** Collapse a body to one tidy line for a card reason. */
function oneLine(body: string | null): string {
  return (body ?? '').replace(/\s+/g, ' ').trim();
}
