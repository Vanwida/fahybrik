// Real-DB — un coach vacío no hereda la fila de otro; guardar y releer los 5.
// Mismo patrón que running-thresholds.db.test.ts. Se salta sin TEST_DATABASE_URL.

import { afterAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';
import {
  getCoachMethodologyKnobs,
  upsertCoachMethodologyKnobs,
} from '@/lib/coach/methodology-knobs';
import { DEFAULT_COACH_METHODOLOGY_KNOBS } from '@fahybrid/shared/domain/coach/methodology-knobs';
import type { CoachMethodologyKnobs } from '@fahybrid/shared/domain/coach/methodology-knobs';

const CUSTOM: CoachMethodologyKnobs = {
  zones: { hr_zone_count: 7, hr_anchor: 'tanaka', run_pace_anchor: 'threshold' },
  default_tests: ['tt_2k_row'],
  block_end_policy: 'repeat',
  day_down: { sleep_min_hours: 5, hrv_drop_pct: -12, load_tsb_floor: -6 },
  tone: { register: 'tecnico', address_form: 'tu' },
};

describeWithDb('coach_methodology_knobs: vacío no copia; guardar y releer', () => {
  const sql = getTestSql();

  afterAll(async () => {
    await closeTestSql();
  });

  test('A escribe los 5; B sin fila recibe defectos; A relee lo suyo', async () => {
    const a = await makeCoachAndAthlete(sql);
    const b = await makeCoachAndAthlete(sql);
    try {
      const emptyB = await getCoachMethodologyKnobs(b.coachId, sql);
      expect(emptyB.is_custom).toBe(false);
      expect(emptyB.default_tests).toEqual([]);
      expect(emptyB.zones).toEqual(DEFAULT_COACH_METHODOLOGY_KNOBS.zones);
      expect(emptyB.block_end_policy).toBe('stop');
      expect(emptyB.tone.register).toBe('neutral');

      await upsertCoachMethodologyKnobs(a.coachId, CUSTOM, sql);

      const stillB = await getCoachMethodologyKnobs(b.coachId, sql);
      expect(stillB.is_custom).toBe(false);
      expect(stillB.default_tests).toEqual([]);
      expect(stillB.zones.hr_anchor).toBe('lthr');
      expect(stillB.block_end_policy).toBe('stop');

      const readA = await getCoachMethodologyKnobs(a.coachId, sql);
      expect(readA.is_custom).toBe(true);
      expect(readA.zones).toEqual(CUSTOM.zones);
      expect(readA.default_tests).toEqual(['tt_2k_row']);
      expect(readA.block_end_policy).toBe('repeat');
      expect(readA.day_down).toEqual(CUSTOM.day_down);
      expect(readA.tone).toEqual(CUSTOM.tone);
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});
