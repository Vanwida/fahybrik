import { describe, expect, it } from 'vitest';
import {
  weekDayPartToEditorBlock,
  weekDayPartsToEditorBlocks,
} from '@/lib/dashboard/v2/ai-blocks-to-editor';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type { WeekDayPart, WeekDayPartItem } from '@fahybrid/shared/schema/program-templates';

// Build a WeekDayPart item the way the suggest-workout LLM path emits it: scalar
// params_json (sets/reps/distance_meters/duration_seconds/load_pct/rest_seconds/rpe)
// + an optional note carrying a pace/zone the params can't hold.
function item(
  exercise_name: string,
  params: Record<string, number>,
  extra: Partial<WeekDayPartItem> = {},
): WeekDayPartItem {
  return {
    uid: `it-${exercise_name.replace(/\s+/g, '-').toLowerCase()}`,
    exercise_id: 42,
    exercise_name,
    params_json: params,
    ...extra,
  };
}

function part(
  format: string,
  title: string,
  items: WeekDayPartItem[],
  extra: Partial<WeekDayPart> = {},
): WeekDayPart {
  return { uid: `blk-${title.toLowerCase()}`, title, format, items, ...extra } as WeekDayPart;
}

describe('weekDayPartToEditorBlock — field mapping (mirrors the editor loader)', () => {
  it('carries uid, title, format, exercise fields and coerces exercise_id to a number', () => {
    const b = weekDayPartToEditorBlock(
      part('strength_block', 'Principal', [
        { uid: 'x1', exercise_id: '99' as unknown as number, exercise_name: 'Back Squat', params_json: { sets: 3, reps: 5 }, notes: 'foco técnica' },
      ]),
    );
    expect(b.uid).toBe('blk-principal');
    expect(b.title).toBe('Principal');
    expect(b.format).toBe('strength_block');
    expect(b.items).toHaveLength(1);
    expect(b.items[0]!.exercise_id).toBe(99); // coerced from string
    expect(b.items[0]!.exercise_name).toBe('Back Squat');
    expect(b.items[0]!.notes).toBe('foco técnica');
  });

  it('threads methodology_group_id + source_block_id (library origin) and defaults to null', () => {
    const withOrigin = weekDayPartToEditorBlock(
      part('strength_block', 'Principal', [], { methodology_group_id: 4, source_block_id: 7 }),
    );
    expect(withOrigin.methodology_group_id).toBe(4);
    expect(withOrigin.source_block_id).toBe(7);
    const bare = weekDayPartToEditorBlock(part('amrap', 'Finisher', []));
    expect(bare.methodology_group_id).toBeNull();
    expect(bare.source_block_id).toBeNull();
    expect(bare.items).toEqual([]); // empty seed block survives conversion
  });

  it('omits notes when absent (no undefined leak under exactOptionalPropertyTypes)', () => {
    const b = weekDayPartToEditorBlock(
      part('strength_block', 'P', [item('Squat', { sets: 3, reps: 5 })]),
    );
    expect('notes' in b.items[0]!).toBe(false);
  });
});

describe('inferGroup — rail heading from title/format', () => {
  it('warmup/mobility → calentamiento; cooldown/stretch → vuelta; else principal', () => {
    expect(weekDayPartToEditorBlock(part('circuit', 'Calentamiento', [])).group).toBe('calentamiento');
    expect(weekDayPartToEditorBlock(part('circuit', 'Movilidad de cadera', [])).group).toBe('calentamiento');
    expect(weekDayPartToEditorBlock(part('circuit', 'Vuelta a la calma', [])).group).toBe('vuelta');
    expect(weekDayPartToEditorBlock(part('circuit', 'Estiramientos', [])).group).toBe('vuelta');
    expect(weekDayPartToEditorBlock(part('strength_block', 'Principal', [])).group).toBe('principal');
  });
});

describe('prescription bridge — structured wins, else derived from params_json', () => {
  it('passes a structured prescription_json through verbatim (no re-derivation)', () => {
    const pj = { scheme: 'steady', total_s: 1800, target: { kind: 'hr_zone', value: 2 } } as const;
    const b = weekDayPartToEditorBlock(
      part('steady', 'Z2', [
        { uid: 'z', exercise_id: 5, exercise_name: 'Bike Erg', prescription_json: pj as never },
      ]),
    );
    expect(b.items[0]!.prescription).toEqual(pj);
    expect(prescriptionToText(b.items[0]!.prescription)).toContain('Z2');
  });

  it('derives a full typed prescription from strength params (load_pct → %RM)', () => {
    const b = weekDayPartToEditorBlock(
      part('strength_block', 'Principal', [
        item('Back Squat', { sets: 5, reps: 5, load_pct: 80, rest_seconds: 120 }),
      ]),
    );
    expect(prescriptionToText(b.items[0]!.prescription)).toBe('5×5 @ 80% RM · descanso 2\'');
  });
});

// ── The 10 real focuses the coach types → every item renders a NON-EMPTY typed
//    prescription line (the bridge never silently drops the dosage). ─────────────
describe('stress-test — 10 HYROX focuses convert to non-empty typed prescriptions', () => {
  const FOCUSES: Array<{ focus: string; part: WeekDayPart; expect?: RegExp }> = [
    { focus: 'sentadilla pesada', part: part('strength_block', 'Fuerza', [item('Back Squat', { sets: 5, reps: 5, load_pct: 80, rest_seconds: 120 })]), expect: /5×5 @ 80% RM/ },
    { focus: 'series 1000m umbral', part: part('intervals', 'Series', [item('Carrera', { sets: 5, distance_meters: 1000, rest_seconds: 120 }, { notes: '4:05/km' })]), expect: /1000m/ },
    { focus: 'AMRAP wall balls', part: part('amrap', 'Finisher', [item('Wall Balls', { reps: 15 })]), expect: /15/ },
    { focus: 'EMOM remo 15 cal', part: part('emom', 'EMOM', [item('Row', { reps: 15 })]) },
    { focus: 'Z2 bici 45', part: part('steady', 'Aeróbico', [item('Bike Erg', { duration_seconds: 2700 }, { notes: 'Z2' })]), expect: /45'/ },
    { focus: 'HYROX sim', part: part('hyrox_sim', 'Simulación', [item('Ski Erg', { distance_meters: 1000, rpe: 8 })]), expect: /1000m/ },
    { focus: 'core + movilidad', part: part('circuit', 'Core', [item('Plancha', { duration_seconds: 45 })]), expect: /45/ },
    { focus: 'tempo 4:30/km', part: part('tempo', 'Tempo', [item('Carrera', { duration_seconds: 1200 }, { notes: '4:30/km' })]), expect: /20'/ },
    { focus: 'for time 3 rondas', part: part('for_time', 'For Time', [item('Thruster', { reps: 20 })]), expect: /20/ },
    { focus: 'piramidal press banca', part: part('strength_block', 'Empuje', [item('Press Banca', { sets: 4, reps: 8, load_pct: 75, rest_seconds: 90 })]), expect: /4×8 @ 75% RM/ },
  ];

  it.each(FOCUSES)('$focus → renders typed line', ({ part: p, expect: re }) => {
    const b = weekDayPartToEditorBlock(p);
    for (const it of b.items) {
      const line = prescriptionToText(it.prescription);
      expect(line.length).toBeGreaterThan(0);
      if (re) expect(line).toMatch(re);
    }
  });
});

describe('weekDayPartsToEditorBlocks — order preserved for multi-block sessions', () => {
  it('maps a whole session (warmup → principal → finisher) keeping order', () => {
    const blocks = weekDayPartsToEditorBlocks([
      part('circuit', 'Calentamiento', [item('Movilidad', { duration_seconds: 300 })]),
      part('strength_block', 'Principal', [item('Back Squat', { sets: 5, reps: 5, load_pct: 80 })]),
      part('amrap', 'Finisher', [item('Wall Balls', { reps: 15 })]),
    ]);
    expect(blocks.map((b) => b.group)).toEqual(['calentamiento', 'principal', 'principal']);
    expect(blocks.map((b) => b.title)).toEqual(['Calentamiento', 'Principal', 'Finisher']);
  });
});
