import { describe, expect, it } from 'vitest';
import { notifyPaymentFailed } from '@/lib/stripe/notifications';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

interface NotifInsert {
  user_id: bigint;
  payload: string;
}

function run(coachUserId: string | null, athleteId: string | null) {
  const inserts: NotifInsert[] = [];
  const handler: SqlHandler = (sqlText, values) => {
    if (sqlText.includes('from users u') && sqlText.includes('left join coaches')) {
      return [{ athlete_id: athleteId, coach_user_id: coachUserId }];
    }
    if (sqlText.startsWith('insert into notifications')) {
      inserts.push({ user_id: values[0] as bigint, payload: values[1] as string });
      return [];
    }
    return [];
  };
  return { fake: createFakeSql(handler), inserts };
}

describe('notifyPaymentFailed', () => {
  it('notifies the athlete with kind=payment_failed (system type)', async () => {
    const { fake, inserts } = run(null, '50');
    await notifyPaymentFailed({ client: fake, user_id: BigInt(10) });
    expect(inserts.length).toBe(1);
    expect(inserts[0].user_id).toBe(BigInt(10));
    expect(JSON.parse(inserts[0].payload)).toMatchObject({ kind: 'payment_failed' });
  });

  it('also notifies the coach when the athlete has one linked', async () => {
    const { fake, inserts } = run('77', '50');
    await notifyPaymentFailed({ client: fake, user_id: BigInt(10) });
    expect(inserts.length).toBe(2);
    const athleteNotif = inserts.find((i) => i.user_id === BigInt(10));
    const coachNotif = inserts.find((i) => i.user_id === BigInt(77));
    expect(athleteNotif).toBeTruthy();
    expect(coachNotif).toBeTruthy();
    expect(JSON.parse(coachNotif!.payload)).toMatchObject({
      kind: 'payment_failed',
      athlete_id: '50',
    });
  });
});
