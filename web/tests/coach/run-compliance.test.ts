// Pure unit tests for the coach run-compliance WIRE (#66) — buildRunCompliance
// takes assembled workout blocks + logged actuals and returns per-tramo verdicts
// + the session aggregate. No DB: synthetic AssignmentDetailWorkout / SegmentActual.

import { describe, expect, test } from 'vitest';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import type {
  AssignmentDetailItem,
  AssignmentDetailWorkout,
  ResolvedIntensity,
} from '@/lib/athlete/assignment-detail';
import type { Prescription, Segment, SegmentMeasure, SegmentTarget } from '@fahybrid/shared/domain/prescription';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

// ── fixtures ──────────────────────────────────────────────────────────────────
let seq = 0;
function makeItem(overrides: Partial<AssignmentDetailItem>): AssignmentDetailItem {
  const id = ++seq;
  return {
    uid: `segment-${id}`,
    template_segment_id: id,
    exercise_id: String(id),
    exercise_name: 'Carrera',
    exercise_slug: 'run',
    exercise_category: 'run',
    exercise_video_url: null,
    cues: null,
    exercise_description: null,
    params_json: {},
    prescription_json: null,
    resolved_intensity: null,
    resolved_load: null,
    notes: null,
    ...overrides,
  };
}

function runItem(prescription: Prescription, resolved?: ResolvedIntensity, uid?: string): AssignmentDetailItem {
  return makeItem({
    ...(uid ? { uid, template_segment_id: Number(uid.replace('segment-', '')) } : {}),
    prescription_json: prescription,
    resolved_intensity: resolved ?? null,
  });
}

function zoneBand(fast_s: number, slow_s: number | null): ResolvedIntensity {
  return { zone_label: 'Z4', range_label: 'banda', fast_s, slow_s, pace_unit: 'per_km', needs_review: false };
}

function workout(items: AssignmentDetailItem[]): AssignmentDetailWorkout {
  return {
    name: 'Sesión',
    focus: null,
    coach_note: null,
    estimated_duration_minutes: null,
    blocks: [
      { uid: 'b1', title: 'Principal', format: 'intervals', block_position: 0, coach_note: null, config_json: {}, items },
    ],
  };
}

function lap(item_uid: string, position: number, over: Partial<SegmentActual> = {}): SegmentActual {
  return {
    position,
    item_uid,
    modality: 'run',
    duration_seconds: null,
    reps_completed: null,
    weight_used_kg: null,
    distance_meters: null,
    avg_pace_s_per_500m: null,
    avg_pace_s_per_km: null,
    avg_power_w: null,
    stroke_rate_spm: null,
    avg_hr: null,
    max_hr: null,
    calories: null,
    emom_rounds_completed: null,
    emom_rounds_prescribed: null,
    incline_pct: null,
    run_cadence_spm: null,
    drag_factor: null,
    avg_calories_per_hour: null,
    peak_drive_force_lbs: null,
    avg_drive_force_lbs: null,
    erg_splits: null,
    run_splits: null,
    source: null,
    zone_seconds: null,
    leg_index: null,
    leg_role: null,
    leg_phase: null,
    is_structural: false,
    ...over,
  };
}

// Un tramo del camino NATIVO (mig 0146): measure/target explícitos, `resolved`
// opcional para simular lo que `assignment-detail.ts` ya adjunta por tramo.
const dist = (m: number): SegmentMeasure => ({ type: 'distance', m });
const dur = (s: number): SegmentMeasure => ({ type: 'duration', s });
function workSeg(target: SegmentTarget | null, resolved?: ResolvedIntensity): Segment {
  return { kind: 'work', measure: dist(800), target, ...(resolved ? { resolved } : {}) };
}
function recoverySeg(target: SegmentTarget | null, resolved?: ResolvedIntensity): Segment {
  return { kind: 'recovery', measure: dur(90), target, recovery_mode: 'trote', ...(resolved ? { resolved } : {}) };
}

/** Un item con `structure` nativa (una sola fase 'main') + sus laps con
 *  `leg_index`/`leg_role` ya puestos en el orden de `flattenSegments`. */
function nativeItem(segments: Segment[], uid: string): AssignmentDetailItem {
  return runItem(
    { scheme: 'intervals', modality: 'run', structure: [{ role: 'main', elements: segments }] },
    undefined,
    uid,
  );
}
function legLap(itemUid: string, legIndex: number, role: Segment['kind'], over: Partial<SegmentActual> = {}): SegmentActual {
  return lap(itemUid, legIndex, { leg_index: legIndex, leg_role: role, leg_phase: 'main', ...over });
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe('buildRunCompliance — zone tramo (resolved band)', () => {
  const presc: Prescription = { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 4 } };

  test('executed pace inside the resolved band → dentro, 100%', () => {
    const item = runItem(presc, zoneBand(245, 255), 'segment-100');
    const res = buildRunCompliance(workout([item]), [lap('segment-100', 1, { avg_pace_s_per_km: 250 })]);
    expect(res.tramos).toEqual([{ item_uid: 'segment-100', position: 1, verdict: 'dentro' }]);
    expect(res.summary.pct_dentro).toBe(100);
    expect(res.summary.evaluable).toBe(1);
  });

  test('faster than the resolved band → fuera_rapido', () => {
    const item = runItem(presc, zoneBand(245, 255), 'segment-101');
    const res = buildRunCompliance(workout([item]), [lap('segment-101', 1, { avg_pace_s_per_km: 238 })]);
    expect(res.tramos[0]!.verdict).toBe('fuera_rapido');
    expect(res.summary.pct_dentro).toBe(0);
  });

  test('a zone with no resolved snapshot → sin_dato (never fabricated)', () => {
    const item = runItem(presc, undefined, 'segment-102'); // athlete untested
    const res = buildRunCompliance(workout([item]), [lap('segment-102', 1, { avg_pace_s_per_km: 250 })]);
    expect(res.tramos[0]!.verdict).toBe('sin_dato');
    expect(res.summary.pct_dentro).toBeNull();
  });
});

describe('buildRunCompliance — explicit pace band tramo', () => {
  const presc: Prescription = {
    scheme: 'steady',
    modality: 'run',
    target: { kind: 'pace', unit: 'per_km', min_s: 265, max_s: 275 },
  };

  test('slower than the band → fuera_lento', () => {
    const item = runItem(presc, undefined, 'segment-110');
    const res = buildRunCompliance(workout([item]), [lap('segment-110', 1, { avg_pace_s_per_km: 300 })]);
    expect(res.tramos[0]!.verdict).toBe('fuera_lento');
  });

  test('pace derived from distance + duration when the lap has no pace column', () => {
    const item = runItem(presc, undefined, 'segment-111');
    // 1000 m in 270 s → 270 s/km → inside 265–275
    const res = buildRunCompliance(
      workout([item]),
      [lap('segment-111', 1, { distance_meters: 1000, duration_seconds: 270 })],
    );
    expect(res.tramos[0]!.verdict).toBe('dentro');
  });
});

describe('buildRunCompliance — non-run + no-execution', () => {
  test('a non-run item is ignored entirely', () => {
    const strength: Prescription = { scheme: 'sets', modality: 'strength', target: { kind: 'percent_rm', value: 80 } };
    const item = runItem(strength, undefined, 'segment-120');
    const res = buildRunCompliance(workout([item]), [lap('segment-120', 1, { modality: 'strength', avg_pace_s_per_km: 250 })]);
    expect(res.tramos).toEqual([]);
    expect(res.summary.total).toBe(0);
  });

  test('a prescribed run tramo with no execution → one sin_dato (position null)', () => {
    const presc: Prescription = { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 2 } };
    const item = runItem(presc, zoneBand(300, null), 'segment-121');
    const res = buildRunCompliance(workout([item]), []);
    expect(res.tramos).toEqual([{ item_uid: 'segment-121', position: null, verdict: 'sin_dato' }]);
    expect(res.summary.total).toBe(1);
    expect(res.summary.evaluable).toBe(0);
  });
});

describe('buildRunCompliance — native/legacy multi-lap structure', () => {
  test('one template_segment executed as N laps → work segments zipped to laps in order', () => {
    // A legacy intervals block (2 rounds) → legacyToStructure expands to 2 work
    // segments; two laps under the same item_uid align to them positionally.
    const presc: Prescription = {
      scheme: 'intervals',
      modality: 'run',
      rounds: 2,
      work_s: 180,
      rest_s: 60,
      target: { kind: 'pace', unit: 'per_km', min_s: 245, max_s: 255 },
    };
    const item = runItem(presc, undefined, 'segment-130');
    const res = buildRunCompliance(workout([item]), [
      lap('segment-130', 1, { avg_pace_s_per_km: 250 }), // dentro
      lap('segment-130', 2, { avg_pace_s_per_km: 238 }), // fuera_rapido
    ]);
    expect(res.tramos.map((t) => t.verdict)).toEqual(['dentro', 'fuera_rapido']);
    expect(res.summary).toMatchObject({ total: 2, evaluable: 2, dentro: 1, fuera_rapido: 1, pct_dentro: 50 });
  });
});

describe('buildRunCompliance — session aggregate over a mixed session', () => {
  test('% counts only evaluable tramos across the whole session', () => {
    const warm = runItem(
      { scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 1 } },
      undefined, // no snapshot → sin_dato
      'segment-140',
    );
    const rep1 = runItem({ scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 5 } }, zoneBand(240, 250), 'segment-141');
    const rep2 = runItem({ scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 5 } }, zoneBand(240, 250), 'segment-142');
    const res = buildRunCompliance(workout([warm, rep1, rep2]), [
      lap('segment-140', 1, { avg_pace_s_per_km: 330 }),
      lap('segment-141', 2, { avg_pace_s_per_km: 245 }), // dentro
      lap('segment-142', 3, { avg_pace_s_per_km: 260 }), // fuera_lento
    ]);
    expect(res.summary.total).toBe(3);
    expect(res.summary.sin_dato).toBe(1);
    expect(res.summary.evaluable).toBe(2);
    expect(res.summary.pct_dentro).toBe(50); // 1 dentro of 2 evaluable
  });
});

// ── Recuperación (#66, Alex 12-ago): el camino NATIVO ─────────────────────────
describe('buildRunCompliance — REGRESIÓN: el veredicto del trabajo no cambia', () => {
  test('camino nativo con leg_index: el trabajo se juzga exactamente igual con o sin recuperaciones alrededor', () => {
    // 2×800 @ Z4 con recuperación SIN objetivo (parado, como seguía siendo el
    // default de "series" hasta este mismo lote) — el trabajo tiene que dar
    // los mismos dos veredictos que si la recuperación no existiera en absoluto.
    const segs = [
      workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)),
      recoverySeg(null), // parado, sin objetivo — el default histórico
      workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)),
      recoverySeg(null),
    ];
    const item = nativeItem(segs, 'segment-200');
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-200', 0, 'work', { avg_pace_s_per_km: 245 }), // dentro
      legLap('segment-200', 1, 'recovery', { avg_pace_s_per_km: 500 }),
      legLap('segment-200', 2, 'work', { avg_pace_s_per_km: 235 }), // fuera_rapido
      legLap('segment-200', 3, 'recovery', { avg_pace_s_per_km: 480 }),
    ]);

    expect(res.tramos.map((t) => t.verdict)).toEqual(['dentro', 'fuera_rapido']);
    expect(res.summary).toMatchObject({ total: 2, evaluable: 2, dentro: 1, fuera_rapido: 1, pct_dentro: 50 });
    // Sin objetivo → ninguna de las dos recuperaciones se juzga, en ningún lado.
    expect(res.recovery_tramos).toEqual([]);
    expect(res.recovery_summary).toMatchObject({ total: 0, pct_controlada: null });
  });
});

describe('buildRunCompliance — recuperación SIN objetivo: no se juzga, se omite', () => {
  test('una recuperación "parado"/"caminar" sin target no aparece en tramos ni en recovery_tramos', () => {
    const item = nativeItem([workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)), recoverySeg(null)], 'segment-210');
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-210', 0, 'work', { avg_pace_s_per_km: 245 }),
      legLap('segment-210', 1, 'recovery', { avg_pace_s_per_km: 600 }),
    ]);
    expect(res.recovery_tramos).toEqual([]);
    expect(res.recovery_summary.total).toBe(0);
  });
});

describe('buildRunCompliance — recuperación CON objetivo: se juzga, con su propio veredicto', () => {
  test('demasiado rápida (más intensa de lo pedido) → demasiado_rapida', () => {
    const item = nativeItem(
      [workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)), recoverySeg({ type: 'pace_zone', zone: 1 }, zoneBand(330, 360))],
      'segment-220',
    );
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-220', 0, 'work', { avg_pace_s_per_km: 245 }),
      legLap('segment-220', 1, 'recovery', { avg_pace_s_per_km: 300 }), // más rápido que 330 → demasiado_rapida
    ]);
    expect(res.recovery_tramos).toEqual([{ item_uid: 'segment-220', position: 1, verdict: 'demasiado_rapida' }]);
    expect(res.recovery_summary).toMatchObject({ evaluable: 1, demasiado_rapida: 1, controlada: 0, pct_controlada: 0 });
  });

  test('más lenta de lo pedido → controlada, NUNCA un aviso (es el eje que se invierte respecto al trabajo)', () => {
    const item = nativeItem(
      [workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)), recoverySeg({ type: 'pace_zone', zone: 1 }, zoneBand(330, 360))],
      'segment-221',
    );
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-221', 0, 'work', { avg_pace_s_per_km: 245 }),
      legLap('segment-221', 1, 'recovery', { avg_pace_s_per_km: 450 }), // mucho más lento que 360 → controlada, no un fallo
    ]);
    expect(res.recovery_tramos).toEqual([{ item_uid: 'segment-221', position: 1, verdict: 'controlada' }]);
    expect(res.recovery_summary.pct_controlada).toBe(100);
  });

  test('dentro de la banda pedida → controlada', () => {
    const item = nativeItem(
      [workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)), recoverySeg({ type: 'rpe', value: 3 })],
      'segment-222',
    );
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-222', 0, 'work', { avg_pace_s_per_km: 245 }),
      legLap('segment-222', 1, 'recovery'), // sin RPE por-tramo capturado hoy → sin_dato honesto
    ]);
    expect(res.recovery_tramos).toEqual([{ item_uid: 'segment-222', position: 1, verdict: 'sin_dato' }]);
  });
});

describe('buildRunCompliance — segmentBand prefiere el `resolved` del propio tramo', () => {
  test('una recuperación en Z1 dentro de un bloque de trabajo en Z4 se juzga contra SU banda, no la del bloque', () => {
    // Si segmentBand cayera al item.resolved_intensity (la banda de Z4 del
    // trabajo, 240–250), un ritmo de recuperación de 345 saldría "fuera_rapido"
    // (245 < 345, pero muy por debajo de 250... en realidad 345 > 250 sería
    // fuera_lento contra Z4) — cualquiera de las dos lecturas sería una banda
    // equivocada. Contra SU banda (Z1, 330–360) es sencillamente controlada.
    const item = nativeItem(
      [
        workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)),
        recoverySeg({ type: 'pace_zone', zone: 1 }, zoneBand(330, 360)), // seg.resolved DISTINTO del item
      ],
      'segment-230',
    );
    const res = buildRunCompliance(workout([item]), [
      legLap('segment-230', 0, 'work', { avg_pace_s_per_km: 245 }),
      legLap('segment-230', 1, 'recovery', { avg_pace_s_per_km: 345 }),
    ]);
    expect(res.recovery_tramos[0]!.verdict).toBe('controlada');
  });
});

describe('buildRunCompliance — sesión mixta: dos preguntas, dos números, nunca uno solo', () => {
  test('6 tramos de trabajo dentro y 6 de recuperación con problemas dan resúmenes DISTINTOS, no un porcentaje mezclado', () => {
    const segs: Segment[] = [];
    for (let i = 0; i < 3; i++) {
      segs.push(workSeg({ type: 'pace_zone', zone: 4 }, zoneBand(240, 250)));
      segs.push(recoverySeg({ type: 'pace_zone', zone: 1 }, zoneBand(330, 360)));
    }
    const item = nativeItem(segs, 'segment-240');
    const laps: SegmentActual[] = [];
    for (let i = 0; i < 3; i++) {
      laps.push(legLap('segment-240', i * 2, 'work', { avg_pace_s_per_km: 245 })); // siempre dentro
      laps.push(legLap('segment-240', i * 2 + 1, 'recovery', { avg_pace_s_per_km: 300 })); // siempre demasiado rápida
    }
    const res = buildRunCompliance(workout([item]), laps);

    expect(res.summary).toMatchObject({ total: 3, dentro: 3, pct_dentro: 100 });
    expect(res.recovery_summary).toMatchObject({ total: 3, demasiado_rapida: 3, controlada: 0, pct_controlada: 0 });
    // Las dos cifras existen a la vez y ninguna se cuela en la otra.
    expect(res.tramos).toHaveLength(3);
    expect(res.recovery_tramos).toHaveLength(3);
  });
});
