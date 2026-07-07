/**
 * Pure unit tests for the Dobles connected-plan mapping
 * (lib/athlete/dobles-plan.ts). No DB — exercises the togetherness
 * classification and the plan builder over hand-built AthleteWeekPlan fixtures.
 */
import { describe, expect, test } from 'vitest';
import type {
  AthleteWeekDay,
  AthleteWeekDaySession,
  AthleteWeekPlan,
} from '@/lib/athlete/week-plan';
import {
  buildDoblesConnectedPlan,
  classifyDay,
} from '@/lib/athlete/dobles-plan';

function session(
  overrides: Partial<AthleteWeekDaySession> & { assignment_id: string; template_id: string },
): AthleteWeekDaySession {
  return {
    slot: 'am',
    format: 'circuit',
    title: 'Sesión',
    modality: 'strength',
    status: 'scheduled',
    partner_visibility: 'shared',
    origin: 'coach',
    est_duration_minutes: null,
    blocks_count: null,
    short_prescription: null,
    is_test: false,
    ...overrides,
  };
}

function day(dow: number, iso: string, sessions: AthleteWeekDaySession[]): AthleteWeekDay {
  return { day_of_week: dow, iso_date: iso, sessions, is_rest: sessions.length === 0 };
}

const ISO = '2026-07-06';

describe('classifyDay', () => {
  test('no session both sides → rest', () => {
    const d = classifyDay(day(1, ISO, []), day(1, ISO, []), 'Guillem');
    expect(d.togetherness).toBe('rest');
    expect(d.session_title).toBeNull();
    expect(d.id).toBe(`rest-${ISO}`);
  });

  test('same shared template, not done → optional_together', () => {
    const subj = day(1, ISO, [session({ assignment_id: '668', template_id: '564' })]);
    const other = day(1, ISO, [session({ assignment_id: '900', template_id: '564' })]);
    const d = classifyDay(subj, other, 'Guillem');
    expect(d.togetherness).toBe('optional_together');
    expect(d.detail).toBe('Opcional juntos');
    expect(d.id).toBe('668');
  });

  test('same shared template, both completed → both_done', () => {
    const subj = day(2, ISO, [
      session({ assignment_id: '669', template_id: '565', status: 'completed' }),
    ]);
    const other = day(2, ISO, [
      session({ assignment_id: '901', template_id: '565', status: 'completed' }),
    ]);
    const d = classifyDay(subj, other, 'Guillem');
    expect(d.togetherness).toBe('both_done');
    expect(d.detail).toBeNull();
  });

  test('hyrox_sim shared with a twin → joint_mandatory', () => {
    const subj = day(4, ISO, [
      session({ assignment_id: '666', template_id: '568', format: 'hyrox_sim' }),
    ]);
    const other = day(4, ISO, [
      session({ assignment_id: '902', template_id: '568', format: 'hyrox_sim' }),
    ]);
    const d = classifyDay(subj, other, 'Guillem');
    expect(d.togetherness).toBe('joint_mandatory');
    expect(d.detail).toContain('Obligatoria juntos');
  });

  test('different templates → each_own naming the other session', () => {
    const subj = day(3, ISO, [session({ assignment_id: '670', template_id: '566', title: 'Metcon' })]);
    const other = day(3, ISO, [session({ assignment_id: '903', template_id: '999', title: 'Series' })]);
    const d = classifyDay(subj, other, 'Guillem');
    expect(d.togetherness).toBe('each_own');
    expect(d.detail).toBe('Guillem hace Series');
  });

  test('subject trains, other rests → each_own with null detail', () => {
    const subj = day(3, ISO, [session({ assignment_id: '670', template_id: '566' })]);
    const d = classifyDay(subj, day(3, ISO, []), 'Guillem');
    expect(d.togetherness).toBe('each_own');
    expect(d.detail).toBeNull();
  });

  test('self_only session is never together even with a twin', () => {
    const subj = day(1, ISO, [
      session({ assignment_id: '668', template_id: '564', partner_visibility: 'self_only' }),
    ]);
    const other = day(1, ISO, [session({ assignment_id: '900', template_id: '564' })]);
    const d = classifyDay(subj, other, 'Guillem');
    expect(d.togetherness).toBe('each_own');
  });
});

describe('buildDoblesConnectedPlan', () => {
  function weekFrom(days: AthleteWeekDay[], microciclo: string | null = 'Acumulación 2'): AthleteWeekPlan {
    return {
      week_start: '2026-07-06',
      week_end: '2026-07-12',
      today_iso: '2026-07-07',
      microciclo_name: microciclo,
      focus: null,
      has_next_week: false,
      days,
    };
  }

  test('aligns days, picks first optional_together as train-together id, reads label', () => {
    const selfDays = [
      day(1, '2026-07-06', [session({ assignment_id: '668', template_id: '564' })]),
      day(2, '2026-07-07', [
        session({ assignment_id: '669', template_id: '565', status: 'completed' }),
      ]),
    ];
    const partnerDays = [
      day(1, '2026-07-06', [session({ assignment_id: '800', template_id: '564' })]),
      day(2, '2026-07-07', [
        session({ assignment_id: '801', template_id: '565', status: 'completed' }),
      ]),
    ];
    const plan = buildDoblesConnectedPlan({
      selfWeek: weekFrom(selfDays),
      partnerWeek: weekFrom(partnerDays),
      self_name: 'Atleta',
      partner_name: 'Guillem',
    });

    expect(plan.self_days).toHaveLength(2);
    expect(plan.partner_days).toHaveLength(2);
    expect(plan.self_days[0].togetherness).toBe('optional_together');
    expect(plan.self_days[1].togetherness).toBe('both_done');
    expect(plan.train_together_session_id).toBe('668');
    expect(plan.partner_plan_visible).toBe(true);
    expect(plan.week_label).toBe('Acumulación 2');
    expect(plan.partner_name).toBe('Guillem');
    expect(plan.notes).toEqual([]);
  });

  test('partner_plan_visible false when partner has no shared session', () => {
    const selfDays = [day(1, '2026-07-06', [session({ assignment_id: '668', template_id: '564' })])];
    const partnerDays = [
      day(1, '2026-07-06', [
        session({ assignment_id: '800', template_id: '564', partner_visibility: 'self_only' }),
      ]),
    ];
    const plan = buildDoblesConnectedPlan({
      selfWeek: weekFrom(selfDays, null),
      partnerWeek: weekFrom(partnerDays, null),
      self_name: 'Atleta',
      partner_name: 'Guillem',
    });
    expect(plan.partner_plan_visible).toBe(false);
    expect(plan.week_label).toBeNull();
    expect(plan.train_together_session_id).toBeNull(); // self is each_own (partner self_only)
  });
});
