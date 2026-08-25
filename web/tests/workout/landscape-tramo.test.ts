import { describe, expect, it } from 'vitest';
import {
  LANDSCAPE_TRAMO_PT,
  landscapeLiveOwner,
  tramoPt,
} from '@fahybrid/shared/domain/landscape-tramo';

describe('landscapeLiveOwner — el tramo de ahora, no otro reloj', () => {
  it('en el vivo manda el trabajo de ahora', () => {
    expect(
      landscapeLiveOwner({
        awaitingBlockStart: false,
        awaitingFinish: false,
        finished: false,
      }),
    ).toBe('current-work');
  });

  it('una puerta de bloque o el final se quedan puerta', () => {
    expect(
      landscapeLiveOwner({
        awaitingBlockStart: true,
        awaitingFinish: false,
        finished: false,
      }),
    ).toBe('decision-gate');
    expect(
      landscapeLiveOwner({
        awaitingBlockStart: false,
        awaitingFinish: true,
        finished: false,
      }),
    ).toBe('decision-gate');
    expect(
      landscapeLiveOwner({
        awaitingBlockStart: false,
        awaitingFinish: false,
        finished: true,
      }),
    ).toBe('decision-gate');
  });

  it('no hay dueño crono-de-sesión', () => {
    const dueños = [
      landscapeLiveOwner({
        awaitingBlockStart: false,
        awaitingFinish: false,
        finished: false,
      }),
      landscapeLiveOwner({
        awaitingBlockStart: true,
        awaitingFinish: false,
        finished: false,
      }),
    ];
    expect(dueños.every((d) => d === 'current-work' || d === 'decision-gate')).toBe(true);
  });
});

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
