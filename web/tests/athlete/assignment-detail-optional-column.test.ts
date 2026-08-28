import { describe, expect, test } from 'vitest';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { createFakeSql } from '../utils/fake-sql';

const SEGMENT_ROW = {
  id: '201',
  position: 0,
  block_position: 0,
  block_format: 'strength_block',
  block_title: 'Fuerza',
  block_coach_note: 'Cadera alta.',
  params_json: { reps: 5 },
  prescription_json: null,
  notes: null,
  exercise_id: '901',
  exercise_slug: 'back-squat',
  exercise_category: 'strength',
  exercise_name: 'Back Squat',
  exercise_cues: null,
  exercise_description: null,
  exercise_video_url: null,
};

const ASSIGNMENT_ROW = {
  id: '10',
  athlete_id: '67',
  scheduled_for: '2026-08-28',
  status: 'scheduled',
  notes: null,
  template_id: '500',
  template_version: 1,
  partner_visibility: 'shared',
  calibration_test_id: null,
  coach_id: '60',
};

const TEMPLATE_ROW = {
  id: '500',
  name: 'Heavy Sled Day',
  format: 'strength_block',
  warmup: null,
  cooldown: null,
  coach_notes: null,
  meta_json: null,
};

const SEGMENT_EXEC_ROW = {
  id: '1',
  template_segment_id: '9',
  position: 1,
  modality: 'strength',
  started_at: null,
  ended_at: null,
  reps_completed: 5,
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
  source: null,
  leg_index: null,
  leg_role: null,
  leg_phase: null,
  is_structural: false,
  raw_lap_data_json: null,
  round_index: null,
};

function detailSql(onSegment?: (sqlText: string) => void, onBlocks?: () => void) {
  return createFakeSql((text) => {
    if (text.includes('from workout_assignments')) return [ASSIGNMENT_ROW];
    if (text.includes('from athlete_zone_profiles')) return [];
    if (text.includes('from athlete_strength_maxes')) return [];
    if (text.includes('from athlete_benchmarks')) return [];
    if (text.includes('from workout_executions')) return [];
    if (
      text.includes('from templates') &&
      !text.includes('template_segments') &&
      !text.includes('template_blocks')
    ) {
      return [TEMPLATE_ROW];
    }
    if (text.includes('from template_segments')) {
      onSegment?.(text);
      return [SEGMENT_ROW];
    }
    if (text.includes('from template_blocks')) {
      onBlocks?.();
      return [];
    }
    return [];
  });
}

describe('assignment-detail · lectura de columna opcional', () => {
  test('el SELECT de segmentos no nombra block_coach_note como identificador', async () => {
    let segmentSql = '';
    const sql = detailSql((text) => {
      segmentSql = text;
    });
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(67),
      assignment_id: BigInt(10),
    });
    expect(segmentSql).toContain("to_jsonb(s)->>'block_coach_note'");
    expect(segmentSql).not.toMatch(/\bs\.block_coach_note\b/);
    expect(detail?.workout).not.toBeNull();
    expect(detail?.workout?.blocks[0]?.coach_note).toBe('Cadera alta.');
    expect(detail?.workout?.blocks[0]?.items.length).toBeGreaterThan(0);
  });

  test('template_blocks 42P01 no inventa el plan: los bloques siguen saliendo', async () => {
    const sql = createFakeSql((text) => {
      if (text.includes('from workout_assignments')) return [ASSIGNMENT_ROW];
      if (text.includes('from athlete_zone_profiles')) return [];
      if (text.includes('from athlete_strength_maxes')) return [];
      if (text.includes('from athlete_benchmarks')) return [];
      if (text.includes('from workout_executions')) return [];
      if (
        text.includes('from templates') &&
        !text.includes('template_segments') &&
        !text.includes('template_blocks')
      ) {
        return [TEMPLATE_ROW];
      }
      if (text.includes('from template_segments')) return [SEGMENT_ROW];
      if (text.includes('from template_blocks')) {
        throw Object.assign(new Error('relation "template_blocks" does not exist'), {
          code: '42P01',
        });
      }
      return [];
    });
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(67),
      assignment_id: BigInt(10),
    });
    expect(detail?.workout).not.toBeNull();
    expect(detail?.workout?.blocks[0]?.items.length).toBeGreaterThan(0);
    expect(detail?.workout?.blocks[0]?.coach_note).toBe('Cadera alta.');
  });

  test('un error que no es de esquema en template_blocks sigue saliendo', async () => {
    const sql = createFakeSql((text) => {
      if (text.includes('from workout_assignments')) return [ASSIGNMENT_ROW];
      if (text.includes('from athlete_zone_profiles')) return [];
      if (text.includes('from athlete_strength_maxes')) return [];
      if (text.includes('from athlete_benchmarks')) return [];
      if (text.includes('from workout_executions')) return [];
      if (
        text.includes('from templates') &&
        !text.includes('template_segments') &&
        !text.includes('template_blocks')
      ) {
        return [TEMPLATE_ROW];
      }
      if (text.includes('from template_segments')) return [SEGMENT_ROW];
      if (text.includes('from template_blocks')) {
        throw Object.assign(new Error('too many connections'), { code: '53300' });
      }
      return [];
    });
    await expect(
      loadAssignmentDetail({ sql, athlete_id: BigInt(67), assignment_id: BigInt(10) }),
    ).rejects.toMatchObject({ code: '53300' });
  });
});

describe('loadSegmentActuals · lectura de columna opcional', () => {
  test('el SELECT de series no nombra is_approach como identificador', async () => {
    let setSql = '';
    const sql = createFakeSql((text) => {
      if (text.includes('from set_executions')) {
        setSql = text;
        return [
          {
            segment_id: '1',
            set_index: 1,
            reps_actual: 5,
            load_actual_kg: '50',
            status: 'done',
            is_approach: true,
          },
          {
            segment_id: '1',
            set_index: 2,
            reps_actual: 5,
            load_actual_kg: '80',
            status: 'done',
            is_approach: null,
          },
        ];
      }
      return [{ ...SEGMENT_EXEC_ROW }];
    });
    const actuals = await loadSegmentActuals(sql, 99);
    expect(setSql).toContain("to_jsonb(st)->>'is_approach'");
    expect(setSql).not.toMatch(/\bst\.is_approach\b/);
    expect(actuals[0]!.sets).toEqual([
      { set_index: 1, reps_actual: 5, load_actual_kg: 50, status: 'done', is_approach: true },
      { set_index: 2, reps_actual: 5, load_actual_kg: 80, status: 'done', is_approach: false },
    ]);
  });
});
