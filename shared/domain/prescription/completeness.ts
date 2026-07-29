// Prescription COMPLETENESS — the objective minimum dose a prescribed item must
// carry to be a real training item, per modality.
//
// `prescriptionSchema` answers "is this well-formed?"; it does NOT answer "is this
// a workout?". `{ scheme: 'sets' }` parses clean and is still garbage: three
// exercise names with no reps, no load, no rest is not a strength session. This
// module is the second gate — the one that separates a NAME from a PRESCRIPTION.
//
// The rule, stated once: every prescription is HOW the work is measured
// (distance | time | reps | calories) × AGAINST WHAT target (pace | zone | RPE |
// %RM | RIR) × BY MODALITY. A modality's minimum is what the athlete needs to
// execute the set without guessing.
//
// Pure + dependency-free (no I/O, no server-only) so both the composer and the
// import review grid run the identical gate.
//
// TWO BARS, ONE RULE SET
// ----------------------
// The bar for AUTHORED content is higher than the bar for TRANSCRIBED content,
// and the difference is not a matter of taste:
//
//   · The composer AUTHORS. When the model writes "Back Squat 5×5" with no load
//     it has not done its job — there is no coach behind that line to fill the
//     gap. It must clear the STRICT bar (`ok`): dose AND intensity AND rest.
//   · The importer TRANSCRIBES what a coach already wrote. "Pull-ups 4×10" is
//     bodyweight (there is no %RM to state — that is why `bodyweight` is a
//     Target kind); "trote suave 30'" is complete and unambiguous. Its job is to
//     capture the coach faithfully, not to lecture him about his own plan. It
//     clears the EXECUTABLE bar (`isExecutable`): the item must carry a dose.
//
// So each issue is tagged and the CALLER picks the bar:
//   · `blocking` — the item cannot be executed at all (no dose, a capped format
//     with no cap, a set with no measure). Nobody may ship this, ever.
//   · `advisory` — coach discretion (intensity, rest between sets). Absent is a
//     legitimate authoring choice for a human, and a defect for a machine.
//
// Measured against Pablo's canonical 12-week workbook (369 real parsed items):
// the strict bar rejects 57% of what he imports every week; the executable bar
// rejects 0 of the 137 typed items in his canonical weeks. That gap IS this
// distinction — do not collapse the two bars back into one.

import {
  setMeasure,
  setTarget,
  prescriptionTarget,
  type Measure,
  type Modality,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from './types';

/** Where the item sits in the session. Warm-up/cool-down doses are unambiguous at
 *  face value ("trote suave 10'"), so they do not require an intensity target;
 *  a main set without one ("Back Squat 5×5" — at what load?) is ambiguous. */
export type PrescriptionRole = 'calentamiento' | 'principal' | 'vuelta';

/** `blocking` = not executable by anyone. `advisory` = coach discretion (see the
 *  TWO BARS note above). */
export type CompletenessSeverity = 'blocking' | 'advisory';

export interface CompletenessIssue {
  severity: CompletenessSeverity;
  /** Coach-facing, in Spanish — surfaced verbatim. */
  message: string;
}

export interface CompletenessResult {
  /** The STRICT bar: zero issues of any severity. What AUTHORED content must clear. */
  ok: boolean;
  /** Every issue's message, in evaluation order. */
  reasons: string[];
  /** The same issues, tagged with severity, so a caller can pick its own bar. */
  issues: CompletenessIssue[];
}

/**
 * Does this prescription state how much work to do — anywhere? The universal
 * floor shared by the completeness gate and the duration reader
 * (`./duration.ts`), defined ONCE so the two can never disagree about whether an
 * item was dosed. `rounds` deliberately does not count: it says when to STOP,
 * never what to DO ("6 rondas de Box Jump" does not say how many box jumps).
 */
export function hasAnyDose(p: Prescription): boolean {
  const hasBlockDose = p.total_s != null || p.work_s != null || p.structure != null;
  const hasSetDose = (p.sets ?? []).some((s) => setMeasure(s) != null);
  return hasBlockDose || hasSetDose;
}

const blocking = (message: string): CompletenessIssue => ({ severity: 'blocking', message });
const advisory = (message: string): CompletenessIssue => ({ severity: 'advisory', message });

function result(issues: CompletenessIssue[]): CompletenessResult {
  return { ok: issues.length === 0, reasons: issues.map((i) => i.message), issues };
}

/** The EXECUTABLE bar: nothing stops the athlete from doing this item as written.
 *  What TRANSCRIBED content (the importer) must clear. */
export function isExecutable(r: CompletenessResult): boolean {
  return !r.issues.some((i) => i.severity === 'blocking');
}

/** Only the reasons that make the item non-executable — the ones worth blocking on. */
export function blockingReasons(r: CompletenessResult): string[] {
  return r.issues.filter((i) => i.severity === 'blocking').map((i) => i.message);
}

/** Schemes whose dose lives at the block level (a cap/round count), not per set. */
const CAPPED_SCHEMES = new Set(['amrap', 'emom', 'tabata', 'death_by']);

/** Targets that answer "how hard?" for a running/erg effort. */
const ENDURANCE_TARGETS = new Set<Target['kind']>([
  'pace',
  'hr_zone',
  'hr_bpm',
  'rpe',
  'watts',
]);

/** Targets that answer "how heavy?" for a strength set. */
const LOAD_TARGETS = new Set<Target['kind']>([
  'percent_rm',
  'kg',
  'rir',
  'rpe',
  'bodyweight',
]);

const MEASURE_LABEL: Record<Measure['kind'], string> = {
  reps: 'repeticiones',
  distance: 'distancia',
  duration: 'tiempo',
  calories: 'calorías',
};

/** The set's effective target: its own, else the block-level one it inherits. */
function effectiveTarget(s: PrescriptionSet, p: Prescription): Target | undefined {
  return setTarget(s) ?? prescriptionTarget(p);
}

function measureKinds(sets: PrescriptionSet[]): Array<Measure['kind'] | null> {
  return sets.map((s) => setMeasure(s)?.kind ?? null);
}

function listMeasures(kinds: Array<Measure['kind']>): string {
  return kinds.map((k) => MEASURE_LABEL[k]).join(' o ');
}

/**
 * Does this prescription carry the minimum dose its modality objectively needs?
 *
 * `modality` is the EXERCISE's modality (intrinsic to the catalog row, mig 0053) —
 * pass it from the catalog, not from `prescription.modality`, which is a hint the
 * writer may omit. When it is unknown we fall back to the universal floor (there
 * must be a dose at all) rather than inventing a stricter rule we cannot justify.
 */
export function checkPrescriptionCompleteness(
  p: Prescription,
  opts: { modality?: Modality | null; role?: PrescriptionRole } = {},
): CompletenessResult {
  const role = opts.role ?? 'principal';
  const modality = opts.modality ?? p.modality ?? null;
  const sets = p.sets ?? [];
  const issues: CompletenessIssue[] = [];

  // ── Universal floor: there must be a dose SOMEWHERE ───────────────────────
  //
  // A CAP is not a DOSE, and conflating them was a hole in this floor.
  // `rounds` says when to STOP, never what to DO: "6 rondas de Box Jump" passed
  // as prescribed and does not say how many box jumps — the athlete guesses,
  // which is the exact failure this module exists to catch. `total_s`/`work_s`
  // ARE work ("rueda 45'" is a complete instruction on its own), and a #61 run
  // structure carries its dose inside its phases.
  const hasCap = p.total_s != null || p.rounds != null || p.work_s != null;
  if (!hasAnyDose(p)) {
    return result([
      blocking('Sin dosis: no dice cuánto trabajo hacer (ni medida, ni tiempo).'),
    ]);
  }

  // A capped scheme must state its cap. Here `rounds` DOES count — an EMOM ×10
  // whose sets carry the work is fully prescribed; the round count is the cap.
  if (CAPPED_SCHEMES.has(p.scheme) && !hasCap) {
    issues.push(blocking(`Formato ${p.scheme} sin límite: falta duración total o rondas.`));
  }

  // ── Per-modality minimums ─────────────────────────────────────────────────
  const needsTarget = role === 'principal';

  switch (modality) {
    case 'run': {
      requireSetMeasures(sets, ['distance', 'duration'], 'Correr', issues);
      if (needsTarget) {
        requireSetTargets(sets, p, ENDURANCE_TARGETS, 'ritmo, zona, pulso o RPE', issues);
      }
      requireIntervalRest(sets, issues);
      break;
    }
    case 'row':
    case 'ski':
    case 'bike': {
      requireSetMeasures(sets, ['distance', 'duration', 'calories'], 'Ergo', issues);
      if (needsTarget) {
        requireSetTargets(sets, p, ENDURANCE_TARGETS, 'ritmo /500m, watts, zona o RPE', issues);
      }
      requireIntervalRest(sets, issues);
      break;
    }
    case 'strength': {
      if (sets.length === 0) {
        issues.push(blocking('Fuerza sin series: hacen falta series con repeticiones y carga.'));
        break;
      }
      requireSetMeasures(sets, ['reps', 'duration'], 'Fuerza', issues);
      if (needsTarget) {
        requireSetTargets(sets, p, LOAD_TARGETS, 'carga (%RM, kg, RIR o RPE)', issues);
        // Rest between strength sets is part of the dose, not a nicety: the same
        // 5×5 at 2' and at 4' are different sessions.
        const missingRest = sets.slice(0, -1).some((s) => s.rest_s == null);
        if (missingRest && p.rest_s == null) {
          issues.push(advisory('Fuerza sin descanso entre series.'));
        }
      }
      break;
    }
    case 'core':
    case 'mobility': {
      requireSetMeasures(sets, ['reps', 'duration'], 'Core/movilidad', issues);
      break;
    }
    case 'functional': {
      // A WOD movement's dose is its measure; the intensity is the cap/format, so
      // no per-set target is required (10 burpees is 10 burpees).
      if (!CAPPED_SCHEMES.has(p.scheme)) {
        requireSetMeasures(sets, ['reps', 'distance', 'duration', 'calories'], 'Funcional', issues);
      }
      break;
    }
    default:
      // Unknown/other modality: the universal floor above is all we can justify.
      break;
  }

  return result(issues);
}

/** A set with no measure — or measured in a unit its modality cannot execute (a
 *  run of "20 reps") — leaves the athlete with nothing to do. BLOCKING. */
function requireSetMeasures(
  sets: PrescriptionSet[],
  allowed: Array<Measure['kind']>,
  label: string,
  issues: CompletenessIssue[],
): void {
  if (sets.length === 0) return; // block-level dose already accepted upstream.
  const kinds = measureKinds(sets);
  const allowedSet = new Set(allowed);
  const bad = kinds.filter((k) => k == null || !allowedSet.has(k));
  if (bad.length > 0) {
    issues.push(blocking(`${label}: cada serie necesita ${listMeasures(allowed)}.`));
  }
}

/** ADVISORY: the intensity is what a machine must state and a coach may leave to
 *  the gym — a bodyweight pull-up has no %RM, an easy jog needs no pace. */
function requireSetTargets(
  sets: PrescriptionSet[],
  p: Prescription,
  allowed: Set<Target['kind']>,
  label: string,
  issues: CompletenessIssue[],
): void {
  if (sets.length === 0) {
    // No sets, but a block dose exists (e.g. steady with only total_s): the
    // block-level target must then carry the intensity.
    const t = prescriptionTarget(p);
    if (!t || !allowed.has(t.kind)) issues.push(advisory(`Sin objetivo: falta ${label}.`));
    return;
  }
  const missing = sets.some((s) => {
    const t = effectiveTarget(s, p);
    return !t || !allowed.has(t.kind);
  });
  if (missing) issues.push(advisory(`Sin objetivo: falta ${label}.`));
}

/** Multi-set endurance work is intervals; intervals without a recovery are not
 *  prescribed. The last set needs no rest (the session ends). ADVISORY — the work
 *  itself is still executable. */
function requireIntervalRest(sets: PrescriptionSet[], issues: CompletenessIssue[]): void {
  if (sets.length < 2) return;
  const missing = sets.slice(0, -1).some((s) => s.rest_s == null);
  if (missing) issues.push(advisory('Series sin descanso entre repeticiones.'));
}
