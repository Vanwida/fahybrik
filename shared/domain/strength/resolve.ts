// Resolve a percentage-of-1RM prescription to an absolute load. The strength
// analog of the zone resolver: a "5×5 @ 80% RM" target × the athlete's current
// 1RM → the kg they actually lift. Rounded to the nearest kg (plates are coarse;
// sub-kg precision is noise on a barbell).

export function resolvePercentRmToKg(pct: number, oneRmKg: number): number {
  return Math.round((pct / 100) * oneRmKg);
}

// A %RM target (single value OR a min/max band) resolved against the athlete's
// 1RM. `pct_label` / `kg_label` are ready-to-render ("65–80%" → "52–64 kg");
// `min_kg` / `max_kg` keep the raw bounds (max_kg is null for a single value so
// the consumer knows it's a point, not a band). Mirrors the zone resolver's
// "raw + ready label" shape so web + iOS render from the same source of truth.
export interface ResolvedRmLoad {
  pct_label: string;
  kg_label: string;
  min_kg: number;
  max_kg: number | null;
  one_rm_kg: number;
}

// Percentages may be whole or fractional; drop a trailing ".0" (mirrors the
// doubles formatter so "80" reads "80", not "80.0").
function formatPct(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`;
}

/**
 * Resolve a `percent_rm` target to an absolute kg load over the athlete's 1RM.
 * Handles a single value, a true min/max band, or a single-ended bound. A band
 * whose ends round to the same kg collapses to a single value (no "63–63 kg").
 * Returns null when there's no usable percentage or the 1RM is non-positive —
 * the caller then keeps showing the % honestly (we never fabricate a kg).
 */
export function resolveRmLoad(
  pct: { value?: number; min?: number; max?: number },
  oneRmKg: number,
): ResolvedRmLoad | null {
  if (!(oneRmKg > 0)) return null;

  const single = (p: number): ResolvedRmLoad => {
    const kg = resolvePercentRmToKg(p, oneRmKg);
    return { pct_label: `${formatPct(p)}%`, kg_label: `${kg} kg`, min_kg: kg, max_kg: null, one_rm_kg: oneRmKg };
  };

  if (pct.value !== undefined) return single(pct.value);

  if (pct.min !== undefined && pct.max !== undefined) {
    const loKg = resolvePercentRmToKg(pct.min, oneRmKg);
    const hiKg = resolvePercentRmToKg(pct.max, oneRmKg);
    if (loKg === hiKg) return single(pct.min);
    return {
      pct_label: `${formatPct(pct.min)}–${formatPct(pct.max)}%`,
      kg_label: `${loKg}–${hiKg} kg`,
      min_kg: loKg,
      max_kg: hiKg,
      one_rm_kg: oneRmKg,
    };
  }

  const onlyBound = pct.min ?? pct.max;
  if (onlyBound !== undefined) return single(onlyBound);

  return null;
}
