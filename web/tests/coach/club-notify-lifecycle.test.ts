/**
 * Pausas y bajas van al correo del club. Sin dato, no se envía.
 * El env y hello@ no rescatan a un club nuevo.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

interface SentEmail {
  to: string | string[];
  subject: string;
}

const sent: SentEmail[] = [];
const sendMock = vi.fn(async (opts: SentEmail) => {
  sent.push(opts);
  return { error: null as { message: string } | null };
});
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const resolveClubNotifyEmail = vi.fn(async () => null as string | null);
vi.mock('@/lib/coach/club-notify', () => ({ resolveClubNotifyEmail }));

vi.mock('@/lib/notifications/dispatch', () => ({
  notifyCoach: vi.fn(async () => undefined),
}));

let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

process.env.RESEND_API_KEY = 'test-key';
process.env.LEADS_NOTIFY_EMAIL = 'hello@fahybrid.com';

const { alertCoachPauseStarted, alertCoachBajaScheduled } = await import(
  '@/lib/athlete/lifecycle-coach-alerts'
);

const ATHLETE_ID = BigInt(11);

beforeEach(() => {
  sent.length = 0;
  sendMock.mockClear();
  resolveClubNotifyEmail.mockReset();
  resolveClubNotifyEmail.mockResolvedValue(null);
  handler = () => [{ full_name: 'Marta', months: 4, coach_id: '7' }];
});

describe('aviso de pausa y baja', () => {
  test('sin correo del club no envía, aunque el env apunte a hello@', async () => {
    await alertCoachPauseStarted({
      athlete_id: ATHLETE_ID,
      reason: 'vacaciones',
      returns_on: '2026-09-01',
      days: 7,
      available_after: 14,
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(7));
  });

  test('llega al correo del club, no a hello@', async () => {
    resolveClubNotifyEmail.mockResolvedValue('avisos@northbox.test');
    await alertCoachBajaScheduled({
      athlete_id: ATHLETE_ID,
      reason: 'otro',
      scheduled_for: '2026-09-15',
      days_left: 10,
    });
    expect(sent[0]?.to).toBe('avisos@northbox.test');
    expect(sent[0]?.to).not.toBe('hello@fahybrid.com');
    expect(sent[0]?.subject).toContain('Marta');
  });
});
