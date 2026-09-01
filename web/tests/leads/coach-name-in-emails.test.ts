/**
 * Los correos y los `.ics` que salen fuera nombran al coach de ESE lead — y se leen
 * bien cuando no hay nombre.
 *
 * Por qué existe este test: un push mal escrito se olvida; un correo no se retira del
 * buzón y un `.ics` se queda en el calendario del atleta para siempre. Las plantillas
 * llevaban «Pablo» literal en 46 sitios, así que el lead de cualquier otro entrenador
 * leía el nombre de un desconocido.
 *
 * Aquí se fija el contrato en los TRES casos que da la base — nombre de verdad, NULL y
 * cadena de solo espacios — y sobre el texto REALMENTE renderizado (el payload que se le
 * pasa a Resend), no sobre una descripción de lo que debería salir.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface SentEmail {
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

vi.mock('@/lib/coach/club-notify', () => ({
  resolveClubNotifyEmail: vi.fn(async () => null),
}));

// El remitente está guardado: sin API key las funciones ni renderizan. Le damos una.
process.env.RESEND_API_KEY = 'test-key';

const { sendAppointmentAccepted } = await import('@/lib/citas/email');
const { sendLeadConfirmation } = await import('@/lib/leads/email');
const { sendWaitlistReleasedEmail } = await import('@/lib/leads/waitlist-email');
const { sendNurtureEmail } = await import('@/lib/leads/nurture-email');

/** El .ics viaja en base64; lo devolvemos en claro para poder mirarlo. */
function decodedIcs(mail: SentEmail): string {
  const att = mail.attachments?.[0];
  return att ? Buffer.from(att.content, 'base64').toString('utf8') : '';
}

/** Todo lo que el destinatario puede llegar a ver de este envío. */
function everything(mail: SentEmail): string {
  return [mail.subject, mail.text, mail.html, decodedIcs(mail)].join('\n');
}

/**
 * Solo las partes en texto plano (asunto + cuerpo). Es donde un nombre que falta deja un
 * hueco VISIBLE; el HTML se sangra a propósito y el navegador colapsa esos espacios, así
 * que buscar «dos espacios» ahí daría un falso positivo por la propia plantilla.
 */
function plainParts(mail: SentEmail): string {
  return [mail.subject, mail.text].join('\n');
}

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

const LEAD_INPUT = {
  email: 'lead@example.com',
  nombre: 'Marta Ruiz',
  telefono: '600000000',
} as unknown as Parameters<typeof sendLeadConfirmation>[0];

beforeEach(() => {
  sent.length = 0;
});

// Los tres huecos reales de la base. `'   '` no es paranoia: `full_name` es texto libre
// que teclea el coach en su perfil.
const SIN_NOMBRE: (string | null)[] = [null, '', '   '];

describe('el coach que nombra un correo de cita', () => {
  test('con nombre real: aparece en el asunto, en el cuerpo y en el .ics', async () => {
    await sendAppointmentAccepted({ ...APPT, coach_name: 'Pablo Amigo' });
    const mail = sent[0]!;

    expect(mail.subject).toBe('Cita confirmada con Pablo Amigo · FAHYBRID');
    expect(mail.text).toContain('Tu videollamada con Pablo Amigo está confirmada');
    expect(decodedIcs(mail)).toContain('Videollamada con Pablo Amigo · FAHYBRID');
  });

  test('otro coach → otro nombre; ninguno lleva uno fijo', async () => {
    await sendAppointmentAccepted({ ...APPT, coach_name: 'Ana Ruiz' });
    expect(sent[0]!.subject).toBe('Cita confirmada con Ana Ruiz · FAHYBRID');
    expect(everything(sent[0]!)).not.toMatch(/pablo/i);
  });

  test.each(SIN_NOMBRE)(
    'sin nombre (%j): la frase se cierra sola, sin hueco ni doble espacio',
    async (name) => {
      await sendAppointmentAccepted({ ...APPT, coach_name: name });
      const mail = sent[0]!;

      // La coletilla «con X» desaparece entera en vez de dejar un «con ».
      expect(mail.subject).toBe('Cita confirmada · FAHYBRID');
      expect(mail.text).toContain('Tu videollamada está confirmada');
      expect(decodedIcs(mail)).toContain('Videollamada · FAHYBRID');

      const all = plainParts(mail);
      expect(all).not.toMatch(/ con\s*[.·,\n]/); // « con .» / « con ·» colgando
      expect(all).not.toMatch(/[ \t]{2,}/); // doble espacio donde iba el nombre
      expect(all).not.toMatch(/undefined|null/);
    },
  );

  test('la sesión presencial sin dirección tampoco deja la frase coja', async () => {
    await sendAppointmentAccepted({ ...APPT, modality: 'presencial', coach_name: null });
    const mail = sent[0]!;
    // Sujeto neutro a principio de frase: nunca « te confirmará el sitio».
    expect(mail.text).toContain('Tu entrenador te confirmará el sitio');
    expect(mail.text).not.toMatch(/^\s*te confirmará/m);
    expect(everything(mail)).not.toMatch(/pablo/i);
  });
});

describe('el coach que firma un correo de lead', () => {
  test('con nombre real: la confirmación lo nombra', async () => {
    await sendLeadConfirmation(LEAD_INPUT, 'tok-1234567890', 'Pablo Amigo');
    expect(sent[0]!.text).toContain('Reserva tu videollamada con Pablo Amigo');
  });

  test.each(SIN_NOMBRE)('sin nombre (%j): «Reserva tu videollamada» a secas', async (name) => {
    await sendLeadConfirmation(LEAD_INPUT, 'tok-1234567890', name);
    const mail = sent[0]!;
    expect(mail.text).toContain('Reserva tu videollamada — 30 minutos');
    expect(plainParts(mail)).not.toMatch(/[ \t]{2,}/);
    expect(everything(mail)).not.toMatch(/pablo/i);
  });

  test('la firma cae al equipo, nunca a «Tu entrenador · FAHYBRID»', async () => {
    await sendWaitlistReleasedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: 'tok-1234567890',
      unsubscribe_token: 'unsub-1234567890',
      coach_name: null,
    });
    const mail = sent[0]!;
    expect(mail.text).toContain('— El equipo de FAHYBRID');
    expect(mail.text).not.toContain('— Tu entrenador · FAHYBRID');
    // Y el genérico en medio de frase va en minúscula: «en el grupo de tu entrenador».
    expect(mail.text).toContain('en el grupo de tu entrenador');
  });

  test('con nombre, la firma es del coach', async () => {
    await sendWaitlistReleasedEmail({
      email: 'lead@example.com',
      nombre: 'Marta',
      cita_token: 'tok-1234567890',
      unsubscribe_token: 'unsub-1234567890',
      coach_name: 'Ana Ruiz',
    });
    expect(sent[0]!.text).toContain('— Ana Ruiz · FAHYBRID');
    expect(sent[0]!.text).toContain('en el grupo de Ana Ruiz');
  });

  test.each(SIN_NOMBRE)(
    'el nurture sin nombre (%j) no deja «con » colgando en el asunto',
    async (name) => {
      await sendNurtureEmail({
        touch_type: 'nuevo_t1',
        email: 'lead@example.com',
        nombre: 'Marta',
        cita_token: 'tok-1234567890',
        unsubscribe_token: 'unsub-1234567890',
        coach_name: name,
      });
      const mail = sent[0]!;
      expect(mail.subject).toBe('Reserva tu llamada');
      expect(plainParts(mail)).not.toMatch(/[ \t]{2,}/);
      expect(everything(mail)).not.toMatch(/pablo/i);
    },
  );
});
