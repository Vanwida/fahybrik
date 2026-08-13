import { describe, expect, test } from 'vitest';
import {
  DEFAULT_JUMP_METHOD,
  formatJumpHeightCm,
  formatLri,
  heightLevel,
  loadResponse,
  lriLevel,
} from '../../../shared/domain/jump/method';
import { buildJumpBrief, loadLabel } from '../../../shared/domain/jump/brief';

describe('respuesta a la carga', () => {
  test('informe ago-2026', () => {
    const r = loadResponse(47.33, 39.38, 15, 76);
    expect(r).not.toBeNull();
    expect(r!.drop_abs_cm).toBeCloseTo(7.95, 2);
    expect(r!.drop_rel).toBeCloseTo(0.168, 3);
    expect(r!.load_rel).toBeCloseTo(0.1974, 3);
    expect(r!.lri).toBeCloseTo(0.85, 2);
    expect(heightLevel(47.33, DEFAULT_JUMP_METHOD)).toBe(5);
    expect(lriLevel(r!.lri, DEFAULT_JUMP_METHOD)).toBe(3);
  });

  test('sin peso o sin carga no hay LRI', () => {
    expect(loadResponse(47, 39, 15, 0)).toBeNull();
    expect(loadResponse(47, 39, 0, 76)).toBeNull();
    expect(loadResponse(0, 39, 15, 76)).toBeNull();
  });

  test('cortes de altura del defecto', () => {
    expect(heightLevel(29.9, DEFAULT_JUMP_METHOD)).toBe(1);
    expect(heightLevel(30, DEFAULT_JUMP_METHOD)).toBe(2);
    expect(heightLevel(45, DEFAULT_JUMP_METHOD)).toBe(4);
    expect(heightLevel(45.1, DEFAULT_JUMP_METHOD)).toBe(5);
  });

  test('la UI no enseña dos decimales como verdad', () => {
    expect(formatJumpHeightCm(47.33)).toBe('47 cm');
    expect(formatLri(0.851)).toBe('0,85');
  });
});

describe('briefing — el atleta lo ve antes de grabar', () => {
  test('con carga pide trípode y los kilos, y cuenta la secuencia entera', () => {
    const brief = buildJumpBrief({
      method: DEFAULT_JUMP_METHOD,
      load: { kind: 'kg', kg: 15 },
      includeLoaded: true,
      bodyMassKg: 76,
    });
    expect(brief.needs.map((n) => n.id)).toEqual(['tripod', 'space', 'load']);
    expect(brief.needs.find((n) => n.id === 'load')?.title).toMatch(/15 kg/);
    expect(brief.sequence).toHaveLength(3);
    expect(brief.sequence[0]!.title).toMatch(/3 saltos sin carga/);
    expect(brief.sequence[1]!.title).toMatch(/15 kg/);
    expect(brief.day_card).toMatch(/trípode/i);
    expect(brief.day_card).toMatch(/15 kg/);
    expect(brief.jump_cues.some((c) => /intención/i.test(c))).toBe(true);
    expect(brief.phone.some((c) => /fijo|trípode|mano/i.test(c))).toBe(true);
  });

  test('sin peso avisa antes de la serie cargada', () => {
    const brief = buildJumpBrief({
      method: DEFAULT_JUMP_METHOD,
      load: { kind: 'kg', kg: 15 },
      includeLoaded: true,
      bodyMassKg: null,
    });
    expect(brief.needs.map((n) => n.id)).toContain('body_mass');
  });

  test('solo CMJ: no pide barra', () => {
    const brief = buildJumpBrief({
      method: DEFAULT_JUMP_METHOD,
      load: { kind: 'none' },
      includeLoaded: false,
      bodyMassKg: 76,
    });
    expect(brief.needs.map((n) => n.id)).toEqual(['tripod', 'space']);
    expect(brief.sequence).toHaveLength(2);
    expect(brief.day_card).not.toMatch(/15 kg/);
  });

  test('carga en % del peso se traduce a kilos si hay peso', () => {
    expect(loadLabel({ kind: 'pct_bw', pct: 20 }, 76)).toBe('15 kg (20 % de tu peso)');
  });
});
