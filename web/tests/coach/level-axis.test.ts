// El eje de clasificación es del coach (HARD RULE Nº0): el nombre de un grupo sin
// nombre propio se dice con SU eje, nunca con un «Nivel» escrito a mano.

import { describe, expect, it } from 'vitest';
import { effectiveLevelAxisLabel, groupRuleName } from '@fahybrid/shared/domain/coach/level-axis';

describe('groupRuleName', () => {
  it('sin eje propio → «Nivel»', () => {
    expect(groupRuleName({ level_name: 'N3', days_per_week: 5 })).toBe('Nivel N3 · 5 días');
  });
  it('con el eje del coach', () => {
    expect(groupRuleName({ axis_label: 'Objetivo', level_name: 'Sub-60', days_per_week: 1 })).toBe('Objetivo Sub-60 · 1 día');
  });
  it('solo días, o nada', () => {
    expect(groupRuleName({ level_name: null, days_per_week: 4 })).toBe('4 días');
    expect(groupRuleName({ level_name: null, days_per_week: null })).toBeNull();
  });
  it('el vacío es el defecto', () => {
    expect(effectiveLevelAxisLabel('  ')).toBe('Nivel');
  });
});
