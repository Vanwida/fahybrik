// La familia de acento del club, rota contra los colores que un coach elige de
// verdad: el naranja de la marca, azules marinos, amarillos, colores que chocan
// con los semánticos, blancos y negros. Cada caso comprueba lo mismo: que
// NINGÚN papel del acento queda por debajo del mínimo legible en su superficie.

import { describe, expect, test } from 'vitest';
import {
  buildClubAccent,
  contrastRatio,
  hexToRgb,
  CANVAS_LIGHT,
  SURFACE_LIGHT,
  CANVAS_DARK,
  PANEL_CANVAS_DARK,
  SURFACE_DARK,
  deltaE,
  type AccentRole,
} from '@fahybrid/shared/domain/coach/club-accent';

const AA_TEXT = 4.5;
/** El relleno conserva el color del coach salvo que se confunda con el fondo. */
const FILL_MIN = 2;

function ratio(a: string, b: string): number {
  return contrastRatio(hexToRgb(a)!, hexToRgb(b)!);
}

/** Lo que tiene que cumplir CUALQUIER color elegido, sobre cada fondo de su superficie. */
function assertLegible(role: AccentRole, backgrounds: readonly string[], label: string) {
  expect(ratio(role.on_fill, role.fill), `${label}: el texto encima del relleno no se lee`).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
  for (const bg of backgrounds) {
    expect(ratio(role.fill, bg), `${label} ${bg}: el relleno se confunde con el fondo`).toBeGreaterThanOrEqual(FILL_MIN - 0.01);
    expect(ratio(role.text, bg), `${label} ${bg}: el acento como texto no se lee`).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
  }
}

/** Lienzo + tarjeta del panel claro; lienzo de la app, del panel oscuro y su tarjeta. */
const CLARO = [CANVAS_LIGHT, SURFACE_LIGHT] as const;
const OSCURO = [CANVAS_DARK, PANEL_CANVAS_DARK, SURFACE_DARK] as const;

const CASOS: ReadonlyArray<{ hex: string; nombre: string }> = [
  { hex: '#f06a2a', nombre: 'naranja de la marca actual' },
  { hex: '#0a2540', nombre: 'azul marino muy oscuro' },
  { hex: '#2e86ff', nombre: 'azul vivo' },
  { hex: '#ffe600', nombre: 'amarillo flúor' },
  { hex: '#1d7447', nombre: 'verde (choca con «hecho»)' },
  { hex: '#bf3128', nombre: 'rojo (choca con «actuar ya»)' },
  { hex: '#8b877e', nombre: 'gris apagado' },
  { hex: '#ffffff', nombre: 'blanco puro' },
  { hex: '#000000', nombre: 'negro puro' },
  { hex: '#c9a7eb', nombre: 'lila pastel' },
];

describe('acento del club · legible siempre, en las dos superficies', () => {
  for (const { hex, nombre } of CASOS) {
    test(`${nombre} (${hex})`, () => {
      const fam = buildClubAccent(hex);
      expect(fam).not.toBeNull();
      assertLegible(fam!.light, CLARO, `${nombre} · panel claro`);
      assertLegible(fam!.dark, OSCURO, `${nombre} · oscuro (app y panel)`);
    });
  }
});

describe('acento del club · lo que se le dice al coach', () => {
  test('sin color elegido no se inventa ninguno', () => {
    expect(buildClubAccent(null)).toBeNull();
    expect(buildClubAccent('')).toBeNull();
    expect(buildClubAccent('rojo')).toBeNull();
  });

  test('el naranja de marca se conserva de relleno y se ajusta solo como texto', () => {
    const fam = buildClubAccent('#f06a2a')!;
    expect(fam.light.fill).toBe('#f06a2a');
    // Como texto sobre el lienzo claro no llega a 4,5:1, así que se oscurece y se dice.
    expect(fam.light.text).not.toBe('#f06a2a');
    expect(fam.adjustments.some((a) => a.surface === 'claro' && a.role === 'text')).toBe(true);
  });

  test('un azul marino se aclara en la app y se explica', () => {
    const fam = buildClubAccent('#0a2540')!;
    const ajuste = fam.adjustments.find((a) => a.surface === 'oscuro' && a.role === 'fill');
    expect(ajuste).toBeDefined();
    expect(ajuste!.reason).toContain('app');
  });

  test('un color pegado a un tono de estado avisa, pero no se bloquea', () => {
    const verde = buildClubAccent('#2f7050')!;
    expect(verde.collision?.meaning).toBe('hecho');
    expect(verde.light.fill).toBeTruthy();
    expect(buildClubAccent('#c0392b')!.collision?.meaning).toBe('actuar ya');
    expect(buildClubAccent('#f2a33a')!.collision?.meaning).toBe('vigilar');
    expect(buildClubAccent('#5aa0ee')!.collision?.meaning).toBe('información');
  });

  test('el aviso de parecido es ΔE < 15 frente a los tonos de estado de los dos temas', () => {
    // El naranja de marca está lejos del ámbar y del rojo: no avisa.
    expect(buildClubAccent('#f06a2a')!.collision).toBeNull();
    // Un azul vivo tampoco se lee como «información».
    expect(buildClubAccent('#2e86ff')!.collision).toBeNull();
    // La métrica: idéntico = 0; blanco y negro, ~100.
    expect(deltaE(hexToRgb('#1d7447')!, hexToRgb('#1d7447')!)).toBe(0);
    expect(deltaE(hexToRgb('#ffffff')!, hexToRgb('#000000')!)).toBeGreaterThan(99);
  });

  test('un ajuste imperceptible se hace pero no se le cuenta al coach', () => {
    // #ff9447 se queda a 1,99:1 del lienzo claro: se mueve un par de pasos por
    // canal. Contárselo sonaría a alarma por un cambio que no puede ver.
    const fam = buildClubAccent('#ff9447')!;
    expect(fam.light.fill).not.toBe('#ff9447');
    expect(fam.adjustments.some((a) => a.surface === 'claro' && a.role === 'fill')).toBe(false);
    // Como texto sí cambia de verdad, y eso sí se dice.
    expect(fam.adjustments.some((a) => a.surface === 'claro' && a.role === 'text')).toBe(true);
  });

  test('un color que ya cumple en todo no genera ningún aviso', () => {
    const fam = buildClubAccent('#2e86ff')!;
    const enPanel = fam.adjustments.filter((a) => a.surface === 'claro' && a.role === 'fill');
    expect(enPanel).toHaveLength(0);
  });
});
