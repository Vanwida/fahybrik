import { describe, expect, test } from 'vitest';
import { buildBriefing } from '@/lib/coach/briefing';
import { buildDemoCohort } from '@/lib/coach/demo-data';

describe('buildBriefing', () => {
  test('morning greeting uses BUENOS DÍAS and first name uppercase', () => {
    const cohort = buildDemoCohort({ now: new Date('2026-05-07T09:00:00Z') });
    const briefing = buildBriefing({
      coach_first_name: 'Pablo Castaño',
      cohort,
      now: new Date('2026-05-07T09:00:00Z'),
    });
    expect(briefing.greeting).toBe('BUENOS DÍAS, PABLO');
    expect(briefing.time_of_day).toBe('morning');
  });

  test('aggregates session counts and alerts from the cohort', () => {
    const cohort = buildDemoCohort();
    const briefing = buildBriefing({
      coach_first_name: 'Pablo',
      cohort,
    });
    const sessionLine = briefing.lines.find((l) => l.id === 'sessions');
    expect(sessionLine).toBeTruthy();
    const alertLine = briefing.lines.find((l) => l.id === 'alerts');
    expect(alertLine?.emphasis).toBe('critical');
  });

  test('first-time state when cohort is empty', () => {
    const briefing = buildBriefing({ coach_first_name: 'Pablo', cohort: [] });
    expect(briefing.is_first_time).toBe(true);
    expect(briefing.active_athlete_count).toBe(0);
  });

  test('night greeting after 22h', () => {
    const briefing = buildBriefing({
      coach_first_name: 'Pablo',
      cohort: buildDemoCohort(),
      now: new Date('2026-05-07T22:30:00'),
    });
    expect(briefing.time_of_day).toBe('night');
    expect(briefing.greeting).toBe('BUENAS NOCHES, PABLO');
  });
});
