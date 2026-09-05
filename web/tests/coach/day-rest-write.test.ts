import { describe, expect, test } from 'vitest';
import { parseRestWrite } from '@/lib/dashboard/coach/day-rest-write';

describe('parseRestWrite — contrato sesión vs día', () => {
  test('sin kind rest → path de contenido', () => {
    expect(parseRestWrite({ template_id: 1, segments: [] })).toEqual({ status: 'content' });
    expect(parseRestWrite(null)).toEqual({ status: 'content' });
    expect(parseRestWrite([])).toEqual({ status: 'content' });
    expect(parseRestWrite('rest')).toEqual({ status: 'content' });
  });

  test('{ kind: rest } sin id → primitiva día', () => {
    expect(parseRestWrite({ kind: 'rest' })).toEqual({ status: 'day' });
  });

  test('{ kind: rest, assignment_id } → primitiva sesión', () => {
    expect(parseRestWrite({ kind: 'rest', assignment_id: 12 })).toEqual({
      status: 'session',
      assignment_id: 12,
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: '12' })).toEqual({
      status: 'session',
      assignment_id: 12,
    });
  });

  test('rest + segments o template_id → 400 mixed (también con assignment_id)', () => {
    expect(parseRestWrite({ kind: 'rest', segments: [] })).toEqual({ status: 'mixed' });
    expect(parseRestWrite({ kind: 'rest', template_id: 4 })).toEqual({ status: 'mixed' });
    expect(parseRestWrite({ kind: 'rest', assignment_id: 9, segments: [] })).toEqual({
      status: 'mixed',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: 9, template_id: 4 })).toEqual({
      status: 'mixed',
    });
  });

  test('assignment_id inválido → 400, no wipe del día', () => {
    expect(parseRestWrite({ kind: 'rest', assignment_id: null })).toEqual({
      status: 'bad_assignment',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: '' })).toEqual({
      status: 'bad_assignment',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: '12a' })).toEqual({
      status: 'bad_assignment',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: 0 })).toEqual({
      status: 'bad_assignment',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: -3 })).toEqual({
      status: 'bad_assignment',
    });
    expect(parseRestWrite({ kind: 'rest', assignment_id: 1.5 })).toEqual({
      status: 'bad_assignment',
    });
  });
});
