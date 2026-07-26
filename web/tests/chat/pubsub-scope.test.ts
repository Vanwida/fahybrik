// El reparto del canal en vivo: a quién le toca cada mensaje.
//
// Esto es la puerta de privacidad del chat en tiempo real. Un fallo aquí no da un
// error: entrega la conversación de un atleta al stream de otra persona. Por eso
// el filtro es una función pura y se prueba sola, sin base de datos ni conexión.

import { describe, expect, it } from 'vitest';
import { parseNotifyPayload, payloadMatchesScope } from '@/lib/chat/pubsub';

const payload = { t: '10', m: '99', c: '7', a: '42' };

describe('parseNotifyPayload', () => {
  it('acepta un aviso con los cuatro ids', () => {
    expect(parseNotifyPayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('rechaza lo que no es JSON', () => {
    expect(parseNotifyPayload('no soy json')).toBeNull();
  });

  it('rechaza un aviso al que le falta un id', () => {
    expect(parseNotifyPayload(JSON.stringify({ t: '10', m: '99', c: '7' }))).toBeNull();
  });

  it('rechaza ids que no son texto', () => {
    // Los ids viajan como texto a propósito: un bigint de Postgres no cabe en un
    // number de JavaScript sin perder precisión.
    expect(parseNotifyPayload(JSON.stringify({ t: 10, m: 99, c: 7, a: 42 }))).toBeNull();
  });

  it('rechaza un JSON que no es un objeto', () => {
    expect(parseNotifyPayload('"hola"')).toBeNull();
    expect(parseNotifyPayload('null')).toBeNull();
  });
});

describe('payloadMatchesScope', () => {
  it('le llega al coach dueño del hilo', () => {
    expect(payloadMatchesScope(payload, { role: 'coach', id: BigInt(7) })).toBe(true);
  });

  it('le llega al atleta del hilo', () => {
    expect(payloadMatchesScope(payload, { role: 'athlete', id: BigInt(42) })).toBe(true);
  });

  it('NO le llega a otro coach', () => {
    expect(payloadMatchesScope(payload, { role: 'coach', id: BigInt(8) })).toBe(false);
  });

  it('NO le llega a otro atleta', () => {
    expect(payloadMatchesScope(payload, { role: 'athlete', id: BigInt(43) })).toBe(false);
  });

  it('no confunde el id del coach con el del atleta', () => {
    // Coach 42 y atleta 42 son entidades distintas con el mismo número. Comparar
    // contra el campo equivocado entregaría la conversación a quien no es.
    expect(payloadMatchesScope(payload, { role: 'coach', id: BigInt(42) })).toBe(false);
    expect(payloadMatchesScope(payload, { role: 'athlete', id: BigInt(7) })).toBe(false);
  });
});
