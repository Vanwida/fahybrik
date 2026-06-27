// Resolve a percentage-of-1RM prescription to an absolute load. The strength
// analog of the zone resolver: a "5×5 @ 80% RM" target × the athlete's current
// 1RM → the kg they actually lift. Rounded to the nearest kg (plates are coarse;
// sub-kg precision is noise on a barbell).

export function resolvePercentRmToKg(pct: number, oneRmKg: number): number {
  return Math.round((pct / 100) * oneRmKg);
}
