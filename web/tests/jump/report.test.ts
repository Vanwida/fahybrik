import { describe, expect, test } from 'vitest';
import { buildCmjReport, composeLectura, pctPoints } from '../../../shared/domain/test-report/cmj';
import { formatJumpHeightCm } from '../../../shared/domain/jump/method';

describe('informe CMJ — caso real ago-2026', () => {
  const report = buildCmjReport({
    title: 'Perfil de salto',
    date_label: '13 ago',
    unloaded_cm: 47.33,
    loaded_cm: 39.38,
    load_kg: 15,
    body_mass_kg: 76,
    attempts: [
      { kind: 'cmj', height_cm: 46.1, kept: false, quality: 'ok' },
      { kind: 'cmj', height_cm: 47.33, kept: true, quality: 'ok' },
      { kind: 'loaded_cmj', height_cm: 39.38, kept: true, quality: 'ok' },
    ],
  });

  test('enseña 47 cm, no 47,33', () => {
    expect(formatJumpHeightCm(report.unloaded_cm)).toBe('47 cm');
    expect(formatJumpHeightCm(report.loaded_cm!)).toBe('39 cm');
  });

  test('explosivo: nivel 5 · muy alta · la banda >45 está activa', () => {
    expect(report.height_level).toBe(5);
    expect(report.height_label).toBe('Muy alta');
    const active = report.height_scale.find((b) => b.active);
    expect(active?.level).toBe(5);
    expect(active?.range_label).toBe('> 45 cm');
  });

  test('respuesta a la carga y LRI 0,85 · correcta · nivel 3', () => {
    expect(report.drop_abs_cm).toBeCloseTo(7.95, 2);
    expect(pctPoints(report.drop_rel!)).toBe(17);
    expect(pctPoints(report.load_rel!)).toBe(20);
    expect(report.lri).toBeCloseTo(0.85, 2);
    expect(report.lri_level).toBe(3);
    expect(report.lri_label).toBe('Correcta');
    expect(report.lri_scale.find((b) => b.active)?.level).toBe(3);
  });

  test('la lectura se compone, no se inventa', () => {
    expect(report.lectura).toBe(
      'Capacidad explosiva muy alta. Al añadir una carga equivalente al 20 % de su peso pierde un 17 % de altura. Respuesta a la carga: correcta.',
    );
  });

  test('snapshot e intentos viajan con la ocurrencia', () => {
    expect(report.load_kg).toBe(15);
    expect(report.body_mass_kg).toBe(76);
    expect(report.attempts.filter((a) => a.kept)).toHaveLength(2);
  });

  test('sin serie cargada no se inventa LRI ni lectura de carga', () => {
    const solo = buildCmjReport({ title: 'Perfil de salto', unloaded_cm: 47.33 });
    expect(solo.lri).toBeNull();
    expect(solo.loaded_cm).toBeNull();
    expect(solo.lectura).toBe('Capacidad explosiva muy alta.');
    expect(composeLectura({ height_label: 'Media', drop_rel: null, load_rel: null, lri_label: null })).toBe(
      'Capacidad explosiva media.',
    );
  });
});
