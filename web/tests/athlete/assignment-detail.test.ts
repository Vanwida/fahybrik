import { describe, expect, it } from 'vitest';
import { buildAssignmentDetail } from '@/lib/athlete/assignment-detail';

const baseAssignment = {
  id: '101',
  athlete_id: '42',
  scheduled_for: '2026-05-27',
  status: 'scheduled' as const,
  notes: null,
  template_id: '500',
  template_version: 1,
  partner_visibility: 'shared' as const,
};

const baseTemplate = {
  id: '500',
  name: 'Heavy Sled Day',
  format: 'strength_block',
  warmup: null,
  cooldown: null,
  coach_notes: 'Mantén la cadera baja en sled push.',
  meta_json: null,
};

describe('athlete/assignment-detail · buildAssignmentDetail', () => {
  it('returns workout=null when the template is missing', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: null,
      segments: [],
    });
    expect(result.workout).toBeNull();
    expect(result.assignment.id).toBe('101');
    expect(result.assignment.template_id).toBe('500');
    expect(result.assignment.status).toBe('scheduled');
    expect(result.assignment.completed_at).toBeNull();
    expect(result.assignment.perceived_exertion).toBeNull();
  });

  it('parses am/pm slot from assignment notes', () => {
    const pm = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'slot:pm' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(pm.assignment.slot).toBe('pm');

    const am = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'am session' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(am.assignment.slot).toBe('am');

    const nothing = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'random note' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(nothing.assignment.slot).toBeNull();
  });

  it('groups segments into blocks ordered by block_position', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '10',
          position: 0,
          block_position: 1,
          block_format: 'amrap',
          block_title: 'AMRAP 12',
          params_json: { reps: 10 },
          prescription_json: null,
          notes: null,
          exercise_id: '900',
          exercise_name: 'Wall Ball',
          exercise_slug: 'wall-ball',
          exercise_category: 'hyrox_station',
          exercise_video_url: null,
          exercise_cues: null,
        },
        {
          id: '11',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 3, reps: 5, weight_kg: 100 },
          prescription_json: null,
          notes: 'Cinturón opcional',
          exercise_id: '901',
          exercise_name: 'Back Squat',
          exercise_slug: 'back-squat',
          exercise_category: 'strength',
          exercise_video_url: 'https://yt/back-squat',
          exercise_cues: 'Pecho arriba',
        },
      ],
    });

    expect(result.workout).not.toBeNull();
    const blocks = result.workout!.blocks;
    expect(blocks.length).toBe(2);

    // Block 0 (no override → falls back to template.format, title to "Bloque 1")
    expect(blocks[0]!.block_position).toBe(0);
    expect(blocks[0]!.format).toBe('strength_block');
    expect(blocks[0]!.title).toBe('Bloque 1');
    expect(blocks[0]!.items.length).toBe(1);
    expect(blocks[0]!.items[0]!.exercise_slug).toBe('back-squat');
    expect(blocks[0]!.items[0]!.cues).toBe('Pecho arriba');

    // Block 1 (override → amrap / "AMRAP 12")
    expect(blocks[1]!.block_position).toBe(1);
    expect(blocks[1]!.format).toBe('amrap');
    expect(blocks[1]!.title).toBe('AMRAP 12');
    expect(blocks[1]!.items[0]!.exercise_slug).toBe('wall-ball');
  });

  it('falls back the single-block title to the template name', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '20',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 5, reps: 5 },
          prescription_json: null,
          notes: null,
          exercise_id: '902',
          exercise_name: 'Deadlift',
          exercise_slug: 'deadlift',
          exercise_category: 'strength',
          exercise_video_url: null,
          exercise_cues: null,
        },
      ],
    });
    expect(result.workout!.blocks[0]!.title).toBe('Heavy Sled Day');
  });

  it('normalizes DB segment params to the wire shape', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '30',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: {
            sets: 4,
            reps: 8,
            weight_kg: 80,
            weight_pct_1rm: 70,
            rpe: 8,
            rest_seconds: 120,
            time_seconds: 60,
            distance_meters: 1000,
            pace_sec_per_km: 270,
            hr_zone: 4,
            // extra garbage that must NOT show up
            unknown_field: 'noise',
            stringy_number: '5',
          },
          prescription_json: null,
          notes: null,
          exercise_id: '903',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
        },
      ],
    });

    const p = result.workout!.blocks[0]!.items[0]!.params_json;
    expect(p.sets).toBe(4);
    expect(p.reps).toBe(8);
    expect(p.load_kg).toBe(80);
    expect(p.load_pct).toBe(70);
    expect(p.rpe).toBe(8);
    expect(p.rest_seconds).toBe(120);
    expect(p.duration_seconds).toBe(60);
    expect(p.distance_meters).toBe(1000);
    expect(p.distance_km).toBe(1);
    expect(p.pace_sec_per_km).toBe(270);
    expect(p.hr_zone).toBe(4);
    // Unknown / non-numeric fields must be dropped.
    expect(Object.keys(p)).not.toContain('unknown_field');
    expect(Object.keys(p)).not.toContain('stringy_number');
  });

  it('derives rich params from prescription_json when the thin params are bare', () => {
    // The bug: the thin params_json carries only `{sets:4}`, but the real
    // targets live in prescription_json. The loader must surface reps/load from
    // the structured prescription, not the bare scalar bag.
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '40',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          // Bare — what the buggy path used to expose.
          params_json: { sets: 4 },
          // Rich — uniform reps 8 @ 75% across 4 sets.
          prescription_json: {
            scheme: 'sets',
            sets: [
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
            ],
          },
          notes: null,
          exercise_id: '904',
          exercise_name: 'Bench Press',
          exercise_slug: 'bench-press',
          exercise_category: 'strength',
          exercise_video_url: null,
          exercise_cues: null,
        },
      ],
    });

    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.sets).toBe(4);
    expect(item.params_json.reps).toBe(8); // recovered from prescription
    expect(item.params_json.load_pct).toBe(75); // recovered from prescription
    // The structured form is passed through verbatim for iOS.
    expect(item.prescription_json).not.toBeNull();
    expect(item.prescription_json!.sets?.length).toBe(4);
  });

  it('derives distance_meters + hr_zone from a steady/interval prescription', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        // Steady Z2 run — params bare, zone only in prescription.
        {
          id: '41',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { time_seconds: 3000 },
          prescription_json: {
            scheme: 'steady',
            total_s: 3000,
            target: { kind: 'hr_zone', value: 2 },
          },
          notes: null,
          exercise_id: '905',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
        },
        // 8×400m intervals — distance only in prescription set measures.
        {
          id: '42',
          position: 1,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 8, rest_seconds: 60 },
          prescription_json: {
            scheme: 'interval',
            rounds: 8,
            rest_s: 60,
            sets: Array.from({ length: 8 }, () => ({
              measure: { kind: 'distance', meters: 400 },
            })),
          },
          notes: null,
          exercise_id: '906',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
        },
      ],
    });

    const items = result.workout!.blocks[0]!.items;
    expect(items[0]!.params_json.hr_zone).toBe(2);
    expect(items[0]!.params_json.duration_seconds).toBe(3000);
    expect(items[1]!.params_json.distance_meters).toBe(400);
    expect(items[1]!.params_json.distance_km).toBe(0.4);
    expect(items[1]!.params_json.sets).toBe(8);
  });

  it('accepts the legacy distance_m alias in the scalar fallback path', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '43',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          // No prescription → scalar fallback. Stored key is `distance_m`,
          // which the iOS consumer reads as `distance_meters`.
          params_json: { sets: 4, distance_m: 1000, rest_seconds: 90 },
          prescription_json: null,
          notes: null,
          exercise_id: '907',
          exercise_name: 'Rowing',
          exercise_slug: 'rowing',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
        },
      ],
    });
    const p = result.workout!.blocks[0]!.items[0]!.params_json;
    expect(p.distance_meters).toBe(1000);
    expect(p.distance_km).toBe(1);
  });

  it('surfaces completed_at + perceived_exertion from the execution row', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    expect(result.assignment.completed_at).toBe('2026-05-27T18:30:00+00:00');
    expect(result.assignment.perceived_exertion).toBe(7);
  });
});
