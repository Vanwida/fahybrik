// FH-80: Descanso en un día CON sesiones vive ENCIMA de las SessionCard
// (Links a ?dia=). 15ab1d0b lo colgó bajo el footer — fuera del hit target.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { dayRestControlSlot } from '@/components/v2/planes/semana-model';

const boardSrc = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../components/v2/planes/SemanaBoard.tsx'),
  'utf8',
);

describe('dayRestControlSlot', () => {
  test('día con sesiones → before-sessions (nunca bajo los Links)', () => {
    expect(dayRestControlSlot({ session_count: 1, is_rest: false })).toBe('before-sessions');
    expect(dayRestControlSlot({ session_count: 3, is_rest: false })).toBe('before-sessions');
  });

  test('día de descanso declarado, sin entreno → rest-link', () => {
    expect(dayRestControlSlot({ session_count: 0, is_rest: true })).toBe('rest-link');
  });

  test('día vacío → empty-card (Entreno · Descanso · Copiar)', () => {
    expect(dayRestControlSlot({ session_count: 0, is_rest: false })).toBe('empty-card');
  });

  test('DayColumn pinta DayRestButton antes de SessionCard (no bajo los Links)', () => {
    const content = boardSrc.indexOf('{hasContent ? (');
    const restBtn = boardSrc.indexOf('<DayRestButton', content);
    const sessionCard = boardSrc.indexOf('<SessionCard', content);
    expect(content).toBeGreaterThan(-1);
    expect(restBtn).toBeGreaterThan(content);
    expect(sessionCard).toBeGreaterThan(restBtn);
  });
});
