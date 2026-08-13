import 'server-only';

// LEER UNA FILA DE MÉTODO DEL COACH — el patrón, una sola vez.
//
// POR QUÉ EXISTE
// --------------
// Hay ya tres tablas con la misma forma exacta (`coach_signal_thresholds`,
// `coach_running_thresholds`, `coach_analytics_method`): una fila por coach,
// columnas numéricas explícitas, los defectos viviendo en `shared/domain` y
// nunca como `default` de columna. Las tres se leen igual, y las tres tienen
// que resolver los mismos tres casos raros de la misma manera:
//
//   1. La tabla todavía no existe (entorno sin migrar) → servir los defectos,
//      no tumbar el barrido entero.
//   2. `numeric` llega de postgres.js como CADENA. Una cadena colada en un
//      umbral hace que `0.2 >= subida` compare texto contra número, y el aviso
//      salta o no salta por motivos que nadie puede explicar.
//   3. Una columna que aún no existe (migración por detrás del despliegue)
//      llega ausente, y `{...defectos, x: undefined}` deja `undefined` — NO el
//      defecto. Hay que descartar los huecos ANTES de esparcir.
//
// Tres implementaciones del mismo cuidado son tres sitios donde olvidarlo. Los
// dos resolutores anteriores siguen con su copia y migrarlos aquí es un cambio
// aparte: este fichero abre el camino sin tocar código que otras sesiones
// puedan tener abierto.

import type { Sql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';

/**
 * Un número de verdad. Null cuando la columna vino vacía o no vino, para que el
 * defecto tome el relevo en vez de ser sobrescrito con `undefined`.
 */
function comoNumero(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * El método VIGENTE de un coach: su fila si la ha escrito, si no, los defectos.
 *
 * `select *` a propósito. Con una lista explícita de columnas, el hueco entre
 * desplegar código que lee una columna nueva y correr su migración es una
 * excepción de Postgres en CADA lectura — justo cuando más caro sale. Con `*`,
 * la columna que aún no existe simplemente no viene y el defecto la rellena.
 * Las columnas de más (`coach_id`, `updated_at`) no se cuelan porque los
 * valores se recogen por la lista de claves editables, nunca la fila entera.
 */
export async function resolveMethodRow<T extends object>(args: {
  table: string;
  keys: ReadonlyArray<keyof T>;
  defaults: T;
  coach_id: bigint | number;
  client: Sql;
}): Promise<T> {
  let row: Record<string, unknown> | null = null;
  try {
    // El nombre de tabla es un literal del código llamante, nunca entrada de
    // usuario: no hay superficie de inyección aquí.
    const rows = await args.client<Array<Record<string, unknown>>>`
      select * from ${args.client(args.table)}
      where coach_id = ${args.coach_id}
      limit 1
    `;
    row = rows[0] ?? null;
  } catch (err) {
    if (isPgMissingRelation(err, args.table)) return { ...args.defaults };
    throw err;
  }

  if (!row) return { ...args.defaults };

  const values: Partial<T> = {};
  for (const k of args.keys) {
    const n = comoNumero(row[k as string]);
    if (n != null) values[k] = n as T[keyof T];
  }
  return { ...args.defaults, ...values };
}
