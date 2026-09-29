// La ventana del panel (shared/domain/analytics/ventana.ts): las seis claves,
// el día LOCAL del atleta, la anterior de igual longitud y los bordes UTC con
// cambio de hora dentro.

import { describe, expect, test } from 'vitest';
import {
  DIAS_POR_VENTANA,
  diasDelPeriodo,
  limitesUtc,
  resolverVentana,
  ventanaClaveAdmisible,
  VENTANAS_PANEL,
} from '@fahybrid/shared/domain/analytics/ventana';

describe('ventanaClaveAdmisible', () => {
  test('las seis valen; lo demás no', () => {
    for (const v of VENTANAS_PANEL) expect(ventanaClaveAdmisible(v)).toBe(v);
    expect(ventanaClaveAdmisible(' 4s ')).toBe('4s');
    expect(ventanaClaveAdmisible('30d')).toBeNull();
    expect(ventanaClaveAdmisible(null)).toBeNull();
  });
});

describe('resolverVentana', () => {
  test('4s: 28 días acabando hoy, la anterior pegada y del mismo tamaño', () => {
    const v = resolverVentana({ clave: '4s', hoy_local: '2026-04-10', primera_sesion_iso: '2026-01-01' });
    expect(v).toMatchObject({ clave: '4s', desde: '2026-03-14', hasta: '2026-04-10', dias: 28, cubre_todo: false });
    expect(v.anterior).toEqual({ desde: '2026-02-14', hasta: '2026-03-13', dias: 28 });
  });

  test.each(Object.entries(DIAS_POR_VENTANA))('%s son %s días', (clave, dias) => {
    const v = resolverVentana({ clave: clave as never, hoy_local: '2026-04-10', primera_sesion_iso: null });
    expect(v.dias).toBe(dias);
    expect(diasDelPeriodo(v)).toHaveLength(dias);
  });

  test('cubre_todo cuando la ventana alcanza la primera sesión', () => {
    expect(resolverVentana({ clave: '7d', hoy_local: '2026-04-10', primera_sesion_iso: '2026-04-05' }).cubre_todo).toBe(true);
    expect(resolverVentana({ clave: '7d', hoy_local: '2026-04-10', primera_sesion_iso: '2026-04-04' }).cubre_todo).toBe(true);
    expect(resolverVentana({ clave: '7d', hoy_local: '2026-04-10', primera_sesion_iso: '2026-04-03' }).cubre_todo).toBe(false);
    expect(resolverVentana({ clave: '7d', hoy_local: '2026-04-10', primera_sesion_iso: null }).cubre_todo).toBe(false);
  });

  test('todo: desde la primera sesión, sin anterior; sin sesiones, solo hoy', () => {
    const v = resolverVentana({ clave: 'todo', hoy_local: '2026-04-10', primera_sesion_iso: '2026-01-01' });
    expect(v).toMatchObject({ desde: '2026-01-01', hasta: '2026-04-10', dias: 100, anterior: null, cubre_todo: true });
    const vacio = resolverVentana({ clave: 'todo', hoy_local: '2026-04-10', primera_sesion_iso: null });
    expect(vacio).toMatchObject({ desde: '2026-04-10', hasta: '2026-04-10', dias: 1, anterior: null });
  });
});

describe('limitesUtc — el día local, con cambio de hora dentro', () => {
  test('Europe/Madrid, del 14 de marzo al 10 de abril de 2026: entra en CET y sale en CEST', () => {
    const v = resolverVentana({ clave: '4s', hoy_local: '2026-04-10', primera_sesion_iso: null });
    const l = limitesUtc(v, 'Europe/Madrid');
    expect(l.desde.toISOString()).toBe('2026-03-13T23:00:00.000Z');
    expect(l.hasta_excl.toISOString()).toBe('2026-04-10T22:00:00.000Z');
    // 28 días locales, aunque uno de ellos durase 23 horas.
    expect(diasDelPeriodo(v)).toHaveLength(28);
    expect((l.hasta_excl.getTime() - l.desde.getTime()) / 3_600_000).toBe(28 * 24 - 1);
  });

  test('America/Mexico_City no cambia de hora: 24 h exactas por día', () => {
    const v = resolverVentana({ clave: '7d', hoy_local: '2026-04-10', primera_sesion_iso: null });
    const l = limitesUtc(v, 'America/Mexico_City');
    expect((l.hasta_excl.getTime() - l.desde.getTime()) / 3_600_000).toBe(7 * 24);
  });
});
