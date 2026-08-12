// LA BANDA — lo que se le pidió a un tramo, en s/km, para poder dibujarla.
//
// Se deriva con las MISMAS primitivas compartidas y la MISMA precedencia que
// aplica el servidor al juzgar el tramo. Ver el porqué en `bandaDeRitmo`.

import { paceBandFromResolvedZone, paceBandFromTarget } from '@fahybrid/shared/domain/adherence';
import type { Segment } from '@fahybrid/shared/domain/prescription';
import type { AssignmentDetailItem, ResolvedIntensity } from '@/lib/athlete/assignment-detail';
import type { TramoLeido } from './modelo';

export type BandaDeRitmo = NonNullable<TramoLeido['banda']>;

/**
 * LA BANDA DE RITMO DE UN TRAMO, con la misma precedencia y las mismas
 * primitivas compartidas que aplica el servidor al juzgarlo (`segmentBand` en
 * `web/lib/dashboard/coach/run-compliance.ts`): objetivo explícito de ritmo
 * primero; si el objetivo era una zona, la banda que el cable ya resolvió para
 * ESE tramo, y solo si el tramo no trae la suya, la de la línea.
 *
 * Que esto exista aquí es la consecuencia de que la banda se calcule en el
 * servidor y no viaje: la UI la necesita para dibujar la franja y para decir
 * cuánto se fue el peor. En cuanto `RunComplianceTramo` lleve su `band`, esta
 * función se borra y se lee del cable — que es la única forma de que no puedan
 * divergir nunca. Mientras tanto la duplicación está declarada, no escondida.
 */
export function bandaDeRitmo(seg: Segment | undefined, item: AssignmentDetailItem): TramoLeido['banda'] {
  const deResuelta = (ri: ResolvedIntensity | null | undefined): TramoLeido['banda'] => {
    if (!ri || ri.pace_unit !== 'per_km') return null;
    const b = paceBandFromResolvedZone(ri.fast_s, ri.slow_s);
    return b.axis === 'pace' && b.fast_s != null && b.slow_s != null
      ? { rapidoSkm: b.fast_s, lentoSkm: b.slow_s }
      : null;
  };
  const t = seg?.target;
  if (t?.type === 'pace') {
    const b = paceBandFromTarget(t);
    return b.axis === 'pace' && b.fast_s != null && b.slow_s != null
      ? { rapidoSkm: b.fast_s, lentoSkm: b.slow_s }
      : null;
  }
  // Zona de ritmo o de pulso: manda la banda resuelta para este tramo.
  if (t?.type === 'pace_zone' || t?.type === 'hr_zone') {
    return deResuelta(seg?.resolved) ?? deResuelta(item.resolved_intensity);
  }
  // Sin objetivo en el tramo, la línea puede tener una banda resuelta propia
  // (el caso del rodaje uniforme, que es UN tramo con el objetivo en la línea).
  if (t == null && seg == null) return deResuelta(item.resolved_intensity);
  return null;
}

/** Cuánto se fue el peor tramo, contra el borde de banda que rompió. */
export function peorDesvio(tramos: TramoLeido[]): number | null {
  let peor: number | null = null;
  for (const t of tramos) {
    if (t.banda == null || t.ritmoSkm == null) continue;
    const fuera =
      t.ritmoSkm > t.banda.lentoSkm
        ? t.ritmoSkm - t.banda.lentoSkm
        : t.ritmoSkm < t.banda.rapidoSkm
          ? t.banda.rapidoSkm - t.ritmoSkm
          : 0;
    if (fuera > (peor ?? 0)) peor = fuera;
  }
  return peor;
}

/** La banda si TODOS los tramos con banda pidieron la misma. Una pirámide con
 *  ritmos distintos por escalón no tiene una banda que escribir en la cabecera,
 *  y escribir la del primero sería mentir sobre los demás. */
export function bandaComun(tramos: TramoLeido[]): TramoLeido['banda'] {
  const bandas = tramos.map((t) => t.banda).filter((b): b is NonNullable<TramoLeido['banda']> => b != null);
  if (bandas.length === 0) return null;
  const primera = bandas[0]!;
  return bandas.every((b) => b.rapidoSkm === primera.rapidoSkm && b.lentoSkm === primera.lentoSkm)
    ? primera
    : null;
}

