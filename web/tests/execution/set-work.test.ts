import { describe, expect, test } from 'vitest';
import { SET_IS_WORKING } from '@/lib/execution/set-work';
import { createFakeSql } from '../utils/fake-sql';

describe('SET_IS_WORKING · clase 42703', () => {
  test('no nombra st.is_approach desnudo', async () => {
    let seen = '';
    const sql = createFakeSql((text) => {
      seen = text;
      return [];
    });
    await sql`select 1 where ${SET_IS_WORKING(sql)}`;
    expect(seen).toContain("to_jsonb(st)->>'is_approach'");
    expect(seen).toContain("st.status <> 'skipped'");
    expect(seen).not.toMatch(/(^|[^>])st\.is_approach\b/);
  });
});
