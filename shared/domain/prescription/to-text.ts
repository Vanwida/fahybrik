// prescriptionToText — render a Prescription as the compact natural-language
// line the coach reads in the session drawer / week cards (UX redesign §4):
//
//   "5×5 @ 75% RM · descanso 2'"        (strength, uniform sets)
//   "10/10/8/8/6 @ 60/65/70/70/75% RM"  (strength pyramid, per-set)
//   "4×1000m @ 4:10/km · r2'"           (run interval)
//   "3×3' @ RPE 8 · r2'"                (erg interval)
//   "45' @ Z2"                          (steady)
//   "AMRAP 12'" / "EMOM 10'" / "3 rondas For Time · cap 12'"
//
// Conventions (locked against docs/design/ux-redesign mockups):
//   - uniform sets collapse to "N×work"; varied sets list the sequence "10/10/8".
//   - the intensity target joins the work with " @ "; rest joins with " · ".
//   - rest reads "descanso X" for strength, "rX" for everything else.
//   - seconds use double-prime (90''), whole minutes use prime (2'), mixed "2'30''".
//
// This is a presentation helper, NOT a round-trip serializer: it favors
// readability over exactness. Coach-facing copy stays terse and athletic.

import type { Measure, Modality, Prescription, PrescriptionSet, Target } from './types';
import { prescriptionTarget, setMeasure, setTarget } from './types';

// ── Duration / pace formatting ──────────────────────────────────────────────
const PACE_UNIT_LABEL: Record<string, string> = {
  per_km: '/km',
  per_500m: '/500m',
  per_mile: '/mi',
};

// seconds → m:ss (pace), always zero-padded seconds.
function paceClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Athletic duration notation: 45 → 45'', 90 → 90'', 120 → 2', 150 → 2'30''.
// Sub-100s non-minute values stay in seconds (coaches say "r90''", not "1'30''").
const SECONDS_AS_IS_MAX = 99;

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s % 60 === 0 && s >= 60) return `${s / 60}'`;
  if (s <= SECONDS_AS_IS_MAX) return `${s}''`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}'${String(rest).padStart(2, '0')}''`;
}

function rangeNum(min: number | undefined, max: number | undefined, value: number | undefined): string {
  if (value !== undefined) return `${value}`;
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo === undefined) return '';
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}

// ── Target formatting ───────────────────────────────────────────────────────
export function formatTarget(t: Target): string {
  switch (t.kind) {
    case 'bodyweight':
      return 'peso corporal';
    case 'percent_rm':
      return `${rangeNum(t.min, t.max, t.value)}% RM`;
    case 'kg':
      return `${rangeNum(t.min, t.max, t.value)} kg`;
    case 'rpe':
      return `RPE ${rangeNum(t.min, t.max, t.value)}`;
    case 'rir':
      return `RIR ${rangeNum(t.min, t.max, t.value)}`;
    case 'hr_zone': {
      const body = rangeNum(t.min, t.max, t.value);
      // "Z3-Z4" reads better than "Z3-4"; prefix each bound.
      return body.includes('-')
        ? body
            .split('-')
            .map((z) => `Z${z}`)
            .join('-')
        : `Z${body}`;
    }
    case 'hr_bpm':
      return `${rangeNum(t.min, t.max, t.value)} ppm`;
    case 'calories':
      return `${rangeNum(t.min, t.max, t.value)} cal`;
    case 'pace': {
      const unit = PACE_UNIT_LABEL[t.unit] ?? '';
      if (t.value_s !== undefined) return `${paceClock(t.value_s)}${unit}`;
      const lo = t.min_s ?? t.max_s;
      const hi = t.max_s ?? t.min_s;
      if (lo === undefined || hi === undefined) return '';
      return lo === hi
        ? `${paceClock(lo)}${unit}`
        : `${paceClock(lo)}-${paceClock(hi)}${unit}`;
    }
  }
}

// ── Measure formatting ──────────────────────────────────────────────────────
function formatMeasure(m: Measure): string {
  switch (m.kind) {
    case 'reps':
      return `${m.value}`;
    case 'distance':
      return `${m.meters}m`;
    case 'duration':
      return formatDuration(m.seconds);
    case 'calories':
      return `${m.value} cal`;
  }
}

// ── Rest: "descanso 2'" (strength) vs "r2'" (run/erg/funcional/core) ────────
function restToken(restSeconds: number, modality: Modality | undefined): string {
  const d = formatDuration(restSeconds);
  return modality === 'strength' || modality === undefined ? `descanso ${d}` : `r${d}`;
}

// ── Per-set target sequence ─────────────────────────────────────────────────
// All sets share one target → single label ("75% RM"). Same KIND but varying
// values → values joined under one affix ("60/65/70/70/75% RM", "RPE 7/8").
// Mixed kinds → formatted strings joined with "/" (rare, but never lossy).
function targetSequence(targets: (Target | undefined)[]): string {
  const present = targets.filter((t): t is Target => t !== undefined);
  if (present.length === 0) return '';
  const formatted = present.map(formatTarget);
  if (new Set(formatted).size === 1) return formatted[0]!;

  const kind = present[0]!.kind;
  if (present.every((t) => t.kind === kind)) {
    const seq = present
      .map((t) =>
        t.kind === 'bodyweight' || t.kind === 'pace'
          ? ''
          : rangeNum(t.min, t.max, t.value),
      )
      .filter(Boolean)
      .join('/');
    switch (kind) {
      case 'percent_rm':
        return `${seq}% RM`;
      case 'kg':
        return `${seq} kg`;
      case 'rpe':
        return `RPE ${seq}`;
      case 'rir':
        return `RIR ${seq}`;
      case 'hr_zone':
        return `Z${seq}`;
      default:
        break;
    }
  }
  return formatted.join('/');
}

// ── Main renderer ───────────────────────────────────────────────────────────
export function prescriptionToText(p: Prescription): string {
  const sets: PrescriptionSet[] = p.sets ?? [];
  const hasSets = sets.length > 0;

  // Scheme lead — the timed/scored formats announce themselves first.
  let lead = '';
  switch (p.scheme) {
    case 'amrap':
      lead = p.total_s !== undefined ? `AMRAP ${formatDuration(p.total_s)}` : 'AMRAP';
      break;
    case 'emom':
      lead = p.rounds !== undefined ? `EMOM ${p.rounds}'` : 'EMOM';
      break;
    case 'for_time':
      lead = p.rounds !== undefined ? `${p.rounds} rondas For Time` : 'For Time';
      break;
    default:
      break;
  }

  let work = '';
  let targetStr = '';
  let restStr = '';
  let tempoStr = '';

  if (hasSets) {
    const works = sets.map((s) => {
      const m = setMeasure(s);
      return m ? formatMeasure(m) : '';
    });
    const nonEmpty = works.filter(Boolean);
    const uniformWork = nonEmpty.length === sets.length && new Set(works).size === 1;
    // A single representative set (the distance/cal stash of a conditioning
    // block) takes its multiplier from `rounds`; real per-set arrays count sets.
    const count = sets.length > 1 ? sets.length : p.rounds ?? sets.length;
    if (uniformWork) work = count > 1 ? `${count}×${works[0]}` : works[0]!;
    else work = nonEmpty.join('/');

    targetStr = targetSequence(sets.map(setTarget));

    const rests = Array.from(
      new Set(sets.map((s) => s.rest_s).filter((r): r is number => r !== undefined)),
    );
    const restVal = rests.length === 1 ? rests[0] : rests.length === 0 ? p.rest_s : undefined;
    if (restVal !== undefined && restVal > 0) restStr = restToken(restVal, p.modality);

    const tempos = Array.from(
      new Set(sets.map((s) => s.tempo).filter((t): t is string => !!t)),
    );
    if (tempos.length === 1) tempoStr = `tempo ${tempos[0]}`;
  } else {
    switch (p.scheme) {
      case 'interval':
      case 'rounds': {
        const w = p.work_s !== undefined ? formatDuration(p.work_s) : '';
        if (p.rounds !== undefined && w) work = `${p.rounds}×${w}`;
        else if (p.rounds !== undefined) work = `${p.rounds} rondas`;
        else if (w) work = w;
        if (p.rest_s !== undefined && p.rest_s > 0) restStr = restToken(p.rest_s, p.modality);
        break;
      }
      case 'steady':
        if (p.total_s !== undefined) work = formatDuration(p.total_s);
        break;
      case 'emom':
        if (p.work_s !== undefined && p.work_s > 0) work = `${formatDuration(p.work_s)} trabajo`;
        break;
      default:
        break;
    }
  }

  // Block-level intensity (steady Z2, @4:10/km tempo…) when no per-set targets.
  if (!targetStr) {
    const blockTarget = prescriptionTarget(p);
    if (blockTarget) targetStr = formatTarget(blockTarget);
  }

  // Assemble: lead · work @ target · rest · cap · tempo · note.
  let head = work;
  if (targetStr) head = head ? `${head} @ ${targetStr}` : targetStr;

  const out: string[] = [];
  if (lead) out.push(lead);
  if (head) out.push(head);
  if (restStr) out.push(restStr);
  if (p.scheme === 'for_time' && p.total_s !== undefined) {
    out.push(`cap ${formatDuration(p.total_s)}`);
  }
  if (tempoStr) out.push(tempoStr);
  if (p.note) out.push(p.note);

  return out.join(' · ').trim();
}
