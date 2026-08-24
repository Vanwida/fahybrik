import { describe, expect, it } from 'vitest';
import { programMonthScratchSchema } from '@fahybrid/shared/domain/coach/program-months';

describe('programMonthScratchSchema', () => {
  it('acepta crear sin level_id', () => {
    const parsed = programMonthScratchSchema.safeParse({
      name: 'Base aeróbica',
      week_count: 4,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.level_id).toBeUndefined();
    }
  });

  it('acepta level_id null explícito', () => {
    const parsed = programMonthScratchSchema.safeParse({
      name: 'Base aeróbica',
      level_id: null,
      week_count: 4,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.level_id).toBeNull();
    }
  });

  it('sigue aceptando level_id cuando viene de una celda de periodización', () => {
    const parsed = programMonthScratchSchema.safeParse({
      name: 'Bloque N2',
      level_id: 42,
      week_count: 3,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.level_id).toBe(42);
    }
  });
});
