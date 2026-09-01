/**
 * `resolveClubEmailSkin` — la piel de un correo para el coach de `coach_id`, la
 * pieza única que reutilizan leads/alta-email/email-code/citas/session-summary en
 * vez de repetir la derivación en cada plantilla.
 *
 * El contrato que importa: un coach SIN piel puesta produce EXACTAMENTE lo que
 * las plantillas pintaban a mano hasta ahora (naranja fijo, wordmark "FAHYBRID"),
 * y un coach CON piel produce su acento — resuelto para las dos superficies de
 * correo (fondo blanco / fondo casi negro) vía el mismo `buildClubAccent` que ya
 * usa el panel y la app.
 */
import { describe, expect, test } from 'vitest';
import { resolveClubEmailSkin } from '@/lib/coach/club-skin';
import { buildClubAccent } from '@fahybrid/shared/domain/coach/club-accent';
import { createFakeSql } from '../utils/fake-sql';

interface Row {
  club_skin_name: string | null;
  club_logo_url: string | null;
  club_accent_hex: string | null;
}

function sqlReturning(row: Row | undefined) {
  return createFakeSql(() => (row ? [row] : []));
}

const EMPTY_ROW: Row = { club_skin_name: null, club_logo_url: null, club_accent_hex: null };

describe('resolveClubEmailSkin — sin piel = exactamente lo de hoy', () => {
  test('coach_id nulo: ni siquiera consulta la base', async () => {
    let called = false;
    const sql = createFakeSql(() => {
      called = true;
      return [];
    });
    const skin = await resolveClubEmailSkin(null, sql);
    expect(called).toBe(false);
    expect(skin.wordmark).toBe('FAHYBRID');
    expect(skin.light).toEqual({ fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' });
    expect(skin.dark).toEqual({ fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' });
  });

  test('coach_id undefined: mismo resultado que nulo', async () => {
    const skin = await resolveClubEmailSkin(undefined, sqlReturning(EMPTY_ROW));
    expect(skin.wordmark).toBe('FAHYBRID');
    expect(skin.light.fill).toBe('#F06A2A');
  });

  test('coach existente que nunca tocó su piel: la fila está vacía → naranja fijo', async () => {
    const skin = await resolveClubEmailSkin(BigInt(7), sqlReturning(EMPTY_ROW));
    expect(skin.wordmark).toBe('FAHYBRID');
    expect(skin.light).toEqual({ fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' });
    expect(skin.dark).toEqual({ fill: '#F06A2A', on_fill: '#0a0a0a', text: '#F06A2A' });
  });

  test('coach sin fila en coaches (id huérfano): también cae al binario', async () => {
    const skin = await resolveClubEmailSkin(BigInt(999), sqlReturning(undefined));
    expect(skin.wordmark).toBe('FAHYBRID');
    expect(skin.light.fill).toBe('#F06A2A');
  });
});

describe('resolveClubEmailSkin — con piel produce la suya', () => {
  test('nombre de club → wordmark; acento → el mismo que buildClubAccent', async () => {
    const row: Row = { club_skin_name: 'North Box', club_logo_url: null, club_accent_hex: '#2d6cdf' };
    const skin = await resolveClubEmailSkin(BigInt(1), sqlReturning(row));
    const family = buildClubAccent('#2d6cdf')!;

    expect(skin.wordmark).toBe('North Box');
    expect(skin.light).toEqual({
      fill: family.light.fill,
      on_fill: family.light.on_fill,
      text: family.light.text,
    });
    expect(skin.dark).toEqual({
      fill: family.dark.fill,
      on_fill: family.dark.on_fill,
      text: family.dark.text,
    });
    // Un color distinto al naranja fijo no puede colarse igual por casualidad.
    expect(skin.light.fill).not.toBe('#F06A2A');
  });

  test('solo nombre, sin color: wordmark propio, acento sigue siendo el del binario', async () => {
    const row: Row = { club_skin_name: 'Iron Yard', club_logo_url: null, club_accent_hex: null };
    const skin = await resolveClubEmailSkin(BigInt(2), sqlReturning(row));
    expect(skin.wordmark).toBe('Iron Yard');
    expect(skin.light.fill).toBe('#F06A2A');
  });

  test('el acento del naranja de marca pasado como piel propia SÍ pasa por la matemática de contraste', async () => {
    // Comprueba que no hay un atajo que confunda "es el mismo hex" con "es el
    // valor por defecto": si un coach ELIGE ese naranja como SU acento, el
    // resultado tiene que ser el de `buildClubAccent`, no el literal fijo — y
    // ambos difieren (el press del token de marca es #D85A20; el derivado no).
    const row: Row = { club_skin_name: null, club_logo_url: null, club_accent_hex: '#f06a2a' };
    const skin = await resolveClubEmailSkin(BigInt(3), sqlReturning(row));
    const family = buildClubAccent('#f06a2a')!;
    expect(skin.light.fill).toBe(family.light.fill);
    expect(skin.wordmark).toBe('FAHYBRID'); // sin nombre puesto
  });
});
