import { describe, expect, test } from 'vitest';
import { looksLikeInstruction } from '@/lib/import/instruction-detect';

describe('looksLikeInstruction — #48 paste guard', () => {
  // The exact bug report: Alex typed an instruction into "Pegar texto".
  test('catches Alex verbatim instruction', () => {
    expect(
      looksLikeInstruction(
        'Créame 1 semana con doble sesión entre running e híbrido enfocado en hyrox',
      ),
    ).toBe(true);
  });

  test.each([
    'Genérame una semana de fuerza para HYROX',
    'hazme un microciclo de acumulación',
    'Móntame la semana de competición',
    'quiero una semana enfocada en resistencia',
    'necesito una semana de doble sesión',
    'Por favor prepárame un plan de tapering',
    'me creas una semana de series y fuerza',
    'Diséñame la semana con foco en ergómetros',
  ])('flags imperative request: "%s"', (text) => {
    expect(looksLikeInstruction(text)).toBe(true);
  });

  // A REAL pasted session must NEVER be flagged (a false positive blocks a paste).
  test('does not flag a real pasted session with a day header', () => {
    const session = [
      'Martes',
      'FUERZA — Tren inferior',
      '5 rounds Back Squat c/2\'30": 10/10/8/8/6 — 60/65/70/70/75% RM',
    ].join('\n');
    expect(looksLikeInstruction(session)).toBe(false);
  });

  test.each([
    "5x500m ski erg RPE8 45'' rest",
    "EMOM 16' específico HYROX",
    "Series pista: 2x1200 (1'45'')",
    "Run 1h15' zona 2",
    'Bench press 4x8 al 75%',
    'AMRAP 12: 10 wall balls / 15 cal row',
    'Lunes\nCarrera Z2 60min',
  ])('does not flag session-like content: "%s"', (text) => {
    expect(looksLikeInstruction(text)).toBe(false);
  });

  // A request that carries real numbers (a mini-spec) is treated as content, not
  // an instruction — the coach clearly pasted a session even if phrased oddly.
  test('does not flag an imperative that carries workout numbers', () => {
    expect(looksLikeInstruction("Quiero 5x500m a ritmo umbral con 90'' de descanso")).toBe(false);
  });

  test('empty / whitespace is not an instruction', () => {
    expect(looksLikeInstruction('')).toBe(false);
    expect(looksLikeInstruction('   \n  ')).toBe(false);
  });

  // Prose that is neither imperative nor a session is left alone (conservative).
  test('does not flag neutral prose without an imperative opener', () => {
    expect(looksLikeInstruction('Semana de adaptación, sin cargar mucho')).toBe(false);
  });
});
