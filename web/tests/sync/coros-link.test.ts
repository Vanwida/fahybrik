import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sync/assignment-status', () => ({
  markAssignmentDoneFromDevice: vi.fn(),
}));

const { markAssignmentDoneFromDevice } = await import('@/lib/sync/assignment-status');
const { confirmCorosLink } = await import('@/lib/sync/coros-link');

function fakeSql(rows: unknown[]) {
  const fn = vi.fn();
  fn.mockResolvedValueOnce(rows);
  fn.mockResolvedValue([]);
  return fn as unknown as import('@/lib/db').Sql;
}

describe('confirmCorosLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('yes attaches the execution and closes the planned assignment', async () => {
    const sql = fakeSql([
      { id: '3', status: 'pending', execution_id: '10', assignment_id: '20' },
    ]);
    const result = await confirmCorosLink({
      sql,
      athlete_id: BigInt(1),
      confirmationId: '3',
      answer: 'yes',
    });
    expect(result).toEqual({ ok: true, answer: 'yes' });
    expect(markAssignmentDoneFromDevice).toHaveBeenCalledWith(sql, '20', BigInt(1));
  });

  it('no leaves the planned assignment untouched', async () => {
    const sql = fakeSql([
      { id: '3', status: 'pending', execution_id: '10', assignment_id: '20' },
    ]);
    const result = await confirmCorosLink({
      sql,
      athlete_id: BigInt(1),
      confirmationId: '3',
      answer: 'no',
    });
    expect(result).toEqual({ ok: true, answer: 'no' });
    expect(markAssignmentDoneFromDevice).not.toHaveBeenCalled();
  });

  it('does not auto-close when the confirmation is already answered', async () => {
    const sql = fakeSql([{ id: '3', status: 'yes', execution_id: '10', assignment_id: '20' }]);
    const result = await confirmCorosLink({
      sql,
      athlete_id: BigInt(1),
      confirmationId: '3',
      answer: 'yes',
    });
    expect(result).toEqual({ ok: false, error: 'already_answered' });
    expect(markAssignmentDoneFromDevice).not.toHaveBeenCalled();
  });
});
