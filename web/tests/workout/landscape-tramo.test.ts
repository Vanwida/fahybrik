import { describe, expect, it } from 'vitest';
import { LANDSCAPE_TRAMO_PT, tramoPt } from '@fahybrid/shared/domain/landscape-tramo';

describe('tramoPt — réplica grande del mismo dato', () => {
  it('en horizontal el sujeto y la identidad crecen', () => {
    expect(LANDSCAPE_TRAMO_PT.subject).toBe(112);
    expect(LANDSCAPE_TRAMO_PT.identity).toBe(22);
    expect(LANDSCAPE_TRAMO_PT.title).toBe(28);
    expect(tramoPt(true, 'subject')).toBeGreaterThan(tramoPt(false, 'subject'));
    expect(tramoPt(true, 'identity')).toBeGreaterThan(tramoPt(false, 'identity'));
    expect(tramoPt(true, 'title')).toBeGreaterThan(tramoPt(false, 'title'));
  });
});
