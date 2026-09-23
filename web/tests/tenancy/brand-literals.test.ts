// Ningún club habla con el nombre de otro. Lo que ve un atleta, un lead o un
// coach de OTRO club sale de la piel de SU club (cuando habla el club) o de la
// marca de este binario, UNA constante (`BRAND_WORDMARK`, cuando habla la
// plataforma) — nunca de un literal escrito a mano, ni de un nombre propio.
//
// Dos capas: las reglas puras (título del evento, producto del cobro, UID del
// .ics, marca del correo de pareja) y un barrido del texto de ejecución de los
// ficheros que ya se limpiaron, para que el literal no vuelva.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND_WORDMARK } from '@fahybrid/shared/domain/coach/club-skin';
import { meetingSummary } from '@/lib/citas/meeting';
import { altaProductName, ALTA_PRODUCT_NAME } from '@/lib/stripe/checkout';
import { citaIcsUid, CITA_ICS_FILENAME } from '@/lib/citas/email';
import { resolvePartnerEmailBrand } from '@/lib/partner/email';
import { NO_CONNECTOR_MESSAGE } from '@/lib/mcp/runtime';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('habla el club: su nombre', () => {
  it('el evento de calendario lleva el nombre del club de la cita', () => {
    expect(meetingSummary('video', 'Club Norte', 'Ana')).toBe('Videollamada Club Norte · Ana');
    expect(meetingSummary('presencial', 'Club Norte', 'Ana')).toBe('Sesión presencial Club Norte · Ana');
    expect(meetingSummary('review', 'Club Norte', 'Ana')).toBe('Revisión Club Norte · Ana');
  });

  it('el producto del cobro lleva el nombre del club que cobra', () => {
    expect(altaProductName('Club Norte')).toBe('Club Norte · Entrenamiento personalizado');
    // Sin nombre, la marca del binario — nunca un hueco.
    expect(altaProductName('  ')).toBe(ALTA_PRODUCT_NAME);
    expect(ALTA_PRODUCT_NAME).toBe(`${BRAND_WORDMARK} · Entrenamiento personalizado`);
  });

  it('el correo de pareja sin club conocido habla con la marca del binario', async () => {
    const brand = await resolvePartnerEmailBrand(null);
    expect(brand.club).toBe(BRAND_WORDMARK);
    expect(brand.app).toBe(BRAND_WORDMARK);
  });
});

describe('habla la plataforma: una constante', () => {
  it('el .ics: UID con el host que lo emite, adjunto sin marca', () => {
    expect(citaIcsUid('42', 'https://app.ejemplo.test/es')).toBe('appt-42@app.ejemplo.test');
    expect(citaIcsUid('42', 'no es una url')).toBe('appt-42@localhost');
    expect(CITA_ICS_FILENAME).toBe('cita.ics');
  });

  it('el mensaje del conector nombra la plataforma desde la constante', () => {
    expect(NO_CONNECTOR_MESSAGE.endsWith(`desde ${BRAND_WORDMARK}.`)).toBe(true);
  });
});

/** El texto que se ejecuta: sin comentarios de bloque ni de línea. */
function runtimeText(rel: string): string {
  const src = readFileSync(resolve(WEB, rel), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const CLEAN_FILES = [
  'lib/push/apns.ts',
  'lib/citas/meeting.ts',
  'lib/citas/email.ts',
  'lib/citas/reminder-email.ts',
  'lib/leads/email.ts',
  'lib/leads/email-shell.ts',
  'lib/partner/email.ts',
  'lib/stripe/checkout.ts',
  'lib/mcp/runtime.ts',
  'lib/mcp/tools.ts',
  'lib/dashboard/constants/week-day-part-presets.ts',
  'app/api/webhooks/clerk/route.ts',
  'app/api/coach/events/route.ts',
];

describe('sin literales de marca ni nombres propios en el texto de ejecución', () => {
  it.each(CLEAN_FILES)('%s', (rel) => {
    const text = runtimeText(rel);
    expect(text).not.toMatch(/FAHYBRID|Fabrik|Pablo/);
    expect(text).not.toMatch(/@fahybrid\.com|cita-fahybrid/);
  });
});
