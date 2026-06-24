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
import type { CoachThreadSummary } from '@/lib/dashboard/chat/service';
import type { CoachInbox } from '@/lib/dashboard/coach/inbox';
import { readinessBucket } from '@/lib/dashboard/constants/readiness';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { athleteLevel } from '@/lib/dashboard/v2/level';
import { sql } from '@/lib/db';
import {
  resolveSequenceForAthlete,
  type ResolveFailureReason,
} from '@/lib/dashboard/coach/assign-sequence';

// ── Thresholds (single source: signal-config) ────────────────────────────────
/** Compliance below this % counts as "falló sesiones". */
const COMPLIANCE_ATTENTION_MAX = SIGNAL_THRESHOLDS.compliance_attention_max_pct; // 70
/**
 * "Listo para progresar" heuristic floor. The real model has no explicit
 * "ready to advance" flag, so we derive it: a clean week (week_ok), strong
 * adherence, and no alert. TODO(model): replace with a first-class signal once
 * the block-progression engine emits "phase near end + improving" (F-follow-up).
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
  | 'ajustar_fase'
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
 * A one-click auto-assignment proposal for a classified, not-yet-enrolled athlete.
 * Two shapes, discriminated by `kind`:
 *   · 'ok'     → ready to assign; carries the first microciclo preview.
 *   · 'blocked'→ resolver returned a "why not"; carries an actionable fix.
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
      /** The structured "why not" code from the resolver. */
      reason: ResolveFailureReason;
      /** Human one-liner from the resolver (e.g. "No hay secuencia para N4·5d."). */
      message: string;
    };

type EligibleAthleteRow = {
  athlete_id: string;
  athlete_name: string;
};

type FirstItemPreviewRow = {
  athlete_id: string;
  name: string;
  week_count: number;
};

/**
 * Compute auto-assignment proposals for every classified athlete who has no
 * active sequence enrollment yet. Resolution uses `resolveSequenceForAthlete`
 * (the assign endpoint's contract) so the card and the action can never diverge.
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

  const cards: V2AsignacionSugeridaCard[] = [];
  for (const r of resolutions) {
    if (!r) continue;
    const { row, res } = r;
    const athleteId = Number(row.athlete_id);

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
      reason: res.reason,
      message: res.message,
    });
  }

  return cards;
}

// ── Public assembler ──────────────────────────────────────────────────────────

export function buildHoyLanes(params: {
  athletes: AthleteRow[];
  threads: CoachThreadSummary[];
  inbox: CoachInbox | null;
  nivel_sugerido_cards?: V2NivelSugeridoCard[];
  asignacion_sugerida_cards?: V2AsignacionSugeridaCard[];
}): V2HoyData {
  const {
    athletes,
    threads,
    inbox,
    nivel_sugerido_cards = [],
    asignacion_sugerida_cards = [],
  } = params;

  // Inactivity days by athlete (reinforces "falló sesiones" reasons).
  const inactivityByAthlete = new Map<string, number>();
  for (const item of inbox?.items ?? []) {
    if (item.type === 'alert_inactivity') {
      inactivityByAthlete.set(item.athlete_id, item.days_inactive);
    }
  }

  const fallo: V2LaneCard[] = [];
  const listo: V2LaneCard[] = [];
  const vigilar: V2LaneCard[] = [];
  const flaggedAthleteIds = new Set<string>();

  // Level per athlete from the shared util — the espera-respuesta lane (built
  // from threads, which carry no modality) reuses this so the SAME athlete shows
  // the SAME level in every lane.
  const levelByAthlete = new Map<string, string | null>();
  for (const a of athletes) {
    levelByAthlete.set(a.athlete_id, athleteLevel(a));
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
    };
    const inactivity = inactivityByAthlete.get(a.athlete_id) ?? null;

    // Priority order: falló (missed work / plan gap) wins, then vigilar
    // (biometric), then listo (earned progress). One lane per athlete.
    if (lowAdherence(a) || hasPlanGap(a) || inactivity != null) {
      flaggedAthleteIds.add(a.athlete_id);
      fallo.push({
        ...base,
        id: `fallo:${a.athlete_id}`,
        reason: fallaReason(a, inactivity),
        adherence_pct: a.compliance_pct,
        actions: hasPlanGap(a) ? ['ver', 'ajustar_fase'] : ['ver', 'mensaje'],
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
    // Listo: clean week + strong adherence + no flags (derived heuristic).
    if (a.week_ok && a.compliance_pct != null && a.compliance_pct >= READY_ADHERENCE_MIN) {
      listo.push({
        ...base,
        id: `listo:${a.athlete_id}`,
        reason: `Semana al ${a.compliance_pct}% sin incidencias — lista para subir carga.`,
        adherence_pct: a.compliance_pct,
        actions: ['ver', 'ajustar_fase'],
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
  };
}

/** Collapse a body to one tidy line for a card reason. */
function oneLine(body: string | null): string {
  return (body ?? '').replace(/\s+/g, ' ').trim();
}
