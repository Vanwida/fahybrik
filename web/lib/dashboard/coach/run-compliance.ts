// Per-segment running compliance for the coach (#66) — the WIRE that marries a
// run session's PRESCRIPTION to its EXECUTION, tramo by tramo, and hands each
// pair to the pure verdict engine (`@fahybrid/shared/domain/adherence`).
//
// WHAT MAPS TO WHAT
// -----------------
// A logged lap (`segment_executions` → `SegmentActual`) is attributed to the
// prescribed line it belongs to by the shared uid `segment-{template_segment_id}`
// (`item_uid`) — the same join the drawer already renders prescrito↔hecho on. In
// today's data each run tramo (warm-up, each interval rep) is its OWN
// template_segment, so the mapping is 1 item ↔ 1 lap. When a single template_segment
// instead holds a NATIVE #61 structure executed as several laps, we enumerate its
// work segments structure-first (reusing `legacyToStructure`/`flattenSegments`) and
// zip them to the laps in order.
//
// ZONE RESOLUTION (single source of truth)
// ----------------------------------------
// A run zone target ("@Z4") is judged against the SAME per-athlete pace band the
// athlete was shown: `AssignmentDetailItem.resolved_intensity`, resolved once from
// the versioned `athlete_zone_profiles` snapshot in the assignment-detail loader.
// We reuse it rather than re-resolving live, so the compliance band can never drift
// from the prescribed band in the same drawer. Explicit pace / HR / RPE targets are
// absolute and read straight off the prescription. A zone with no snapshot (athlete
// untested) → no band → 'sin_dato' (honest, never fabricated).
//
// Client-safe: pure functions + type-only imports. No I/O.

import {
  evaluateRecoverySegment,
  evaluateRunSegment,
  hrBandFromTarget,
  paceBandFromResolvedZone,
  paceBandFromTarget,
  rpeBandFromTarget,
  summarizeRecoveryCompliance,
  summarizeRunCompliance,
  type ComplianceBand,
  type ComplianceSample,
  type RecoveryComplianceSummary,
  type RecoveryComplianceVerdict,
  type RunComplianceSummary,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';
import {
  flattenSegments,
  legacyToStructure,
  prescriptionTarget,
  setTarget,
  type Prescription,
  type Segment,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailItem,
  AssignmentDetailWorkout,
  ResolvedIntensity,
} from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

/** One tramo's verdict, keyed back to the drawer's rows. */
export interface RunComplianceTramo {
  /** The prescribed item this tramo belongs to (`segment-{id}`). */
  item_uid: string;
  /** Position of the executed lap this verdict grades; null = a prescribed run
   *  tramo with no execution (counts as 'sin_dato'). */
  position: number | null;
  verdict: RunComplianceVerdict;
}

/** One RECOVERY tramo's verdict — same key shape as `RunComplianceTramo`, a
 *  different verdict vocabulary (see `evaluateRecoverySegment`). */
export interface RecoveryComplianceTramo {
  item_uid: string;
  position: number | null;
  verdict: RecoveryComplianceVerdict;
}

export interface RunComplianceResult {
  summary: RunComplianceSummary;
  tramos: RunComplianceTramo[];
  /** Recuperaciones CON objetivo prescrito, juzgadas por separado (#66,
   *  Alex 12-ago) — nunca mezcladas en `tramos`/`summary`, para que un "6 de 6
   *  en el trabajo, 2 de 6 en la recuperación" no se resuma en un porcentaje
   *  único que no distingue las dos preguntas. Una recuperación SIN objetivo
   *  no aparece aquí: no se juzga, se omite (no hay nada contra qué medirla). */
  recovery_summary: RecoveryComplianceSummary;
  recovery_tramos: RecoveryComplianceTramo[];
}

// The representative intensity target for a line: block-level, else the first
// per-set target. Mirrors assignment-detail's `lineTarget` / `prescriptionToParams`
// precedence so the band we judge matches the scalar the item already exposes.
function representativeTarget(p: Prescription | null): Target | undefined {
  if (!p) return undefined;
  const block = prescriptionTarget(p);
  if (block) return block;
  for (const s of p.sets ?? []) {
    const t = setTarget(s);
    if (t) return t;
  }
  return undefined;
}

// Executed sample from a logged lap. Pace prefers the device value, else derives
// s/km from distance + duration (the same COALESCE the running analytics use), so
// a lap that recorded distance+time but no pace is still evaluable.
function sampleFromActual(a: SegmentActual): ComplianceSample {
  let pace = a.avg_pace_s_per_km;
  if (
    (pace == null || !Number.isFinite(pace)) &&
    a.distance_meters != null &&
    a.distance_meters > 0 &&
    a.duration_seconds != null &&
    a.duration_seconds > 0
  ) {
    pace = a.duration_seconds / (a.distance_meters / 1000);
  }
  // No per-segment RPE column exists (session-level only) → rpe is never sampled here.
  return { pace_s: pace ?? null, hr_bpm: a.avg_hr ?? null, rpe: null };
}

// A resolved zone band → a pace comparison band. Only per_km (running) feeds run
// compliance; row/ski/bike resolve to per_500m and aren't run tramos.
function bandFromResolvedIntensity(ri: ResolvedIntensity | null): ComplianceBand | null {
  if (!ri || ri.pace_unit !== 'per_km') return null;
  return paceBandFromResolvedZone(ri.fast_s, ri.slow_s);
}

// An explicit (already-absolute) target → a comparison band. A zone target with no
// resolved snapshot returns null → 'sin_dato'.
function bandFromTarget(t: Target | undefined): ComplianceBand | null {
  if (!t) return null;
  switch (t.kind) {
    case 'pace':
      return t.unit === 'per_km' ? paceBandFromTarget(t) : null; // run compliance is per km
    case 'hr_bpm':
      return hrBandFromTarget(t);
    case 'rpe':
      return rpeBandFromTarget(t);
    default:
      // hr_zone / pace_zone without a snapshot, %RM / kg / … → not a run band.
      return null;
  }
}

// The band for the ITEM as a whole (its representative tramo): the resolved zone
// band (the same band the athlete saw) wins; else the explicit target.
function itemBand(item: AssignmentDetailItem): ComplianceBand | null {
  return (
    bandFromResolvedIntensity(item.resolved_intensity) ??
    bandFromTarget(representativeTarget(item.prescription_json))
  );
}

// The band for one flattened structure segment (work OR recovery): an explicit
// pace/RPE target resolves standalone; a zone target prefers the band the wire
// already resolved for THIS segment (`seg.resolved` — assignment-detail's
// runWireStructure enriches every pace_zone segment individually, work and
// recovery alike), falling back to the item's representative snapshot band
// only when the segment itself has none.
//
// Using the item's band UNCONDITIONALLY was harmless while every segment in a
// block shared the same zone (a 6×800 @ Z4 has `seg.resolved` ≡
// `item.resolved_intensity` for every work rep) and recoveries were never
// judged at all. It stops being harmless the moment a recovery targets a
// DIFFERENT zone than the work (Z1 recovery inside a Z4 block) — judging it
// against the item's Z4 band would fail every honest easy recovery.
function segmentBand(seg: Segment, item: AssignmentDetailItem): ComplianceBand | null {
  const t = seg.target;
  if (!t) return null;
  if (t.type === 'pace') return paceBandFromTarget(t);
  if (t.type === 'rpe') return rpeBandFromTarget(t);
  // pace_zone / hr_zone.
  if (seg.resolved) return bandFromResolvedIntensity(seg.resolved);
  return bandFromResolvedIntensity(item.resolved_intensity);
}

// Prescribed WORK segments of an item, structure-first (native `structure`, else
// `legacyToStructure`). Empty when the item isn't a run steady/intervals form.
function workSegmentsOf(p: Prescription | null): Segment[] {
  return allSegmentsOf(p).filter((seg) => seg.kind === 'work');
}

// La lista PLANA de tramos prescritos — repeticiones desplegadas, fases en orden,
// RECUPERACIONES INCLUIDAS. Es el espacio de índices que `leg_index` referencia
// (mig 0146): el mismo que produce `RunStructure.expandedLegs()` en el iOS. Por eso
// se puede indexar directamente en vez de zipear.
function allSegmentsOf(p: Prescription | null): Segment[] {
  if (!p) return [];
  const structure = p.structure && p.structure.length > 0 ? p.structure : legacyToStructure(p);
  if (!structure) return [];
  return flattenSegments(structure);
}

// A tramo is part of RUN compliance when the prescription is a run (intent), or —
// for legacy lines with no prescription modality — when its logged laps are runs.
function isRunItem(item: AssignmentDetailItem, actuals: SegmentActual[]): boolean {
  const m = item.prescription_json?.modality;
  if (m) return m === 'run';
  return actuals.some((a) => a.modality === 'run');
}

/**
 * Build the per-tramo running-compliance verdicts + session aggregate for a coach
 * session detail. Pure: give it the assembled workout blocks + the logged actuals
 * and it returns verdicts keyed by (item, lap) plus the % of evaluable tramos in
 * band. Non-run tramos are ignored; a prescribed run tramo with no execution is a
 * 'sin_dato' (counted, never in-band). Recoveries with a prescribed objetivo are
 * judged too, but into `recovery_tramos`/`recovery_summary` — never mixed into
 * the work verdict (see the type doc on `RunComplianceResult`).
 */
export function buildRunCompliance(
  workout: AssignmentDetailWorkout | null,
  actuals: readonly SegmentActual[],
): RunComplianceResult {
  const byItem = new Map<string, SegmentActual[]>();
  for (const a of actuals) {
    if (!a.item_uid) continue;
    const list = byItem.get(a.item_uid) ?? [];
    list.push(a);
    byItem.set(a.item_uid, list);
  }
  for (const list of byItem.values()) list.sort((x, y) => x.position - y.position);

  const tramos: RunComplianceTramo[] = [];
  const verdicts: RunComplianceVerdict[] = [];
  const push = (item_uid: string, position: number | null, verdict: RunComplianceVerdict) => {
    tramos.push({ item_uid, position, verdict });
    verdicts.push(verdict);
  };

  const recoveryTramos: RecoveryComplianceTramo[] = [];
  const recoveryVerdicts: RecoveryComplianceVerdict[] = [];
  const pushRecovery = (item_uid: string, position: number | null, verdict: RecoveryComplianceVerdict) => {
    recoveryTramos.push({ item_uid, position, verdict });
    recoveryVerdicts.push(verdict);
  };

  for (const block of workout?.blocks ?? []) {
    for (const item of block.items) {
      const itemActuals = byItem.get(item.uid) ?? [];
      if (!isRunItem(item, itemActuals)) continue;

      if (itemActuals.length === 0) {
        push(item.uid, null, 'sin_dato'); // prescribed run tramo, not executed
        continue;
      }

      // ── Camino NATIVO (mig 0146): cada lap sabe QUÉ tramo es ────────────────
      //
      // Cuando los laps traen `leg_index`, no hay nada que adivinar: el índice
      // apunta a la lista plana de tramos prescritos, así que se busca el tramo
      // por índice y punto. Esto sustituye al zip posicional que había antes
      // (`work.length === itemActuals.length`), que era frágil por construcción:
      // en cuanto el número de laps dejaba de coincidir con el número de series
      // —y deja de coincidir SIEMPRE desde que se graban las recuperaciones— la
      // guarda caía en silencio al camino de abajo y juzgaba CADA lap, trotes
      // incluidos, contra la banda de las series. Media sesión salía «muy lento»
      // y el % de cumplimiento se hundía sin que nadie hubiera fallado nada.
      //
      // Las RECUPERACIONES SE JUZGAN cuando traen objetivo (Alex, 12-ago): la
      // gramática ya permite prescribir una —`rec(dur(60), 'trote', rpe(3))`,
      // el arquetipo fartlek— y `segment_executions` ya la MIDE (mig 0146); lo
      // único que faltaba era leerlo. Una recuperación SIN objetivo se sigue
      // omitiendo — no hay nada contra qué medirla, y no se le inventa uno. Las
      // que SÍ tienen objetivo van a `recoveryTramos`, nunca a `tramos`: el
      // cumplimiento del trabajo responde «¿pegaste las series?» y tiene que
      // seguir respondiendo exactamente eso, sin que una recuperación diluya
      // el número. Que el atleta respete la recuperación es OTRA pregunta, con
      // su propio veredicto (`evaluateRecoverySegment` invierte qué dirección
      // es el fallo — ver el porqué en shared/domain/adherence/run-compliance).
      //
      // Se exige que los laps traigan TODOS su `leg_index`, no que lo traiga
      // alguno: un bloque estructurado los graba todos o ninguno, así que una
      // mezcla solo puede venir de un re-sync a medias entre dos versiones del
      // cliente. Con «alguno» los laps sin índice se caerían del veredicto en
      // silencio, y un tramo que desaparece es peor que un tramo mal juzgado.
      const legActuals = itemActuals.filter((a) => a.leg_index != null);
      if (legActuals.length > 0 && legActuals.length === itemActuals.length) {
        const all = allSegmentsOf(item.prescription_json);
        for (const a of legActuals) {
          const seg = all[a.leg_index!];
          const isRecovery = a.leg_role === 'recovery' || seg?.kind === 'recovery';
          if (isRecovery) {
            const band = seg ? segmentBand(seg, item) : null;
            if (!band) continue; // sin objetivo: no se juzga, se omite — nunca un 'sin_dato' inventado
            pushRecovery(item.uid, a.position, evaluateRecoverySegment(band, sampleFromActual(a)));
            continue;
          }
          // Sin tramo prescrito en ese índice no hay banda: 'sin_dato' honesto,
          // nunca la banda del bloque aplicada a ciegas.
          push(
            item.uid,
            a.position,
            evaluateRunSegment(seg ? segmentBand(seg, item) : null, sampleFromActual(a)),
          );
        }
        continue;
      }

      // ── Camino HEREDADO: laps sin `leg_index` ───────────────────────────────
      // Native multi-rep block executed as several laps → align work segments to
      // laps in order. Reduces to the single-tramo path when there is one lap.
      //
      // La recuperación NO se juzga aquí, y no es una laguna nueva: el CHECK
      // de la 0146 exige `leg_index`/`leg_role`/`leg_phase` los tres juntos o
      // ninguno, así que un lap sin `leg_index` tampoco trae `leg_role` — este
      // camino no tiene forma de saber si un lap es trabajo o recuperación.
      // Es la misma limitación que ya tenía para el trabajo (zipar por orden,
      // "frágil por construcción" dice el comentario de arriba); no se agrava
      // ni se arregla aquí.
      const work = itemActuals.length > 1 ? workSegmentsOf(item.prescription_json) : [];
      if (work.length > 1 && work.length === itemActuals.length) {
        work.forEach((seg, i) => {
          const a = itemActuals[i]!;
          push(item.uid, a.position, evaluateRunSegment(segmentBand(seg, item), sampleFromActual(a)));
        });
      } else {
        // One lap, or a lap count that doesn't align to the structure → judge each
        // lap against the item's representative band (uniform set / honest fallback).
        const band = itemBand(item);
        for (const a of itemActuals) {
          push(item.uid, a.position, evaluateRunSegment(band, sampleFromActual(a)));
        }
      }
    }
  }

  return {
    summary: summarizeRunCompliance(verdicts),
    tramos,
    recovery_summary: summarizeRecoveryCompliance(recoveryVerdicts),
    recovery_tramos: recoveryTramos,
  };
}
