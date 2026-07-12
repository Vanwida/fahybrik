// Pure, immutable tree operations for the run-structure editor. A location in a
// phase's element tree is a PATH of indices (e.g. [1, 0] = element 0 inside the
// Repeat at index 1). Every op returns a NEW elements array — the React form just
// swaps state. Depth (max 2 nested Repeats) is enforced here so the UI can never
// build an invalid structure.

import {
  isRepeat,
  type Element,
  type Phase,
  type Segment,
  type SegmentTarget,
} from '@fahybrid/shared/domain/prescription';

const MAX_REPEAT_DEPTH = 2;

// ── Container mapping (the one primitive the rest are built on) ───────────────
// Transform the elements array of the container at `containerPath` ([] = root).
function mapContainer(
  elements: Element[],
  containerPath: number[],
  fn: (arr: Element[]) => Element[],
): Element[] {
  if (containerPath.length === 0) return fn(elements);
  const [head, ...rest] = containerPath;
  return elements.map((el, i) =>
    i === head && isRepeat(el) ? { ...el, elements: mapContainer(el.elements, rest, fn) } : el,
  );
}

// Transform the single element at `path`.
function mapElementAt(elements: Element[], path: number[], fn: (el: Element) => Element): Element[] {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return mapContainer(elements, parent, (arr) => arr.map((el, i) => (i === idx ? fn(el) : el)));
}

// ── Read ──────────────────────────────────────────────────────────────────────
export function elementAt(elements: Element[], path: number[]): Element | undefined {
  let arr: Element[] | undefined = elements;
  let el: Element | undefined;
  for (const i of path) {
    if (!arr) return undefined;
    el = arr[i];
    arr = el && isRepeat(el) ? el.elements : undefined;
  }
  return el;
}

/** Repeat-nesting depth a NEW child added into `containerPath` would sit at (root children = depth 1). */
export function childRepeatDepth(containerPath: number[]): number {
  return containerPath.length + 1;
}

/** Can a Repeat be added into the container at `containerPath` without exceeding depth 2? */
export function canAddRepeatInto(containerPath: number[]): boolean {
  return childRepeatDepth(containerPath) <= MAX_REPEAT_DEPTH;
}

/** Can the element at `path` be wrapped into a new Repeat without exceeding depth 2? */
export function canWrapInRepeat(path: number[]): boolean {
  // The new Repeat takes the element's slot: its depth = (# Repeat ancestors) + 1.
  // path.length-1 Repeat ancestors sit above; new repeat depth = path.length.
  return path.length <= MAX_REPEAT_DEPTH;
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function appendInto(elements: Element[], containerPath: number[], newEl: Element): Element[] {
  return mapContainer(elements, containerPath, (arr) => [...arr, newEl]);
}

export function updateElement(elements: Element[], path: number[], next: Element): Element[] {
  return mapElementAt(elements, path, () => next);
}

export function updateSegment(
  elements: Element[],
  path: number[],
  patch: Partial<Segment>,
): Element[] {
  return mapElementAt(elements, path, (el) => (isRepeat(el) ? el : { ...el, ...patch }));
}

export function setRepeatTimes(elements: Element[], path: number[], times: number): Element[] {
  return mapElementAt(elements, path, (el) => (isRepeat(el) ? { ...el, times } : el));
}

/** Remove an optional numeric field from a segment (clean omit, not `undefined`). */
export function removeSegmentField(
  elements: Element[],
  path: number[],
  field: 'incline_pct' | 'cadence_spm',
): Element[] {
  return mapElementAt(elements, path, (el) => {
    if (isRepeat(el)) return el;
    const next: Segment = { ...el };
    delete next[field];
    return next;
  });
}

export function removeAt(elements: Element[], path: number[]): Element[] {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return mapContainer(elements, parent, (arr) => arr.filter((_, i) => i !== idx));
}

/** Move the element at `path` up (-1) or down (+1) among its siblings. */
export function moveAt(elements: Element[], path: number[], dir: -1 | 1): Element[] {
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return mapContainer(elements, parent, (arr) => {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = arr.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    return next;
  });
}

/** Wrap the element at `path` into a fresh Repeat ×2 (if depth allows). */
export function wrapInRepeat(elements: Element[], path: number[]): Element[] {
  if (!canWrapInRepeat(path)) return elements;
  return mapElementAt(elements, path, (el) => ({ times: 2, elements: [el] }));
}

/** Unwrap a Repeat at `path`, splicing its children into the parent in place. */
export function unwrapRepeat(elements: Element[], path: number[]): Element[] {
  const target = elementAt(elements, path);
  if (!target || !isRepeat(target)) return elements;
  const parent = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return mapContainer(elements, parent, (arr) => [
    ...arr.slice(0, idx),
    ...target.elements,
    ...arr.slice(idx + 1),
  ]);
}

// ── Defaults (sensible, never empty) ──────────────────────────────────────────
export function defaultWorkSegment(): Segment {
  return { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 3 } };
}
export function defaultRecoverySegment(): Segment {
  return { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' };
}
export function defaultRepeat(): Element {
  return { times: 4, elements: [defaultWorkSegment()] };
}

// ── Segment kind flip (keeps a coherent measure/mode) ─────────────────────────
export function toKind(seg: Segment, kind: Segment['kind']): Segment {
  if (seg.kind === kind) return seg;
  if (kind === 'recovery') {
    // A recovery defaults to a standing rest (timed); keep the measure if it is a
    // duration, else switch to a 60″ rest so `parado` stays valid.
    const measure = seg.measure.type === 'duration' ? seg.measure : { type: 'duration' as const, s: 60 };
    return { kind: 'recovery', measure, target: seg.target, recovery_mode: 'parado' };
  }
  // → work: drop recovery_mode.
  const { recovery_mode: _rm, ...rest } = seg;
  void _rm;
  return { ...rest, kind: 'work' };
}

// ── Target defaults per kind (carry a numeric value across kind switches) ─────
export type ObjetivoKind = 'pace' | 'pace_zone' | 'hr_zone' | 'rpe' | 'none';

export function objetivoKindOf(t: SegmentTarget | null): ObjetivoKind {
  return t ? t.type : 'none';
}

export function targetOfKind(kind: ObjetivoKind, prev: SegmentTarget | null): SegmentTarget | null {
  switch (kind) {
    case 'none':
      return null;
    case 'pace': {
      const carry = prev && prev.type === 'pace' ? prev : undefined;
      return { type: 'pace', value_s: carry?.value_s ?? 270 };
    }
    case 'pace_zone': {
      const carry = prev && (prev.type === 'pace_zone' || prev.type === 'hr_zone') ? prev.zone : 3;
      return { type: 'pace_zone', zone: carry };
    }
    case 'hr_zone': {
      const carry = prev && (prev.type === 'pace_zone' || prev.type === 'hr_zone') ? prev.zone : 2;
      return { type: 'hr_zone', zone: carry };
    }
    case 'rpe': {
      const carry = prev && prev.type === 'rpe' ? (prev.value ?? prev.min) : 8;
      return { type: 'rpe', value: carry ?? 8 };
    }
  }
}

/** Set (or clear) the `main` phase's elements, preserving other phases. */
export function setPhaseElements(phases: Phase[], role: Phase['role'], elements: Element[]): Phase[] {
  return phases.map((p) => (p.role === role ? { ...p, elements } : p));
}
