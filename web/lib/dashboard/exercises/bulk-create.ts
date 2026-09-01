import 'server-only';

// bulk-create — dar de alta VARIOS ejercicios propios del coach de una vez.
//
// POR QUÉ EXISTE. Una importación por foto de una semana real deja 30 nombres que
// el catálogo no tiene. Uno a uno son treinta formularios, y eso no lo hace
// nadie: la función se abandona en la primera importación, que es justo donde se
// decide si se usa.
//
// TODOS O NINGUNO. Va dentro de UNA transacción a propósito. Una creación parcial
// silenciosa es el peor resultado posible aquí: el coach se queda con medio
// catálogo nuevo, sin saber cuál mitad, y al reintentar duplica lo que sí entró.
// Si uno falla, no entra ninguno y se dice cuál y por qué.
//
// NO INVENTA NADA. Reutiliza `createExercise` tal cual, así que la modalidad y la
// categoría siguen siendo OBLIGATORIAS y validadas por el mismo esquema que el
// alta de uno en uno. Este módulo no rellena huecos: si algo llega sin decidir,
// es que la pantalla dejó pasar algo que no debía.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { createExercise, createExerciseSchema } from '@/lib/dashboard/exercises/create-exercise';
import type { CatalogExercise } from '@/lib/dashboard/exercises/types';
import { nameSimilarity } from '@/lib/dashboard/exercises/near-match';
import { loadCoachExerciseCatalog } from '@/lib/dashboard/coach/ai/exercise-catalog';

/** Tope por tanda. La semana real más cargada deja 30 nombres; 60 da holgura de
 *  sobra sin dejar que una petición cree un catálogo entero de golpe. */
export const BULK_CREATE_MAX = 60;

export const bulkCreateSchema = z
  .object({
    exercises: z.array(createExerciseSchema).min(1).max(BULK_CREATE_MAX),
  })
  .strict();

export type BulkCreateRequest = z.infer<typeof bulkCreateSchema>;

export interface BulkCreateResult {
  created: CatalogExercise[];
}

export class BulkCreateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/**
 * ¿Son el MISMO ejercicio escrito de otra manera?
 *
 * Es `nameSimilarity` a 1: todas las palabras de uno emparejan con las del otro y
 * no sobra ninguna. Eso cubre el orden, los acentos y el plural — «Dominadas» y
 * «Dominada» son el mismo — y NO cubre un matiz de más, que sí es otro ejercicio.
 *
 * Se compara así, y no con una clave de texto, para que en el repo haya UNA sola
 * idea de «igual»: la misma que decide qué se propone fusionar. Un primer intento
 * usaba claves ordenadas y dejaba pasar justo el plural, que es el duplicado más
 * común que existe.
 */
export function isSameExerciseName(a: string, b: string): boolean {
  return nameSimilarity(a, b) === 1;
}

/** Un nombre que se quiere crear y que YA está en el catálogo del coach. */
export interface NameCollision {
  /** El nombre que venía en la tanda. */
  name: string;
  /** El que ya existe, tal y como se llama hoy. */
  existing: string;
}

/**
 * Los nombres de la tanda que ya existen en el catálogo, palabra por palabra.
 *
 * Esto es la diferencia entre sugerir y garantizar. La pantalla ya PROPONE
 * fusionar cuando algo se parece, pero una propuesta se puede ignorar de un clic
 * y el alta de un ejercicio no detecta duplicados: `createExercise` absorbe un
 * nombre repetido en silencio como `dominada-2`. Así que lo idéntico se rechaza
 * aquí, en el servidor, donde no se puede saltar.
 *
 * Idéntico, no PARECIDO: «Dominada a una mano» se parece a «Dominada» y aun así
 * es otro ejercicio. Lo que se bloquea es solo lo que no tiene defensa posible.
 */
export function exactNameCollisions(
  names: readonly string[],
  catalog: readonly { name: string }[],
): NameCollision[] {
  const out: NameCollision[] = [];
  for (const name of names) {
    const existing = catalog.find((ex) => isSameExerciseName(name, ex.name));
    if (existing) out.push({ name, existing: existing.name });
  }
  return out;
}

/**
 * Crea todos los ejercicios de la tanda, o ninguno.
 *
 * Rechaza ANTES de escribir nada si la propia tanda trae dos nombres iguales:
 * dejarlo pasar crearía el duplicado que toda esta pantalla existe para evitar, y
 * encima en la misma petición.
 */
export async function createExercisesBulk(params: {
  coach_id: number | bigint;
  body: unknown;
  client?: Sql;
}): Promise<BulkCreateResult> {
  const parsed = bulkCreateSchema.safeParse(params.body);
  if (!parsed.success) {
    throw new BulkCreateError('invalid_request', 'Datos inválidos', 422, parsed.error.flatten());
  }
  const { exercises } = parsed.data;
  const client = params.client ?? defaultSql;

  // Dentro de la propia tanda: dos nombres que son el mismo ejercicio crearían
  // el duplicado que esta pantalla existe para evitar, y encima de una sentada.
  for (let i = 0; i < exercises.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (isSameExerciseName(exercises[i]!.name, exercises[j]!.name)) {
        throw new BulkCreateError(
          'duplicate_in_batch',
          `«${exercises[i]!.name}» y «${exercises[j]!.name}» son el mismo ejercicio. Deja solo uno.`,
          400,
        );
      }
    }
  }

  // Contra el catálogo QUE ESTE COACH VE (base + suyos): crear algo que ya tiene
  // es el duplicado que toda esta pantalla existe para evitar, y `createExercise`
  // no lo detectaría — lo absorbería como «dominada-2».
  const catalog = await loadCoachExerciseCatalog(client, params.coach_id, {
    order: 'name',
    limit: null,
  });
  const collisions = exactNameCollisions(
    exercises.map((e) => e.name),
    catalog,
  );
  if (collisions.length > 0) {
    const first = collisions[0]!;
    throw new BulkCreateError(
      'already_exists',
      collisions.length === 1
        ? `«${first.name}» ya está en tu catálogo como «${first.existing}». Únelo en vez de crearlo.`
        : `${collisions.length} de esos ejercicios ya están en tu catálogo. Únelos en vez de crearlos.`,
      409,
      { collisions },
    );
  }

  const created: CatalogExercise[] = [];
  await client.begin(async (tx) => {
    for (const ex of exercises) {
      created.push(await createExercise(ex, BigInt(params.coach_id), tx));
    }
  });
  return { created };
}
