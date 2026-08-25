// Recap = lo HECHO, proyectado desde la ejecución guardada.
//
// No es la prescripción. Un 5:45 pedido no entra aunque el atleta corriera
// 3:39. Si no hay ejecución con números, el recap está vacío: no hay nada
// que enseñar.

export type RecapKind = 'run' | 'ergo' | 'strength' | 'station';

export interface RecapSet {
  set_index: number;
  reps: number | null;
  load_kg: number | null;
  is_approach: boolean;
}

export interface RecapBlock {
  position: number;
  label: string;
  kind: RecapKind;
  /** Modalidad cruda del tramo (`run` | `row` | `ski` | `bike` | …). El kind no basta para un ergo. */
  modality: string | null;
  duration_s: number | null;
  distance_m: number | null;
  pace_s_per_km: number | null;
  pace_s_per_500m: number | null;
  reps: number | null;
  load_kg: number | null;
  sets: RecapSet[];
  /** Null o 0 = no hay ronda. 1+ = esa ronda. */
  round: number | null;
}

export interface Recap {
  blocks: RecapBlock[];
}

export interface RecapSetInput {
  set_index: number;
  reps_actual?: number | null;
  load_actual_kg?: number | null;
  is_approach?: boolean;
}

export interface RecapSegmentInput {
  position: number;
  item_uid?: string | null;
  modality?: string | null;
  duration_seconds?: number | null;
  work_s?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  distance_meters?: number | null;
  avg_pace_s_per_km?: number | null;
  avg_pace_s_per_500m?: number | null;
  reps_completed?: number | null;
  weight_used_kg?: number | null;
  sets?: RecapSetInput[];
  round_index?: number | null;
  /** Ritmo pedido. Se ignora. Está para que un test lo demuestre. */
  prescribed_pace_s_per_km?: number | null;
}

export function recapIsEmpty(recap: Recap): boolean {
  return recap.blocks.length === 0;
}

export function workSecondsFromRaw(raw: unknown): number | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as { work_s?: unknown }).work_s;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function projectRecap(input: {
  segments: RecapSegmentInput[];
  labelsByItemUid?: Record<string, string>;
}): Recap {
  const labels = input.labelsByItemUid ?? {};
  const blocks: RecapBlock[] = [];

  for (const seg of input.segments) {
    const block = blockFromSegment(seg, labels);
    if (block) blocks.push(block);
  }

  return { blocks };
}

function blockFromSegment(
  seg: RecapSegmentInput,
  labels: Record<string, string>,
): RecapBlock | null {
  const sets = (seg.sets ?? []).map((s) => ({
    set_index: s.set_index,
    reps: s.reps_actual ?? null,
    load_kg: s.load_actual_kg ?? null,
    is_approach: s.is_approach === true,
  }));

  const distance = positive(seg.distance_meters);
  const measuredPaceKm = positive(seg.avg_pace_s_per_km);
  const measuredPace500 = positive(seg.avg_pace_s_per_500m);
  const duration = effortSeconds(seg, distance, measuredPaceKm, measuredPace500);
  const reps = seg.reps_completed ?? null;
  const load = positive(seg.weight_used_kg);

  const hasSubstance =
    duration != null ||
    distance != null ||
    measuredPaceKm != null ||
    measuredPace500 != null ||
    (reps != null && reps > 0) ||
    load != null ||
    sets.some((s) => s.reps != null || s.load_kg != null);
  if (!hasSubstance) return null;

  const kind = kindFromModality(seg.modality);
  const uid = seg.item_uid ?? '';
  const label = (uid && labels[uid]) || fallbackLabel(kind, seg.modality);

  return {
    position: seg.position,
    label,
    kind,
    modality: seg.modality ?? null,
    duration_s: duration,
    distance_m: distance,
    pace_s_per_km: kind === 'run' ? (measuredPaceKm ?? paceFrom(duration, distance, 1000)) : null,
    pace_s_per_500m: kind === 'ergo' ? (measuredPace500 ?? paceFrom(duration, distance, 500)) : null,
    reps,
    load_kg: load,
    sets,
    round: recapRound(seg.round_index),
  };
}

function effortSeconds(
  seg: RecapSegmentInput,
  distance: number | null,
  paceKm: number | null,
  pace500: number | null,
): number | null {
  const work = positive(seg.work_s) ?? positive(seg.duration_seconds);
  if (distance != null && paceKm != null) return Math.round(paceKm * (distance / 1000));
  if (distance != null && pace500 != null) return Math.round(pace500 * (distance / 500));
  if (work != null) return work;
  return timestampSeconds(seg.started_at, seg.ended_at);
}

function timestampSeconds(started: string | null | undefined, ended: string | null | undefined): number | null {
  if (!started || !ended) return null;
  const start = new Date(started).getTime();
  const end = new Date(ended).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const d = Math.round((end - start) / 1000);
  return d > 0 ? d : null;
}

function paceFrom(duration: number | null, distance: number | null, unitM: number): number | null {
  if (duration == null || distance == null || distance <= 0) return null;
  return duration / (distance / unitM);
}

function kindFromModality(raw: string | null | undefined): RecapKind {
  switch (raw) {
    case 'run':
      return 'run';
    case 'row':
    case 'ski':
    case 'bike':
      return 'ergo';
    case 'strength':
      return 'strength';
    default:
      return 'station';
  }
}

function fallbackLabel(kind: RecapKind, modality: string | null | undefined): string {
  if (kind === 'run') return 'Correr';
  if (kind === 'strength') return 'Fuerza';
  if (modality === 'ski') return 'SkiErg';
  if (modality === 'bike') return 'Bici';
  if (kind === 'ergo') return 'Remo';
  return 'Estación';
}

function recapRound(roundIndex: number | null | undefined): number | null {
  if (roundIndex == null || roundIndex <= 0) return null;
  return roundIndex;
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}
