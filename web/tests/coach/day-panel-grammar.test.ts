import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ItemPrescritoHecho,
  SessionBlockSection,
  actualTokens,
  authoredSectionTitle,
  blockArrangement,
  prescritoLine,
} from '@/components/v2/sesion/ItemPrescritoHecho';
import type { AssignmentDetailBlock, AssignmentDetailItem } from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function item(
  over: Partial<AssignmentDetailItem> & { uid: string; exercise_name: string },
): AssignmentDetailItem {
  return {
    template_segment_id: 1,
    exercise_id: '1',
    exercise_slug: 'x',
    exercise_category: 'strength',
    exercise_video_url: null,
    cues: null,
    exercise_description: null,
    params_json: {},
    prescription_json: null,
    resolved_intensity: null,
    resolved_load: null,
    resolved_references: [],
    notes: null,
    ...over,
  };
}

function block(
  over: Partial<AssignmentDetailBlock> & { items: AssignmentDetailItem[] },
): AssignmentDetailBlock {
  return {
    uid: 'b1',
    title: 'Bloque',
    format: 'strength_block',
    block_position: 0,
    coach_note: null,
    config_json: {},
    ...over,
  };
}

function actual(over: Partial<SegmentActual> = {}): SegmentActual {
  return {
    position: 0,
    item_uid: 'i1',
    modality: 'strength',
    started_at: null,
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
    avg_gradient_pct: null,
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
    sets: [],
    round_index: null,
    ...over,
  };
}

const FORBIDDEN = [
  'Hecho',
  'Prescrito',
  'sin registro',
  'Sin dosis anotada',
  'Pendiente',
  'circuito',
  'series',
  'rondas',
];

describe('gramática del panel del día', () => {
  it('1) un run suelto es solo, bloque propio', () => {
    const run = item({
      uid: 'run',
      exercise_name: 'Run',
      prescription_json: {
        scheme: 'steady',
        modality: 'run',
        total_s: 1200,
        target: { kind: 'hr_zone', value: 2 },
      },
    });
    const html = renderToString(
      createElement(SessionBlockSection, {
        block: block({ title: 'RUN', format: 'steady', items: [run] }),
        sessionTitle: 'Día',
        actualsByItem: new Map(),
      }),
    );
    expect(blockArrangement(block({ format: 'steady', items: [run] }))).toBe('solo');
    expect(html).toContain('data-arrangement="solo"');
    expect(html).toContain('Run');
    expect(html).not.toContain('data-arrangement="group"');
    for (const word of FORBIDDEN) expect(html).not.toContain(word);
  });

  it('2) la dosis 4×4 con RPE/descanso/% va pegada al nombre', () => {
    const deadlift = item({
      uid: 'dl',
      exercise_name: 'Deadlift',
      notes: '@78% 1RM',
      prescription_json: {
        scheme: 'sets',
        modality: 'strength',
        rounds: 4,
        rest_s: 120,
        sets: [{ measure: { kind: 'reps', value: 4 }, target: { kind: 'rpe', value: 7.5 }, rest_s: 120 }],
      },
    });
    const line = prescritoLine(deadlift);
    expect(line).toContain('4×4');
    expect(line).toContain('RPE 7.5');
    expect(line).toContain('descanso 2');
    const html = renderToString(createElement(ItemPrescritoHecho, { item: deadlift, actuals: [] }));
    expect(html).toMatch(/<p[^>]*>[\s\S]*Deadlift[\s\S]*4×4[\s\S]*<\/p>/);
    expect(html).toContain('@78% 1RM');
    expect(html).toContain('italic');
    expect(html).not.toContain('Hecho');
    expect(html).not.toContain('Prescrito');
  });

  it('3) dos ejercicios que comparten ronda son grupo', () => {
    const sled = item({ uid: 's', exercise_name: 'Trineo' });
    const carry = item({ uid: 'c', exercise_name: 'Carry' });
    const grouped = block({
      title: 'TRINEOS Y CARRIES',
      format: 'circuit',
      config_json: { rounds: 4, pacing: 'por_tarea' },
      items: [sled, carry],
    });
    expect(blockArrangement(grouped)).toBe('group');
    const html = renderToString(
      createElement(SessionBlockSection, {
        block: grouped,
        sessionTitle: 'Fuerza B + Trineos',
        actualsByItem: new Map(),
      }),
    );
    expect(html).toContain('data-arrangement="group"');
    expect(html).toContain('Trineo');
    expect(html).toContain('Carry');
    expect(html).not.toContain('circuito');
    expect(html).not.toContain('1/2');
  });

  it('4) seguidos en el mismo bloque no comparten barra', () => {
    const a = item({
      uid: 'a',
      exercise_name: 'Deadlift',
      prescription_json: {
        scheme: 'sets',
        modality: 'strength',
        rounds: 4,
        sets: [{ measure: { kind: 'reps', value: 4 } }],
      },
    });
    const b = item({ uid: 'b', exercise_name: 'Romanian Deadlift', notes: 'RDL' });
    const followed = block({
      title: 'FUERZA · CADERA',
      format: 'strength_block',
      items: [a, b],
    });
    expect(blockArrangement(followed)).toBe('followed');
    const html = renderToString(
      createElement(SessionBlockSection, {
        block: followed,
        sessionTitle: 'Fuerza B + Trineos',
        actualsByItem: new Map(),
      }),
    );
    expect(html).toContain('data-arrangement="followed"');
    expect(html).not.toContain('data-arrangement="group"');
    expect(html).toContain('Deadlift');
    expect(html).toContain('Romanian Deadlift');
  });

  it('5) día hecho pone los números al lado, sin la palabra', () => {
    const lift = item({
      uid: 'dl',
      exercise_name: 'Deadlift',
      params_json: { sets: 4, reps: 4, rpe: 7.5 },
    });
    const html = renderToString(
      createElement(ItemPrescritoHecho, {
        item: lift,
        actuals: [actual({ item_uid: 'dl', reps_completed: 4, weight_used_kg: 140 })],
      }),
    );
    expect(html).toContain('140');
    expect(html).toContain('4×4');
    expect(html).not.toContain('Hecho');
    expect(html).not.toContain('Prescrito');
  });

  it('6) sin nota no deja hueco ni cursiva vacía', () => {
    const lift = item({
      uid: 'dl',
      exercise_name: 'Deadlift',
      params_json: { sets: 4, reps: 4 },
    });
    const html = renderToString(createElement(ItemPrescritoHecho, { item: lift, actuals: [] }));
    expect(html).not.toContain('italic');
    expect(html).not.toContain('nota');
  });

  it('7) sin dosis no inventa texto', () => {
    const nameless = item({ uid: 'x', exercise_name: 'Carry' });
    expect(prescritoLine(nameless)).toBe('');
    const html = renderToString(createElement(ItemPrescritoHecho, { item: nameless, actuals: [] }));
    expect(html).toContain('Carry');
    expect(html).not.toContain('Sin dosis anotada');
    expect(html).not.toContain('sin registro');
  });

  it('día vacío de registro no pinta Hecho', () => {
    const lift = item({ uid: 'dl', exercise_name: 'Deadlift', params_json: { sets: 4, reps: 4 } });
    const html = renderToString(createElement(ItemPrescritoHecho, { item: lift, actuals: [] }));
    expect(html).not.toContain('Hecho');
    expect(html).not.toContain('sin registro');
    expect(html).not.toContain('Prescrito');
  });

  it('actualTokens no dice rondas ni series', () => {
    const tokens = actualTokens(
      actual({ emom_rounds_completed: 8, emom_rounds_prescribed: 10, reps_completed: 12 }),
    );
    expect(tokens.join(' ')).not.toMatch(/rondas|series|Hecho/i);
    expect(tokens).toContain('8/10');
    expect(tokens).toContain('12');
  });

  it('un título de formato no se pinta como sección', () => {
    expect(authoredSectionTitle('Circuito', 'Día')).toBeNull();
    expect(authoredSectionTitle('Bloque 2', 'Día')).toBeNull();
    expect(authoredSectionTitle('Fuerza B + Trineos', 'Fuerza B + Trineos')).toBeNull();
    expect(authoredSectionTitle('TRINEOS Y CARRIES', 'Fuerza B + Trineos')).toBe('TRINEOS Y CARRIES');
    expect(authoredSectionTitle('RUN', 'Día')).toBe('RUN');
  });
});

describe('109+173 · silencio en el cromo', () => {
  it('el panel y la línea no conservan las palabras retiradas', () => {
    const files = [
      'web/components/v2/sesion/ItemPrescritoHecho.tsx',
      'web/components/v2/atleta-detalle/SessionDetailDrawer.tsx',
    ];
    for (const path of files) {
      const src = source(path);
      expect(src).not.toContain('>Hecho<');
      expect(src).not.toContain('>Prescrito<');
      expect(src).not.toContain('sin registro');
      expect(src).not.toContain('Sin dosis anotada');
      expect(src).not.toContain('registrado sin métricas');
      expect(src).not.toContain("'Pendiente'");
    }
  });
});
