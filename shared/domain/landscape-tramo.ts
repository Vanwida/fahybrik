// En horizontal manda el tramo de ahora. El mismo dato que en vertical, más
// grande. No se inventa un crono de sesión.

export type LandscapeLiveOwner = 'current-work' | 'decision-gate';

export function landscapeLiveOwner(input: {
  awaitingBlockStart: boolean;
  awaitingFinish: boolean;
  finished: boolean;
}): LandscapeLiveOwner {
  if (input.awaitingBlockStart || input.awaitingFinish || input.finished) {
    return 'decision-gate';
  }
  return 'current-work';
}

export const LANDSCAPE_TRAMO_PT = {
  subject: 112,
  identity: 22,
  title: 28,
} as const;

export function tramoPt(landscape: boolean, piece: keyof typeof LANDSCAPE_TRAMO_PT): number {
  if (!landscape) {
    if (piece === 'subject') return 64;
    if (piece === 'identity') return 12;
    return 17;
  }
  return LANDSCAPE_TRAMO_PT[piece];
}
