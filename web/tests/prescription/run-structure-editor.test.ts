// #61 — the run-structure EDITOR logic (pure tree-ops that back the sequence
// builder) + the SAVE path (editor structure → Prescription → params/schema).
// Verifies the builder can only ever produce a VALID structure and that a built
// structure serializes to a valid, sensible prescription for the wire.

import { describe, expect, test } from 'vitest';
import {
  flattenSegments,
  prescriptionFromStructure,
  prescriptionToParams,
  parsePrescription,
  safeParseRunStructure,
  type Element,
  type RunStructure,
  type Segment,
} from '@fahybrid/shared/domain/prescription';
import {
  appendInto,
  canAddRepeatInto,
  canRemoveAt,
  canWrapInRepeat,
  defaultRecoverySegment,
  defaultRepeat,
  defaultWorkSegment,
  moveAt,
  objetivoKindOf,
  removeAt,
  removeSegmentField,
  setRepeatTimes,
  targetOfKind,
  toKind,
  unwrapRepeat,
  updateSegment,
  wrapInRepeat,
} from '@/components/v2/editor/archetype-forms/run-structure/tree-ops';

const asMain = (elements: Element[]): RunStructure => [{ role: 'main', elements }];
const validMain = (elements: Element[]) => safeParseRunStructure(asMain(elements)).success;

describe('#61 editor · add / remove / move', () => {
  test('append + remove', () => {
    let els = appendInto([], [], defaultWorkSegment());
    els = appendInto(els, [], defaultRecoverySegment());
    expect(els).toHaveLength(2);
    els = removeAt(els, [0]);
    expect(els).toHaveLength(1);
    expect((els[0] as Segment).kind).toBe('recovery');
  });

  test('move up/down respects bounds', () => {
    const a = defaultWorkSegment();
    const b = defaultRecoverySegment();
    const els = [a, b];
    expect(moveAt(els, [0], -1)).toEqual(els); // already first, no-op
    const moved = moveAt(els, [0], 1);
    expect((moved[0] as Segment).kind).toBe('recovery');
    expect((moved[1] as Segment).kind).toBe('work');
  });

  test('a container can never be emptied (last element is not removable)', () => {
    const one = [defaultWorkSegment()];
    expect(canRemoveAt(one, [0])).toBe(false); // last one in the phase → not removable
    const two = [defaultWorkSegment(), defaultRecoverySegment()];
    expect(canRemoveAt(two, [0])).toBe(true);
    // inside a repeat with a single child
    const withRepeat: Element[] = [defaultRepeat()]; // repeat has 1 work
    expect(canRemoveAt(withRepeat, [0, 0])).toBe(false); // the repeat's only child
  });

  test('add work into a repeat container', () => {
    let els: Element[] = [defaultRepeat()]; // Repeat with 1 work
    els = appendInto(els, [0], defaultRecoverySegment());
    const rep = els[0] as Extract<Element, { times: number }>;
    expect(rep.elements).toHaveLength(2);
    expect(validMain(els)).toBe(true);
  });
});

describe('#61 editor · nesting depth guards (can never build depth > 2)', () => {
  test('canAddRepeatInto: root ok, one-level ok, two-level no', () => {
    expect(canAddRepeatInto([])).toBe(true); // child repeat = depth 1
    expect(canAddRepeatInto([0])).toBe(true); // depth 2
    expect(canAddRepeatInto([0, 0])).toBe(false); // depth 3
  });

  test('canWrapInRepeat: root/one-level ok, two-level no', () => {
    expect(canWrapInRepeat([0])).toBe(true);
    expect(canWrapInRepeat([0, 0])).toBe(true);
    expect(canWrapInRepeat([0, 0, 0])).toBe(false);
  });

  test('wrap then unwrap round-trips', () => {
    const els = [defaultWorkSegment(), defaultRecoverySegment()];
    const wrapped = wrapInRepeat(els, [0]);
    expect((wrapped[0] as Extract<Element, { times: number }>).times).toBe(2);
    const unwrapped = unwrapRepeat(wrapped, [0]);
    expect(unwrapped).toHaveLength(2);
    expect((unwrapped[0] as Segment).kind).toBe('work');
  });
});

describe('#61 editor · segment edits', () => {
  test('toKind work → recovery forces a duration measure + parado', () => {
    const w: Segment = { kind: 'work', measure: { type: 'distance', m: 400 }, target: null };
    const r = toKind(w, 'recovery');
    expect(r.kind).toBe('recovery');
    expect(r.measure.type).toBe('duration');
    expect(r.recovery_mode).toBe('parado');
  });

  test('objetivo kind switch carries the numeric value', () => {
    expect(objetivoKindOf(null)).toBe('none');
    const z = targetOfKind('pace_zone', { type: 'hr_zone', zone: 4 });
    expect(z).toEqual({ type: 'pace_zone', zone: 4 }); // zone carried across
    const r = targetOfKind('rpe', { type: 'rpe', min: 8, max: 9 });
    expect(r).toEqual({ type: 'rpe', value: 8 });
  });

  test('removeSegmentField omits the key cleanly (no undefined)', () => {
    let els: Element[] = [{ kind: 'work', measure: { type: 'distance', m: 200 }, target: null, incline_pct: 8 }];
    els = removeSegmentField(els, [0], 'incline_pct');
    expect('incline_pct' in (els[0] as Segment)).toBe(false);
    expect(validMain(els)).toBe(true);
  });

  test('setRepeatTimes updates the count', () => {
    const els = setRepeatTimes([defaultRepeat()], [0], 6);
    expect((els[0] as Extract<Element, { times: number }>).times).toBe(6);
  });
});

describe('#61 editor · build a real 6×1000 and SAVE it', () => {
  test('built structure → valid prescription with a sensible flatten', () => {
    // Build "6×1000 @ Z3, rec 90″" the way the UI would: a Repeat with a work + rec.
    let repeat = defaultRepeat(); // {times:4, elements:[work 1000 z3]}
    // add a recovery into it, set times 6
    let els: Element[] = [repeat];
    els = appendInto(els, [0], defaultRecoverySegment());
    els = setRepeatTimes(els, [0], 6);
    // set the work distance to 1000 (default already 1000) and confirm valid.
    expect(validMain(els)).toBe(true);

    const structure = asMain(els);
    const works = flattenSegments(structure).filter((s) => s.kind === 'work');
    expect(works).toHaveLength(6);

    // SAVE: build the persisted prescription + its scalar params, validate the wire.
    const p = prescriptionFromStructure(structure);
    const reparsed = parsePrescription(p); // throws if the wire rejects it
    expect(reparsed.structure).toBeDefined();
    expect(reparsed.scheme).toBe('intervals');
    expect(reparsed.rounds).toBe(6); // flatten: total work bouts

    const params = prescriptionToParams(p);
    // The flatten carries the first work as a representative distance set + rest.
    expect(params.rest_seconds).toBe(60); // default recovery is 60″ parado
    expect(params.distance_meters).toBe(1000);
  });

  test('updateSegment through a nested path stays valid', () => {
    let els: Element[] = [defaultRepeat()];
    els = updateSegment(els, [0, 0], { measure: { type: 'distance', m: 800 } });
    const rep = els[0] as Extract<Element, { times: number }>;
    expect((rep.elements[0] as Segment).measure).toEqual({ type: 'distance', m: 800 });
    expect(validMain(els)).toBe(true);
  });
});
