/**
 * 5 mandos de metodología — coach vacío = defectos de mecanismo, no la
 * escuela de otro club. Guardar y releer el conjunto entero.
 */
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import { DEFAULT_CALIBRATION_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';
import {
  DEFAULT_COACH_METHODOLOGY_KNOBS,
  defaultCoachMethodologyKnobs,
} from '@fahybrid/shared/domain/coach/methodology-knobs';
import { HR_ZONES } from '@fahybrid/shared/domain/methodology/hr-zones';
import { coachMethodologyKnobsPutSchema } from '@fahybrid/shared/schema/coach-methodology-knobs';
import {
  getCoachMethodologyKnobs,
  upsertCoachMethodologyKnobs,
} from '@/lib/coach/methodology-knobs';
import type { CoachMethodologyKnobs } from '@fahybrid/shared/domain/coach/methodology-knobs';

const CUSTOM: CoachMethodologyKnobs = {
  zones: { hr_zone_count: 6, hr_anchor: 'max_hr', run_pace_anchor: '10k' },
  default_tests: ['tt_5k', 'lthr_30min'],
  block_end_policy: 'level_up',
  day_down: { sleep_min_hours: 7.5, hrv_drop_pct: -20, load_tsb_floor: -15 },
  tone: { register: 'directo', address_form: 'usted' },
};

interface StoredRow {
  hr_zone_count: number;
  hr_anchor: string;
  run_pace_anchor: string;
  default_test_slugs: string[];
  block_end_policy: string;
  sleep_min_hours: number;
  hrv_drop_pct: number;
  load_tsb_floor: number;
  tone_register: string;
  address_form: string;
  updated_at: string;
}

/** Almacén en memoria por coach_id: el GET de B no ve la fila de A. */
function sqlByCoach() {
  const rows = new Map<number, StoredRow>();
  return createFakeSql((text, values) => {
    if (text.includes('insert into coach_methodology_knobs')) {
      const coachId = Number(values[0]);
      const row: StoredRow = {
        hr_zone_count: Number(values[1]),
        hr_anchor: String(values[2]),
        run_pace_anchor: String(values[3]),
        default_test_slugs: [...(values[4] as string[])],
        block_end_policy: String(values[5]),
        sleep_min_hours: Number(values[6]),
        hrv_drop_pct: Number(values[7]),
        load_tsb_floor: Number(values[8]),
        tone_register: String(values[9]),
        address_form: String(values[10]),
        updated_at: '2026-08-16T12:00:00.000Z',
      };
      rows.set(coachId, row);
      return [{ updated_at: row.updated_at }];
    }
    if (text.includes('from coach_methodology_knobs')) {
      const coachId = Number(values[0]);
      const row = rows.get(coachId);
      return row ? [row] : [];
    }
    return [];
  });
}

describe('defaults de mecanismo — coach vacío', () => {
  test('no copia la batería de marca ni un tono con nombre', () => {
    const d = DEFAULT_COACH_METHODOLOGY_KNOBS;
    expect(d.default_tests).toEqual([]);
    expect(d.tone.register).toBe('neutral');
    expect(d.block_end_policy).toBe('stop');
    for (const protocol of DEFAULT_CALIBRATION_BATTERY) {
      expect(d.default_tests).not.toContain(protocol.slug);
    }
  });

  test('las zonas vacías son el cálculo actual del producto', () => {
    const d = DEFAULT_COACH_METHODOLOGY_KNOBS;
    expect(d.zones.hr_zone_count).toBe(HR_ZONES.length);
    expect(d.zones.hr_anchor).toBe('lthr');
    expect(d.zones.run_pace_anchor).toBe('5k');
  });

  test('la copia fresca no comparte el array de tests', () => {
    const a = defaultCoachMethodologyKnobs();
    a.default_tests.push('tt_5k');
    expect(defaultCoachMethodologyKnobs().default_tests).toEqual([]);
  });
});

describe('getCoachMethodologyKnobs', () => {
  test('sin fila: is_custom false y los 5 mandos del mecanismo', async () => {
    const res = await getCoachMethodologyKnobs(1, sqlByCoach());
    expect(res.is_custom).toBe(false);
    expect(res.updated_at).toBeNull();
    expect(res.zones).toEqual(DEFAULT_COACH_METHODOLOGY_KNOBS.zones);
    expect(res.default_tests).toEqual([]);
    expect(res.block_end_policy).toBe('stop');
    expect(res.day_down).toEqual(DEFAULT_COACH_METHODOLOGY_KNOBS.day_down);
    expect(res.tone).toEqual(DEFAULT_COACH_METHODOLOGY_KNOBS.tone);
  });
});

describe('vacío no copia a otro coach', () => {
  test('A guarda los 5; B sin fila sigue en defectos', async () => {
    const sql = sqlByCoach();
    const saved = await upsertCoachMethodologyKnobs(10, CUSTOM, sql);
    expect(saved.is_custom).toBe(true);
    expect(saved.zones).toEqual(CUSTOM.zones);
    expect(saved.default_tests).toEqual(CUSTOM.default_tests);
    expect(saved.block_end_policy).toBe('level_up');
    expect(saved.day_down).toEqual(CUSTOM.day_down);
    expect(saved.tone).toEqual(CUSTOM.tone);

    const empty = await getCoachMethodologyKnobs(11, sql);
    expect(empty.is_custom).toBe(false);
    expect(empty.default_tests).toEqual([]);
    expect(empty.zones).toEqual(DEFAULT_COACH_METHODOLOGY_KNOBS.zones);
    expect(empty.block_end_policy).toBe('stop');
    expect(empty.tone.register).toBe('neutral');
  });
});

describe('guardar y releer los 5', () => {
  test('el GET posterior devuelve exactamente lo escrito', async () => {
    const sql = sqlByCoach();
    await upsertCoachMethodologyKnobs(7, CUSTOM, sql);
    const read = await getCoachMethodologyKnobs(7, sql);
    expect(read.is_custom).toBe(true);
    expect(read.zones).toEqual(CUSTOM.zones);
    expect(read.default_tests).toEqual(['tt_5k', 'lthr_30min']);
    expect(read.block_end_policy).toBe('level_up');
    expect(read.day_down).toEqual(CUSTOM.day_down);
    expect(read.tone).toEqual(CUSTOM.tone);
  });
});

describe('coachMethodologyKnobsPutSchema', () => {
  test('acepta el conjunto entero de los 5', () => {
    expect(coachMethodologyKnobsPutSchema.safeParse(CUSTOM).success).toBe(true);
  });

  test('rechaza un slug que no es test y un extra suelto', () => {
    expect(
      coachMethodologyKnobsPutSchema.safeParse({
        ...CUSTOM,
        default_tests: ['No Un Slug'],
      }).success,
    ).toBe(false);
    expect(
      coachMethodologyKnobsPutSchema.safeParse({ ...CUSTOM, philosophy: 'texto' }).success,
    ).toBe(false);
  });
});
