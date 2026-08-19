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
  CANVAS_DARK,
  type AccentRole,
} from '@fahybrid/shared/domain/coach/club-accent';

const AA_TEXT = 4.5;
/** El relleno conserva el color del coach salvo que se confunda con el fondo. */
const FILL_MIN = 2;

function ratio(a: string, b: string): number {
  return contrastRatio(hexToRgb(a)!, hexToRgb(b)!);
}

/** Lo que tiene que cumplir CUALQUIER color elegido, en cualquier superficie. */
function assertLegible(role: AccentRole, canvas: string, label: string) {
  expect(ratio(role.fill, canvas), `${label}: el relleno se confunde con el fondo`).toBeGreaterThanOrEqual(FILL_MIN - 0.01);
  expect(ratio(role.on_fill, role.fill), `${label}: el texto encima del relleno no se lee`).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
  expect(ratio(role.text, canvas), `${label}: el acento como texto no se lee`).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
}

const CASOS: ReadonlyArray<{ hex: string; nombre: string }> = [
  { hex: '#f06a2a', nombre: 'naranja de la marca actual' },
  { hex: '#0a2540', nombre: 'azul marino muy oscuro' },
  { hex: '#2e86ff', nombre: 'azul vivo' },
  { hex: '#ffe600', nombre: 'amarillo flúor' },
  { hex: '#2f7050', nombre: 'verde (choca con «hecho»)' },
  { hex: '#b0402f', nombre: 'rojo (choca con «fallado»)' },
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
      assertLegible(fam!.light, CANVAS_LIGHT, `${nombre} · panel claro`);
      assertLegible(fam!.dark, CANVAS_DARK, `${nombre} · app oscura`);
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
    // Como texto sobre el perla no llega a 4,5:1, así que se oscurece y se dice.
    expect(fam.light.text).not.toBe('#f06a2a');
    expect(fam.adjustments.some((a) => a.surface === 'claro' && a.role === 'text')).toBe(true);
  });

  test('un azul marino se aclara en la app y se explica', () => {
    const fam = buildClubAccent('#0a2540')!;
    const ajuste = fam.adjustments.find((a) => a.surface === 'oscuro' && a.role === 'fill');
    expect(ajuste).toBeDefined();
    expect(ajuste!.reason).toContain('app');
  });

  test('un color pegado a un semántico avisa, pero no se bloquea', () => {
    const verde = buildClubAccent('#2f7050')!;
    expect(verde.collision?.meaning).toBe('hecho');
    expect(verde.light.fill).toBeTruthy();
    const naranja = buildClubAccent('#f06a2a')!;
    expect(naranja.collision).toBeNull();
  });

  test('un color que ya cumple en todo no genera ningún aviso', () => {
    const fam = buildClubAccent('#2e86ff')!;
    const enPanel = fam.adjustments.filter((a) => a.surface === 'claro' && a.role === 'fill');
    expect(enPanel).toHaveLength(0);
  });
});
