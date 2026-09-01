/**
 * La piel del club en los correos que SÍ van al atleta/lead de un entrenador, y
 * la ausencia de piel en los que son comunicación NUESTRA (interna o de nuestro
 * propio equipo). `resolveClubEmailSkin` (tests/coach/club-email-skin.test.ts)
 * ya prueba la derivación; aquí se prueba que cada plantilla la USA — o
 * deliberadamente no la toca, si el correo no es del club.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
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

const DEFAULT_SKIN = {
  wordmark: 'FAHYBRID',
  light: { fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' },
  dark: { fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' },
};
const CLUB_SKIN = {
  wordmark: 'North Box',
  light: { fill: '#2d6cdf', on_fill: '#ffffff', text: '#1c4fae' },
  dark: { fill: '#5b8fef', on_fill: '#0a0a0a', text: '#8fb4ff' },
};

const resolveClubEmailSkin = vi.fn().mockResolvedValue(DEFAULT_SKIN);
vi.mock('@/lib/coach/club-skin', () => ({ resolveClubEmailSkin }));

const CLUB_INBOX = 'avisos@northbox.test';
const resolveClubNotifyEmail = vi.fn(async () => CLUB_INBOX as string | null);
vi.mock('@/lib/coach/club-notify', () => ({ resolveClubNotifyEmail }));

process.env.RESEND_API_KEY = 'test-key';
process.env.LEADS_NOTIFY_EMAIL = 'hello@fahybrid.com';

const { sendLeadConfirmation, sendLeadNotification } = await import('@/lib/leads/email');
const { sendAltaEmail } = await import('@/lib/leads/alta-email');
const { sendEmailLoginCode } = await import('@/lib/auth/email-code');
const { sendAppointmentAccepted, sendBookingInternal } = await import('@/lib/citas/email');
const { sendSessionSummaryEmail } = await import('@/lib/citas/session-summary-email');
const { sendNurtureEmail } = await import('@/lib/leads/nurture-email');
const { sendWaitlistJoinedEmail, sendWaitlistReleasedEmail } = await import(
  '@/lib/leads/waitlist-email'
);
const { sendAltaPaymentEmail } = await import('@/lib/leads/alta-payment-email');

const LEAD_INPUT = {
  email: 'lead@example.com',
  nombre: 'Marta Ruiz',
  telefono: '600000000',
} as unknown as Parameters<typeof sendLeadConfirmation>[0];

const APPT = {
  id: '1',
  requested_start: '2026-08-06T16:00:00.000Z',
  duration_minutes: 30,
  meet_link: 'https://meet.google.com/abc-defg-hij',
  lead_email: 'lead@example.com',
  lead_nombre: 'Marta Ruiz',
  lead_token: 'tok-1234567890',
  modality: 'video' as const,
};

beforeEach(() => {
  sent.length = 0;
  sendMock.mockClear();
  resolveClubEmailSkin.mockClear();
  resolveClubEmailSkin.mockResolvedValue(DEFAULT_SKIN);
  resolveClubNotifyEmail.mockReset();
  resolveClubNotifyEmail.mockResolvedValue(CLUB_INBOX);
});

describe('un entrenador SIN piel produce el color de siempre', () => {
  test('confirmación de lead', async () => {
    await sendLeadConfirmation(LEAD_INPUT, 'tok-1234567890', 'Pablo Amigo', BigInt(1));
    const mail = sent[0]!;
    expect(mail.subject).toBe('Hemos recibido tu solicitud · FAHYBRID');
    expect(mail.html).toContain('#F06A2A');
    expect(resolveClubEmailSkin).toHaveBeenCalledWith(BigInt(1));
  });

  test('alta del atleta', async () => {
    await sendAltaEmail({ to: 'a@b.com', name: 'Marta', coach_id: BigInt(1) });
    expect(sent[0]!.subject).toBe('Ya tienes tu sitio en FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('código de acceso', async () => {
    await sendEmailLoginCode({
      to: 'a@b.com',
      code: '424242',
      expires_at: new Date(Date.now() + 60_000),
      coach_id: BigInt(1),
    });
    expect(sent[0]!.subject).toContain('· FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('cita confirmada', async () => {
    await sendAppointmentAccepted({ ...APPT, coach_id: BigInt(1) });
    expect(sent[0]!.subject).toBe('Cita confirmada · FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('resumen de sesión', async () => {
    await sendSessionSummaryEmail({
      to: 'a@b.com',
      name: 'Marta',
      summary: 'Hablamos del plan.',
      coach_id: BigInt(1),
    });
    expect(sent[0]!.subject).toBe('Resumen de tu llamada con FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('nurture (parcial_t1, el único touch que nombra la marca)', async () => {
    await sendNurtureEmail({
      touch_type: 'parcial_t1',
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: null,
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    expect(sent[0]!.subject).toBe('Termina tu solicitud en FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('lista de espera: JOINED', async () => {
    await sendWaitlistJoinedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    expect(sent[0]!.subject).toBe('Estás en la lista de espera de FAHYBRID');
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('lista de espera: RELEASED', async () => {
    await sendWaitlistReleasedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: 'tok-1234567890',
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    expect(sent[0]!.html).toContain('#F06A2A');
  });

  test('aceptación de alta con Stripe', async () => {
    await sendAltaPaymentEmail({
      to: 'a@b.com',
      name: 'Marta',
      amount_cents: 7000,
      currency: 'eur',
      checkoutUrl: 'https://checkout.stripe.com/x',
      coach_id: BigInt(1),
    });
    expect(sent[0]!.subject).toBe('Bienvenido/a a FAHYBRID — activa tu plan');
    expect(sent[0]!.html).toContain('#F06A2A');
  });
});

describe('un entrenador CON piel produce la suya', () => {
  beforeEach(() => {
    resolveClubEmailSkin.mockResolvedValue(CLUB_SKIN);
  });

  test('confirmación de lead: nombre y acento del club, ni rastro del naranja fijo', async () => {
    await sendLeadConfirmation(LEAD_INPUT, 'tok-1234567890', 'Pablo Amigo', BigInt(1));
    const mail = sent[0]!;
    expect(mail.subject).toBe('Hemos recibido tu solicitud · North Box');
    expect(mail.text).toContain('El equipo de North Box');
    expect(mail.html).toContain('North Box');
    expect(mail.html).toContain(CLUB_SKIN.light.fill);
    expect(mail.html).not.toContain('#F06A2A');
    expect(mail.html).not.toContain('FAHYBRID');
  });

  test('alta del atleta: usa la superficie OSCURA (el correo es de fondo casi negro)', async () => {
    await sendAltaEmail({ to: 'a@b.com', name: 'Marta', coach_id: BigInt(1) });
    const mail = sent[0]!;
    expect(mail.subject).toBe('Ya tienes tu sitio en North Box');
    expect(mail.html).toContain(CLUB_SKIN.dark.text);
    expect(mail.html).not.toContain(CLUB_SKIN.light.fill); // no mezcla superficies
  });

  test('código de acceso: usa la superficie CLARA (el correo es de fondo blanco)', async () => {
    await sendEmailLoginCode({
      to: 'a@b.com',
      code: '424242',
      expires_at: new Date(Date.now() + 60_000),
      coach_id: BigInt(1),
    });
    const mail = sent[0]!;
    expect(mail.subject).toContain('· North Box');
    expect(mail.html).toContain(CLUB_SKIN.light.text);
  });

  test('cita confirmada: nombre y acento del club', async () => {
    await sendAppointmentAccepted({ ...APPT, coach_id: BigInt(1) });
    const mail = sent[0]!;
    expect(mail.subject).toBe('Cita confirmada · North Box');
    expect(mail.html).toContain(CLUB_SKIN.light.fill);
  });

  test('resumen de sesión: usa la superficie oscura', async () => {
    await sendSessionSummaryEmail({
      to: 'a@b.com',
      name: 'Marta',
      summary: 'Hablamos del plan.',
      coach_id: BigInt(1),
    });
    expect(sent[0]!.subject).toBe('Resumen de tu llamada con North Box');
    expect(sent[0]!.html).toContain(CLUB_SKIN.dark.text);
  });

  test('nurture (parcial_t1): nombre del club en el único hueco que lo menciona', async () => {
    await sendNurtureEmail({
      touch_type: 'parcial_t1',
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: null,
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    const mail = sent[0]!;
    expect(mail.subject).toBe('Termina tu solicitud en North Box');
    expect(mail.html).toContain(CLUB_SKIN.light.fill);
    expect(mail.html).not.toContain('FAHYBRID');
  });

  test('lista de espera JOINED: nombre y acento del club', async () => {
    await sendWaitlistJoinedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    const mail = sent[0]!;
    expect(mail.subject).toBe('Estás en la lista de espera de North Box');
    // JOINED no lleva CTA (todavía no puede reservar): el acento se ve en el
    // wordmark y en la firma, no en un botón.
    expect(mail.html).toContain(CLUB_SKIN.light.text);
    expect(mail.html).toContain('El equipo de North Box');
    expect(mail.html).not.toContain('FAHYBRID');
  });

  test('lista de espera RELEASED: acento del club en el botón', async () => {
    await sendWaitlistReleasedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: 'tok-1234567890',
      unsubscribe_token: 'unsub-1',
      coach_id: '1',
    });
    expect(sent[0]!.html).toContain(CLUB_SKIN.light.fill);
  });

  test('aceptación de alta con Stripe: nombre y acento del club', async () => {
    await sendAltaPaymentEmail({
      to: 'a@b.com',
      name: 'Marta',
      amount_cents: 7000,
      currency: 'eur',
      checkoutUrl: 'https://checkout.stripe.com/x',
      coach_id: BigInt(1),
    });
    const mail = sent[0]!;
    expect(mail.subject).toBe('Bienvenido/a a North Box — activa tu plan');
    expect(mail.html).toContain('North Box');
    expect(mail.html).toContain(CLUB_SKIN.light.fill);
    expect(mail.html).not.toContain('FAHYBRID');
  });
});

describe('un correo de los NUESTROS no se personaliza nunca', () => {
  test('la notificación interna de un lead nuevo no toca la piel del club, aunque exista', async () => {
    resolveClubEmailSkin.mockResolvedValue(CLUB_SKIN);
    await sendLeadNotification(
      {
        email: 'lead@example.com',
        nombre: 'Marta',
        telefono: '600000000',
      } as unknown as Parameters<typeof sendLeadNotification>[0],
      BigInt(1),
    );
    const mail = sent[0]!;
    expect(mail.to).toBe(CLUB_INBOX);
    expect(mail.to).not.toBe('hello@fahybrid.com');
    expect(mail.html).toContain('FAHYBRID');
    expect(mail.html).toContain('#F06A2A');
    expect(mail.html).not.toContain('North Box');
    // No llama al resolver de piel: el aviso interno no es del club visualmente.
    expect(resolveClubEmailSkin).not.toHaveBeenCalled();
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(1));
  });

  test('sin correo del club no se envía la notificación interna', async () => {
    resolveClubNotifyEmail.mockResolvedValue(null);
    const result = await sendLeadNotification(
      {
        email: 'lead@example.com',
        nombre: 'Marta',
        telefono: '600000000',
      } as unknown as Parameters<typeof sendLeadNotification>[0],
      BigInt(1),
    );
    expect(result.sent).toBe(false);
    expect(result.skipped_reason).toBe('no_inbox');
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('el aviso interno de una reserva no toca la piel del club, aunque exista', async () => {
    resolveClubEmailSkin.mockResolvedValue(CLUB_SKIN);
    await sendBookingInternal({ ...APPT, coach_id: BigInt(1) });
    const mail = sent[0]!;
    expect(mail.to).toBe(CLUB_INBOX);
    expect(mail.to).not.toBe('hello@fahybrid.com');
    expect(mail.html).toContain('FAHYBRID');
    expect(mail.html).not.toContain('North Box');
    expect(resolveClubEmailSkin).not.toHaveBeenCalled();
    expect(resolveClubNotifyEmail).toHaveBeenCalledWith(BigInt(1));
  });
});
