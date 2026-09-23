import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';

/**
 * Referencias que viajan DENTRO del JSON de una semana (`slots_json`) y que por
 * eso no tienen FK que las proteja: `sessions[].template_id`,
 * `blocks[].source_block_id` y `items[].exercise_id`. Cada una la sigue después
 * un lector (el materializador clona el template, la vista previa y la
 * hidratación leen el bloque), así que un id de otro club guardado aquí es una
 * puerta a su contenido.
 *
 * La regla: al escribir, ninguna de esas referencias puede ser de OTRO coach.
 * Un id que ya no existe se deja pasar (un template borrado deja su id en semanas
 * viejas; los ids no se reutilizan, así que no puede acabar apuntando a otro
 * club), y un ejercicio del catálogo base (`coach_id is null`) es de todos. Entrenos
 * y bloques no tienen catálogo base: todas sus filas llevan coach.
 *
 * Es la mitad de ESCRITURA de la frontera; la de LECTURA (materializador,
 * `hydrateBlockParts`, vista previa) filtra por coach igualmente, para que un
 * JSON guardado antes de esta regla tampoco pueda filtrar nada.
 */

type SlotRefs = { templateIds: number[]; blockIds: number[]; exerciseIds: number[] };

type LooseDay = {
  sessions?: Array<{
    template_id?: unknown;
    blocks?: Array<{ source_block_id?: unknown; items?: Array<{ exercise_id?: unknown }> }>;
  }>;
};

function asId(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Extrae las referencias de un `slots_json` normalizado (`{ days: [...] }`). Pura. */
export function collectWeekSlotRefs(slots: { days?: unknown } | null | undefined): SlotRefs {
  const t = new Set<number>();
  const b = new Set<number>();
  const e = new Set<number>();
  const days = Array.isArray(slots?.days) ? (slots.days as LooseDay[]) : [];
  for (const day of days) {
    for (const s of day?.sessions ?? []) {
      const tid = asId(s?.template_id);
      if (tid != null) t.add(tid);
      for (const blk of s?.blocks ?? []) {
        const bid = asId(blk?.source_block_id);
        if (bid != null) b.add(bid);
        for (const it of blk?.items ?? []) {
          const eid = asId(it?.exercise_id);
          if (eid != null) e.add(eid);
        }
      }
    }
  }
  return { templateIds: [...t], blockIds: [...b], exerciseIds: [...e] };
}

/**
 * Devuelve cuántas referencias del JSON son de otro coach (0 = se puede guardar).
 * Una sola consulta para las tres tablas.
 */
export async function countForeignWeekSlotRefs(
  client: Sql | TransactionClient,
  coachId: number | bigint,
  slots: { days?: unknown } | null | undefined,
): Promise<number> {
  const refs = collectWeekSlotRefs(slots);
  if (refs.templateIds.length + refs.blockIds.length + refs.exerciseIds.length === 0) return 0;
  const coach = Number(coachId);
  const db = client as unknown as Sql;
  const rows = await db<Array<{ n: number }>>`
    select (
      (select count(*) from templates
        where id = any(${refs.templateIds}::bigint[]) and coach_id is distinct from ${coach})
      + (select count(*) from blocks
        where id = any(${refs.blockIds}::bigint[]) and coach_id is distinct from ${coach})
      + (select count(*) from exercises
        where id = any(${refs.exerciseIds}::bigint[]) and coach_id is not null and coach_id <> ${coach})
    )::int as n
  `;
  return rows[0]?.n ?? 0;
}
