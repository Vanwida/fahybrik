// Un tramo sin identidad propia (posición ≥ 0, modalidad) es un fallo de NUESTRO
// cliente: le cuesta ese tramo, nunca la sesión (0270), y se dice en voz alta en el
// servidor en vez de tragárselo. La misma regla en la sesión del coach y en el
// entreno libre, y el mismo número en su respuesta (`segments_dropped`).

import { captureRouteError } from '@/lib/observability/capture';
import { droppedCount } from '@/lib/sync/lenient';

/** Cuántos tramos del cuerpo crudo se cayeron al leerlo; si alguno, lo avisa. */
export function reportDroppedTramos(args: {
  route: string;
  athleteId: number;
  rawBody: unknown;
  kept: readonly unknown[] | null | undefined;
}): number {
  const raw =
    args.rawBody && typeof args.rawBody === 'object'
      ? (args.rawBody as { segments?: unknown }).segments
      : undefined;
  const dropped = droppedCount(raw, args.kept);
  if (dropped > 0) {
    captureRouteError(new Error(`${args.route}: tramos sin identidad descartados`), {
      route: args.route,
      meta: { athlete_id: args.athleteId, dropped_segments: dropped },
    });
  }
  return dropped;
}
