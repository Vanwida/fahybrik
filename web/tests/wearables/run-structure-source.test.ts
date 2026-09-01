// El puente sesión → estructura única de carrera.
//
// Lo que se protege aquí es que NO se pierda trabajo (una sesión con calentamiento,
// principal y vuelta a la calma en tres líneas distintas debe salir entera) y que
// la banda contra la que pita el reloj sea la MISMA que ve el atleta en la app.

import { describe, expect, test } from 'vitest';
import type { RunStructure, Segment } from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailItem,
  AssignmentDetailWorkout,
  ResolvedIntensity,
} from '@fahybrid/shared/schema/workouts';
import {
  absolutizeResolvedZones,
  collectRunStructures,
  mergeRunStructures,
  runStructureForSession,
} from '@/lib/wearables/run-structure-source';

// ── Constructores mínimos ────────────────────────────────────────────────────

function item(uid: string, structure?: RunStructure): AssignmentDetailItem {
  return {
    uid,
    exercise_id: 1,
    exercise_name: 'Carrera',
    exercise_slug: 'run',
    exercise_category: 'running',
    exercise_video_url: null,
    cues: null,
    exercise_description: null,
    params_json: {},
    prescription_json: structure ? { scheme: 'intervals', modality: 'run', structure } : null,
    resolved_intensity: null,
    resolved_load: null,
    notes: null,
  };
}

function workoutOf(...items: AssignmentDetailItem[][]): AssignmentDetailWorkout {
  return {
    name: 'Sesión',
    focus: null,
    coach_note: null,
    estimated_duration_minutes: null,
    blocks: items.map((blockItems, i) => ({
      uid: `b${i}`,
      title: `Bloque ${i}`,
      format: 'intervals',
      block_position: i,
      coach_note: null,
      config_json: {},
      items: blockItems,
    })),
  };
}

const seg = (m: number, target: Segment['target'] = null, resolved?: ResolvedIntensity): Segment => ({
  kind: 'work',
  measure: { type: 'distance', m },
  target,
  ...(resolved ? { resolved } : {}),
});

const band = (fast_s: number, slow_s: number | null, unit: 'per_km' | 'per_500m' = 'per_km'): ResolvedIntensity => ({
  zone_label: 'Z4',
  range_label: 'x',
  fast_s,
  slow_s,
  pace_unit: unit,
  needs_review: false,
});

// ── Recolección ──────────────────────────────────────────────────────────────

describe('collectRunStructures', () => {
  test('recoge en orden de bloque y luego de línea, saltando lo que no es carrera', () => {
    const warm: RunStructure = [{ role: 'main', elements: [seg(1000)] }];
    const main: RunStructure = [{ role: 'main', elements: [seg(400)] }];
    const found = collectRunStructures(
      workoutOf([item('a', warm), item('b')], [item('c', main)]),
    );
    expect(found).toEqual([warm, main]);
  });

  test('una sesión sin ninguna línea estructurada devuelve vacío', () => {
    expect(collectRunStructures(workoutOf([item('a')]))).toEqual([]);
    expect(collectRunStructures(null)).toEqual([]);
  });
});

// ── Fusión ───────────────────────────────────────────────────────────────────

describe('mergeRunStructures', () => {
  test('agrupa por rol y respeta el orden de llegada dentro de cada rol', () => {
    const merged = mergeRunStructures([
      [
        { role: 'warmup', elements: [seg(1)] },
        { role: 'main', elements: [seg(2)] },
      ],
      [
        { role: 'main', elements: [seg(3)] },
        { role: 'cooldown', elements: [seg(4)] },
      ],
    ]);
    expect(merged).toEqual([
      { role: 'warmup', elements: [seg(1)] },
      { role: 'main', elements: [seg(2), seg(3)] },
      { role: 'cooldown', elements: [seg(4)] },
    ]);
  });

  test('no se pierde ni un tramo al fundir tres líneas', () => {
    const merged = mergeRunStructures([
      [{ role: 'main', elements: [seg(1)] }],
      [{ role: 'main', elements: [seg(2), seg(3)] }],
      [{ role: 'main', elements: [seg(4)] }],
    ]);
    expect(merged?.[0]?.elements).toHaveLength(4);
  });

  test('sin estructuras devuelve null', () => {
    expect(mergeRunStructures([])).toBeNull();
    expect(mergeRunStructures([[]])).toBeNull();
  });
});

// ── Absolutización de zonas ──────────────────────────────────────────────────

describe('absolutizeResolvedZones', () => {
  test('una zona de ritmo YA resuelta se colapsa a la banda absoluta que ve el atleta', () => {
    const out = absolutizeResolvedZones([
      { role: 'main', elements: [seg(400, { type: 'pace_zone', zone: 4 }, band(255, 265))] },
    ]);
    expect((out[0]?.elements[0] as Segment).target).toEqual({
      type: 'pace',
      min_s: 255,
      max_s: 265,
    });
  });

  test('sin banda resuelta la zona se queda como está (nada de inventarla)', () => {
    const target = { type: 'pace_zone' as const, zone: 4 };
    const out = absolutizeResolvedZones([{ role: 'main', elements: [seg(400, target)] }]);
    expect((out[0]?.elements[0] as Segment).target).toEqual(target);
  });

  test('una banda abierta por arriba no se puede cerrar: se deja la zona', () => {
    const target = { type: 'pace_zone' as const, zone: 1 };
    const out = absolutizeResolvedZones([
      { role: 'main', elements: [seg(400, target, band(400, null))] },
    ]);
    expect((out[0]?.elements[0] as Segment).target).toEqual(target);
  });

  test('una banda de ergómetro (/500 m) nunca se convierte en ritmo por km', () => {
    const target = { type: 'pace_zone' as const, zone: 3 };
    const out = absolutizeResolvedZones([
      { role: 'main', elements: [seg(400, target, band(110, 115, 'per_500m'))] },
    ]);
    expect((out[0]?.elements[0] as Segment).target).toEqual(target);
  });

  test('una zona de PULSO no se toca aunque traiga banda (esa banda es de ritmo)', () => {
    const target = { type: 'hr_zone' as const, zone: 2 };
    const out = absolutizeResolvedZones([
      { role: 'main', elements: [seg(400, target, band(255, 265))] },
    ]);
    expect((out[0]?.elements[0] as Segment).target).toEqual(target);
  });

  test('entra también dentro de las repeticiones anidadas', () => {
    const out = absolutizeResolvedZones([
      {
        role: 'main',
        elements: [
          {
            times: 3,
            elements: [
              { times: 2, elements: [seg(400, { type: 'pace_zone', zone: 5 }, band(200, 210))] },
            ],
          },
        ],
      },
    ]);
    const outer = out[0]?.elements[0] as { elements: Array<{ elements: Segment[] }> };
    expect(outer.elements[0]?.elements[0]?.target).toEqual({
      type: 'pace',
      min_s: 200,
      max_s: 210,
    });
  });
});

// ── Extremo a extremo ────────────────────────────────────────────────────────

describe('runStructureForSession', () => {
  test('funde y absolutiza en una sola pasada', () => {
    const structure = runStructureForSession(
      workoutOf(
        [item('a', [{ role: 'warmup', elements: [seg(1000)] }])],
        [
          item('b', [
            { role: 'main', elements: [seg(400, { type: 'pace_zone', zone: 4 }, band(255, 265))] },
          ]),
        ],
      ),
    );
    expect(structure).toEqual([
      { role: 'warmup', elements: [seg(1000)] },
      {
        role: 'main',
        elements: [
          {
            kind: 'work',
            measure: { type: 'distance', m: 400 },
            target: { type: 'pace', min_s: 255, max_s: 265 },
            resolved: band(255, 265),
          },
        ],
      },
    ]);
  });

  test('una sesión sin carrera estructurada devuelve null (→ 409 en el endpoint)', () => {
    expect(runStructureForSession(workoutOf([item('a')]))).toBeNull();
  });
});
