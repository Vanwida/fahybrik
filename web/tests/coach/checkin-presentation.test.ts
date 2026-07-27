// «Cómo se encuentra» — pure presentation contract. The critical invariant: the
// coach sees the SAME positive-framed questions the athlete answered in iOS
// (soreness/fatigue are stored negatively keyed and must arrive inverted).
import { describe, expect, test } from 'vitest';
import {
  CHECKIN_RISK_SUB_SCORE_MAX,
  adaptiveFlagCopy,
  checkinDimensionRows,
  checkinFreshnessLabel,
  checkinScoreTone,
  checkinValueTone,
  isCheckinRisk,
} from '@/lib/dashboard/coach/checkin-presentation';

describe('checkin presentation (pure)', () => {
  test('soreness/fatigue invert; mood/motivation/sleep pass through; iOS order + labels', () => {
    const rows = checkinDimensionRows({
      soreness: 5, // stored worst → shown 1 (Recuperación muscular)
      mood: 1,
      motivation: 4,
      fatigue: 4, // stored bad → shown 2 (Energía)
      sleep_quality: 3,
    });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Recuperación muscular', 1],
      ['Ánimo', 1],
      ['Motivación', 4],
      ['Energía', 2],
      ['Calidad del sueño', 3],
    ]);
  });

  test('null dimensions stay null (never invented)', () => {
    const rows = checkinDimensionRows({
      soreness: null,
      mood: null,
      motivation: null,
      fatigue: null,
      sleep_quality: null,
    });
    expect(rows.every((r) => r.value === null)).toBe(true);
  });

  test('risk band edges: 39 fires, 40 does not (same band as the adaptive rule)', () => {
    expect(isCheckinRisk(CHECKIN_RISK_SUB_SCORE_MAX - 1)).toBe(true);
    expect(isCheckinRisk(CHECKIN_RISK_SUB_SCORE_MAX)).toBe(false);
    expect(checkinScoreTone(39)).toBe('danger');
    expect(checkinScoreTone(40)).toBe('warn');
    expect(checkinScoreTone(54)).toBe('warn');
    expect(checkinScoreTone(55)).toBe('ok');
  });

  test('dimension value tones: 1-2 danger, 3 warn, 4-5 ok', () => {
    expect(checkinValueTone(1)).toBe('danger');
    expect(checkinValueTone(2)).toBe('danger');
    expect(checkinValueTone(3)).toBe('warn');
    expect(checkinValueTone(4)).toBe('ok');
    expect(checkinValueTone(5)).toBe('ok');
  });

  test('freshness: today shows the time; older days are dated honestly', () => {
    expect(checkinFreshnessLabel({ days_ago: 0, time_label: '10:22' })).toBe(
      'Check-in de hoy · 10:22',
    );
    expect(checkinFreshnessLabel({ days_ago: 1, time_label: '07:00' })).toBe('Check-in de ayer');
    expect(checkinFreshnessLabel({ days_ago: 3, time_label: '07:00' })).toBe(
      'Último check-in hace 3 días',
    );
  });

  test('adaptive flag copy: known flag has coach copy, unknown renders nothing', () => {
    expect(adaptiveFlagCopy('consider_swap_z2_30')).toContain('Z2');
    expect(adaptiveFlagCopy('some_future_flag')).toBeNull();
    expect(adaptiveFlagCopy(null)).toBeNull();
  });
});
