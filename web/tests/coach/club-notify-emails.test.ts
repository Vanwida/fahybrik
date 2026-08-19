/**
 * Leads y bajas van al correo del club. Sin dato, no se envía.
 * El env y hello@ no rescatan a un club nuevo.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface SentEmail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string }[];
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
vi.mock('@/lib/coach/club-skin', () => ({
  resolveClubEmailSkin: vi.fn(async () => ({
    wordmark: 'FAHYBRID',
    light: { fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' },
    dark: { fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' },
  })),
}));

process.env.RESEND_API_KEY = 'test-key';
process.env.LEADS_NOTIFY_EMAIL = 'hello@fahybrid.com';
process.env.RESEND_FROM_EMAIL = 'Club <noreply@aistudios.pro>';

const { sendLeadNotification } = await import('@/lib/leads/email');
const { sendBookingInternal, sendAppointmentAccepted } = await import('@/lib/citas/email');

const LEAD = {
  email: 'lead@example.com',
  nombre: 'Marta',
  telefono: '600000000',
} as unknown as Parameters<typeof sendLeadNotification>[0];

const APPT = {
  id: '9',
  requested_start: '2026-08-20T09:00:00.000Z',
  duration_minutes: 30,
  meet_link: null,
  lead_email: 'lead@example.com',
  lead_nombre: 'Marta',
  lead_token: 'tok',
  modality: 'video' as const,
  coach_id: BigInt(7),
};

beforeEach(() => {
  sent.length = 0;
  sendMock.mockClear();
  resolveClubNotifyEmail.mockReset();
  resolveClubNotifyEmail.mockResolvedValue(null);
});

describe('aviso de lead', () => {
  test('sin correo del club no envía, aunque el env apunte a hello@', async () => {
    const result = await sendLeadNotification(LEAD, BigInt(7));
    expect(result.sent).toBe(false);
    expect(result.skipped_reason).toBe('no_inbox');
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('llega al correo del club, no a hello@', async () => {
    resolveClubNotifyEmail.mockResolvedValue('avisos@northbox.test');
    const result = await sendLeadNotification(LEAD, BigInt(7));
    expect(result.sent).toBe(true);
    expect(sent[0]?.to).toBe('avisos@northbox.test');
    expect(sent[0]?.to).not.toBe('hello@fahybrid.com');
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(7));
  });
});

describe('aviso interno de cita', () => {
  test('sin correo del club no envía', async () => {
    const result = await sendBookingInternal(APPT);
    expect(result.sent).toBe(false);
    expect(result.skipped_reason).toBe('no_inbox');
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('llega al correo del club de esa cita', async () => {
    resolveClubNotifyEmail.mockResolvedValue('avisos@northbox.test');
    const result = await sendBookingInternal(APPT);
    expect(result.sent).toBe(true);
    expect(sent[0]?.to).toBe('avisos@northbox.test');
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(7));
  });
});

function decodedIcs(mail: SentEmail): string {
  const att = mail.attachments?.[0];
  return att ? Buffer.from(att.content, 'base64').toString('utf8') : '';
}

describe('organizador del .ics de la cita aceptada', () => {
  test('sin correo del club usa el from de Resend, nunca hello@', async () => {
    const result = await sendAppointmentAccepted(APPT);
    expect(result.sent).toBe(true);
    const ics = decodedIcs(sent[0]!);
    expect(ics).toContain('ORGANIZER:mailto:noreply@aistudios.pro');
    expect(ics).not.toContain('hello@fahybrid.com');
    expect(sent[0]?.to).toBe('lead@example.com');
  });

  test('con correo del club, ese es el organizador', async () => {
    resolveClubNotifyEmail.mockResolvedValue('avisos@northbox.test');
    await sendAppointmentAccepted(APPT);
    const ics = decodedIcs(sent[0]!);
    expect(ics).toContain('ORGANIZER:mailto:avisos@northbox.test');
    expect(ics).not.toContain('hello@fahybrid.com');
  });
});
