import { describe, expect, test } from 'vitest';
import { handleSubscriptionCancellation } from '@/lib/partner/cascade';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

describe('handleSubscriptionCancellation', () => {
  test('returns ran:false when subscription not found', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from subscriptions')) return [];
      return [];
    };
    const fake = createFakeSql(handler);
    const result = await handleSubscriptionCancellation(BigInt(123), 'webhook', { client: fake });
    expect(result.ran).toBe(false);
    expect(result.cascaded).toBe(false);
    expect(result.affected_user_ids).toEqual([]);
  });

  test('does not cascade when subscription has no partner_user_id', async () => {
    const inserts: Array<{ user_id: bigint }> = [];
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('from subscriptions')) {
        return [
          {
            id: '123',
            user_id: '10',
            partner_user_id: null,
            status: 'canceled',
          },
        ];
      }
      if (sqlText.includes('insert into notifications')) {
        inserts.push({ user_id: values[0] as bigint });
        return [];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const result = await handleSubscriptionCancellation(BigInt(123), 'webhook', { client: fake });
    expect(result.ran).toBe(true);
    expect(result.cascaded).toBe(false);
    expect(result.affected_user_ids.map((u) => u.toString())).toEqual(['10']);
    expect(inserts.length).toBe(1);
  });

  test('cascades to both users when partner_user_id is set', async () => {
    const inserts: Array<{ user_id: bigint }> = [];
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('from subscriptions')) {
        return [
          {
            id: '200',
            user_id: '10',
            partner_user_id: '11',
            status: 'canceled',
          },
        ];
      }
      if (sqlText.includes('insert into notifications')) {
        inserts.push({ user_id: values[0] as bigint });
        return [];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const result = await handleSubscriptionCancellation(BigInt(200), 'partner_cancelled', { client: fake });
    expect(result.ran).toBe(true);
    expect(result.cascaded).toBe(true);
    expect(result.affected_user_ids.map((u) => u.toString())).toEqual(['10', '11']);
    expect(inserts.length).toBe(2);
  });
});
