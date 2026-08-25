// Cómo se LEE el tramo en horizontal: el mismo dato que en vertical, más grande.

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
