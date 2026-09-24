// Lectura TOLERANTE de lo que manda un aparato o el atleta al guardar un entreno.
//
// Zod no rechaza un campo: rechaza la PETICIÓN. En el guardado de un entreno eso
// es perder la sesión entera por un número (DECISIONS 2026-09-07, «sanitizar, no
// 400»). Estas dos piezas llevan esa regla al TIPO del valor: un campo de
// evidencia que no llega con el tipo que toca se queda en nada (undefined), y un
// elemento de una lista que no cumple su identidad (un tramo sin posición, una
// serie sin índice) se cae él solo, no la lista ni la sesión.
//
// La identidad sigue siendo estricta DENTRO de cada elemento: quien usa
// `lenientList` decide qué elemento no vale; lo único que cambia es que ese
// elemento no se lleva por delante a los demás.

import { z } from 'zod';

/** Un campo de evidencia: si no cumple `schema`, se pierde el campo, nunca la petición. */
export function lenient<T extends z.ZodTypeAny>(schema: T) {
  return z.unknown().transform((value): z.output<T> | undefined => {
    const parsed = schema.safeParse(value);
    return parsed.success ? (parsed.data as z.output<T>) : undefined;
  });
}

/**
 * Una lista de evidencia cuyos elementos tienen identidad propia. Lo que no es una
 * lista se queda en nada; de una lista, se quedan los elementos que cumplen `item`.
 */
export function lenientList<T extends z.ZodTypeAny>(item: T) {
  return z.unknown().transform((value): Array<z.output<T>> | undefined => {
    if (!Array.isArray(value)) return undefined;
    const kept: Array<z.output<T>> = [];
    for (const element of value) {
      const parsed = item.safeParse(element);
      if (parsed.success) kept.push(parsed.data as z.output<T>);
    }
    return kept;
  });
}

/** Cuántos elementos de una lista cruda se quedaron fuera al leerla con `lenientList`. */
export function droppedCount(raw: unknown, kept: readonly unknown[] | null | undefined): number {
  if (!Array.isArray(raw)) return 0;
  return Math.max(0, raw.length - (kept?.length ?? 0));
}
