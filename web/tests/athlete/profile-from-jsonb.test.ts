import { describe, expect, test, vi } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';

vi.mock('@/lib/athlete/hr-zones', () => ({
  loadAthleteHrZones: async () => null,
  buildHrZonesDTO: () => null,
}));

const { athleteProfileFromJsonb, loadAthleteProfileByUserId } = await import(
  '@/lib/athlete/profile'
);

describe('athleteProfileFromJsonb · sesión ready', () => {
  test('sin avatar_url / max_hr / idioma no tira — van a null', () => {
    const dto = athleteProfileFromJsonb({
      id: 67,
      full_name: 'Ada',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(dto).not.toBeNull();
    expect(dto?.id).toBe('67');
    expect(dto?.full_name).toBe('Ada');
    expect(dto?.avatar_url).toBeNull();
    expect(dto?.max_hr_bpm).toBeNull();
    expect(dto?.preferred_language).toBeNull();
    expect(dto?.goal_type).toBeNull();
    expect(dto?.hr_zones).toBeNull();
    expect(dto?.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  test('created_at Date no llama toISOString a ciegas sobre un string', () => {
    const fromDate = athleteProfileFromJsonb({
      id: '1',
      full_name: 'Ada',
      created_at: new Date('2026-02-02T12:00:00.000Z'),
    });
    expect(fromDate?.created_at).toBe('2026-02-02T12:00:00.000Z');
  });

  test('created_at ausente no tira', () => {
    const dto = athleteProfileFromJsonb({ id: 1, full_name: 'Ada' });
    expect(dto).not.toBeNull();
    expect(dto?.created_at).toBe(new Date(0).toISOString());
  });

  test('sin id no hay atleta', () => {
    expect(athleteProfileFromJsonb({ full_name: 'Ada' })).toBeNull();
    expect(athleteProfileFromJsonb(null)).toBeNull();
    expect(athleteProfileFromJsonb('nope')).toBeNull();
  });

  test('números y coach_id llegan como texto de id', () => {
    const dto = athleteProfileFromJsonb({
      id: 67,
      full_name: 'Ada',
      coach_id: 60,
      height_cm: '178.5',
      training_days_per_week: 5,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(dto?.coach_id).toBe('60');
    expect(dto?.height_cm).toBe(178.5);
    expect(dto?.training_days_per_week).toBe(5);
  });
});

describe('loadAthleteProfileByUserId · to_jsonb', () => {
  test('el SELECT es to_jsonb(a), no columnas sueltas', async () => {
    const seen: string[] = [];
    const sql = createFakeSql((text) => {
      seen.push(text);
      return [{ athlete: { id: 67, full_name: 'Ada', created_at: '2026-01-01T00:00:00.000Z' } }];
    });
    const dto = await loadAthleteProfileByUserId(sql, BigInt(99));
    expect(seen[0]).toContain('to_jsonb(a)');
    expect(seen[0]).not.toMatch(/a\.avatar_url\b/);
    expect(seen[0]).not.toMatch(/a\.max_hr_bpm\b/);
    expect(seen[0]).not.toMatch(/a\.preferred_language\b/);
    expect(dto?.id).toBe('67');
    expect(dto?.avatar_url).toBeNull();
  });
});
