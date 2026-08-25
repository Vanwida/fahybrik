import { describe, expect, it } from 'vitest';
import { prescritoLine } from '@/components/v2/sesion/ItemPrescritoHecho';
import { buildAssignmentDetail } from '@/lib/athlete/assignment-detail';
import type { AssignmentDetailItem } from '@/lib/athlete/assignment-detail';

// Lo que el panel Entreno escribe al lado de «hecho». Dosis de fixture
// (no las de Neon): un VO2max de 5×1000 m @ Z5 y 3×20 wall balls @ 9 kg.

const assignment = {
  id: '490',
  athlete_id: '64',
  scheduled_for: '2026-08-25',
  status: 'completed' as const,
  notes: null,
  template_id: '695',
  template_version: 1,
  partner_visibility: 'shared' as const,
};

function itemOf(slug: string, result: ReturnType<typeof buildAssignmentDetail>): AssignmentDetailItem {
  const items = result.workout!.blocks.flatMap((b) => b.items);
  const found = items.find((i) => i.exercise_slug === slug);
  if (!found) throw new Error(`item ${slug} missing`);
  return found;
}

describe('prescritoLine — panel Entreno (sesión hecha VO2max + Wall Balls)', () => {
  const result = buildAssignmentDetail({
    assignment,
    execution: {
      ended_at: '2026-08-25T08:10:00Z',
      started_at: '2026-08-25T07:20:00Z',
      perceived_exertion: 8,
    },
    template: {
      id: '695',
      name: 'VO2max + Wall Balls',
      format: 'intervals',
      warmup: null,
      cooldown: null,
      coach_notes: null,
      meta_json: null,
    },
    segments: [
      {
        id: '1',
        position: 0,
        block_position: 0,
        block_format: 'intervals',
        block_title: 'VO2max',
        params_json: { distance_meters: 1000, sets: 5 },
        prescription_json: {
          scheme: 'intervals',
          modality: 'run',
          rounds: 5,
          rest_s: 90,
          sets: [
            {
              measure: { kind: 'distance', meters: 1000 },
              target: { kind: 'hr_zone', value: 5 },
              rest_s: 90,
            },
          ],
        },
        notes: null,
        exercise_id: '10',
        exercise_name: 'Carrera',
        exercise_slug: 'run',
        exercise_category: 'cardio',
        exercise_video_url: null,
        exercise_cues: null,
        exercise_description: null,
      },
      {
        id: '2',
        position: 1,
        block_position: 1,
        block_format: 'strength_block',
        block_title: 'Wall Balls',
        params_json: { sets: 3, reps: 20, weight_kg: 9 },
        prescription_json: {
          scheme: 'sets',
          modality: 'functional',
          sets: [
            {
              measure: { kind: 'reps', value: 20 },
              target: { kind: 'kg', value: 9 },
              rest_s: 60,
            },
          ],
          rounds: 3,
        },
        notes: null,
        exercise_id: '11',
        exercise_name: 'Wall Ball',
        exercise_slug: 'wall-ball',
        exercise_category: 'hyrox_station',
        exercise_video_url: null,
        exercise_cues: null,
        exercise_description: null,
      },
    ],
  });

  it('la carrera VO2max se lee como 5×(1000m @ Z5)', () => {
    const line = prescritoLine(itemOf('run', result));
    expect(line).toContain('5×(1000m @ Z5');
    expect(line).toContain('Z5');
    expect(line).not.toBe('Sin dosis anotada');
  });

  it('los wall balls se leen como 3×20 @ 9 kg', () => {
    const line = prescritoLine(itemOf('wall-ball', result));
    expect(line).toContain('3×20');
    expect(line).toContain('9 kg');
    expect(line).not.toBe('Sin dosis anotada');
  });
});
