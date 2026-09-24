import { describe, expect, it } from 'vitest';
import { compactDose } from '@/lib/dashboard/programming/cell-summary';

describe('compactDose', () => {
  it('conserva el descanso, abreviado', () => {
    expect(compactDose("5×5 @ 75% RM · descanso 2'")).toBe("5×5 @ 75% RM · r2'");
    expect(compactDose("16×500m @ Z4 · r1'")).toBe("16×500m @ Z4 · r1'");
  });
  it('lo demás sigue fuera de la celda', () => {
    expect(compactDose('5×5 @ 75% RM · tempo 3-1-1 · nota del coach')).toBe('5×5 @ 75% RM');
    expect(compactDose('AMRAP 12')).toBe('AMRAP 12');
  });
});
