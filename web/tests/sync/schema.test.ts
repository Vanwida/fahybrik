import { describe, expect, it } from 'vitest';
import {
  checkinRequestSchema,
  healthkitSyncRequestSchema,
} from '@/lib/sync/schema';

describe('healthkitSyncRequestSchema', () => {
  it('accepts a minimal batch', () => {
    const r = healthkitSyncRequestSchema.safeParse({
      batch: {
        athlete_id: '12',
        sent_at: '2026-05-08T07:00:00.000Z',
        workouts: [],
        samples: [],
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a workout DTO', () => {
    const r = healthkitSyncRequestSchema.safeParse({
      batch: {
        athlete_id: '12',
        sent_at: '2026-05-08T07:00:00.000Z',
        workouts: [
          {
            source_workout_id: 'abc-uuid',
            workout_activity_type: 37,
            started_at: '2026-05-08T06:00:00.000Z',
            ended_at: '2026-05-08T06:45:00.000Z',
            duration_seconds: 2700,
            total_energy_burned_kcal: 432,
            total_distance_meters: 8000,
            avg_heart_rate_bpm: 162,
            max_heart_rate_bpm: 184,
            lap_markers: [
              {
                started_at: '2026-05-08T06:00:00.000Z',
                ended_at: '2026-05-08T06:05:00.000Z',
                duration_seconds: 300,
                event_kind: 'lap',
              },
            ],
            source: 'healthkit',
          },
        ],
        samples: [],
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad ISO timestamps', () => {
    const r = healthkitSyncRequestSchema.safeParse({
      batch: { sent_at: 'not-a-date', workouts: [], samples: [] },
    });
    expect(r.success).toBe(false);
  });
});

describe('checkinRequestSchema', () => {
  it('accepts a fully filled snapshot', () => {
    const r = checkinRequestSchema.safeParse({
      checkin: {
        recorded_at: '2026-05-08T07:30:00.000Z',
        soreness: 3,
        mood: 4,
        motivation: 4,
        fatigue: 2,
        sleep_quality: 4,
        notes: 'fine',
        sub_score: 75,
      },
    });
    expect(r.success).toBe(true);
  });
  it('rejects sub_score > 100', () => {
    const r = checkinRequestSchema.safeParse({
      checkin: {
        recorded_at: '2026-05-08T07:30:00.000Z',
        soreness: null,
        mood: null,
        motivation: null,
        fatigue: null,
        sleep_quality: null,
        sub_score: 150,
      },
    });
    expect(r.success).toBe(false);
  });
  it('rejects out-of-range scale answers', () => {
    const r = checkinRequestSchema.safeParse({
      checkin: {
        recorded_at: '2026-05-08T07:30:00.000Z',
        soreness: 7,
        mood: 4,
        motivation: 4,
        fatigue: 2,
        sleep_quality: 4,
        sub_score: 75,
      },
    });
    expect(r.success).toBe(false);
  });
});
