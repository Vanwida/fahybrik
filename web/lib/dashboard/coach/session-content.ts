import 'server-only';

// QUÉ SESIONES DE UN PROGRAMA LLEGAN AL ATLETA — fuente única.
//
// La previa de «Asignar» (assign-many-plan.ts) y la materialización
// (instantiate-program.ts) tienen que contar EXACTAMENTE las mismas sesiones:
// antes la previa contaba «tiene template_id, items o un bloque de biblioteca» y
// el materializador descartaba los bloques sin desglosar y los ejercicios que ya
// no existen, así que un programa podía pasar la previa y crear 0 sesiones sin
// avisar. Ahora los dos preguntan aquí (`resolveSessionsContent`): el veredicto
// sale del mismo código y del mismo estado de la base.

import type { Sql } from '@/lib/db';
import type { WeekDayPart, WeekDayPartItem, WeekSession } from '@fahybrid/shared/schema/program-templates';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import { joinCoachOverride, visibleToCoach } from '@/lib/exercises/coach-override';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { blockExerciseToItem, type BlockExerciseRow } from './blocks';

/**
 * Hidrata los parts de Biblioteca de Bloques con sus `block_exercises`.
 *
 * Para cada part con `source_block_id` y sin `items` propios, carga las filas
 * estructuradas de `block_exercises` (0038) y las convierte en `WeekDayPartItem`
 * (exercise_id + params_json canónicos + block_position espejado). Los parts que
 * ya traen items (a medida o ya hidratados) o sin `source_block_id` se devuelven
 * intactos. Un único query batch para todos los block_ids de la sesión.
 *
 * ⚠️ NO ES CÓDIGO MUERTO — ES EL LECTOR DE LOS DATOS VIEJOS. NO LO BORRES.
 *
 * Ninguna vía NUEVA depende de esto: al insertar un bloque desde la Biblioteca en
 * el editor de día se COPIA la estructura (items ya vienen llenos, ver
 * `library-block-to-editor.ts`), así que aquí esos parts pasan de largo. Pero en
 * `slots_json` de las semanas YA ESCRITAS viven **39 parts** con `source_block_id`
 * y `items: []` (verificado contra prod, jul-2026: 39 de 379 parts, y los 39
 * tienen items vacío) — esos SIGUEN resolviéndose aquí, al asignar. Si esto se
 * "limpia" por no encontrarle llamadores nuevos, esas 39 piezas se materializan
 * VACÍAS y el atleta recibe un entreno sin ejercicios.
 *
 * Lo mismo aplica al `items: []` de `createPartFromLibraryBlock` (block-to-part.ts):
 * es la otra mitad de este contrato, no un olvido.
 *
 * `coachId` — el nombre de cada ejercicio hidratado es el MERGED (override del
 * coach si renombró la base, si no la base, 0132). El join de ejercicios es
 * solo para el nombre — NUNCA le añadas un filtro de visibilidad de ejercicio.
 *
 * Lo que SÍ lleva es la frontera de tenant sobre el BLOQUE: `source_block_id`
 * viaja dentro del JSON de la semana (no es una FK), así que un part puede
 * apuntar a un id cualquiera. Solo se hidratan bloques de `coachId`; uno ajeno
 * se queda sin items, exactamente como un bloque sin desglosar. Así ni un JSON
 * escrito antes de validar las referencias en la escritura puede traer el
 * contenido de otro club.
 */
export async function hydrateBlockParts(
  client: Sql,
  coachId: number | bigint,
  parts: WeekDayPart[],
): Promise<WeekDayPart[]> {
  const blockIds = Array.from(
    new Set(
      parts
        .filter((p) => p.source_block_id != null && (p.items?.length ?? 0) === 0)
        .map((p) => Number(p.source_block_id)),
    ),
  );
  if (blockIds.length === 0) return parts;

  const rows = await client<BlockExerciseRow[]>`
    select be.block_id::text, be.position, be.block_position,
           be.exercise_id::text, coalesce(ceo.name, e.name) as exercise_name,
           be.params_json, be.prescription_json, be.notes
    from block_exercises be
    join blocks b on b.id = be.block_id and b.coach_id = ${Number(coachId)}
    join exercises e on e.id = be.exercise_id
    ${joinCoachOverride(client, coachId)}
    where be.block_id = any(${blockIds}::bigint[])
    order by be.block_id, be.position
  `;

  // group exercises by block_id, preserving position order. Mapeo compartido
  // (blockExerciseToItem) con el endpoint GET /api/coach/blocks/[id] → mismo shape.
  const byBlock = new Map<number, WeekDayPartItem[]>();
  for (const r of rows) {
    const bid = Number(r.block_id);
    const list = byBlock.get(bid) ?? [];
    list.push(blockExerciseToItem(r));
    byBlock.set(bid, list);
  }

  return parts.map((p) => {
    if (p.source_block_id == null || (p.items?.length ?? 0) > 0) return p;
    const items = byBlock.get(Number(p.source_block_id));
    if (!items || items.length === 0) return p; // needs_review block → keep verbatim
    return { ...p, items };
  });
}

/** Por qué una sesión (o parte de ella) no llega al atleta. */
export type SessionDropReason =
  /** Su plantilla de origen ya no existe (o no es del coach). */
  | 'template_missing'
  /** No queda ni un ejercicio: bloques vacíos o de biblioteca sin desglosar. */
  | 'no_exercises'
  /** Faltan ejercicios que ya no existen o el coach no ve. */
  | 'exercises_missing';

export interface SessionDrop {
  reason: SessionDropReason;
  /** true = la sesión entera no se crea; false = se crea sin esas líneas. */
  session_lost: boolean;
  /** Nombres de los ejercicios que faltan. */
  missing_exercises: string[];
  /** Títulos de los bloques que se quedan sin ejercicios. */
  empty_blocks: string[];
}

export interface SessionContent {
  /** ¿Se crea un entreno para el atleta con esta sesión? */
  materializes: boolean;
  drop: SessionDrop | null;
  /** Bloques con los de biblioteca ya desglosados (solo sesiones inline). */
  blocks: WeekDayPart[];
  /** Ejercicios de `blocks` que existen y ve el coach, con su modalidad (0053). */
  modality_by_exercise: Map<number, Modality | null>;
}

const NOTHING: SessionContent = {
  materializes: false,
  drop: null,
  blocks: [],
  modality_by_exercise: new Map(),
};

/**
 * Veredicto de cada sesión de entreno, en el mismo orden. Un solo viaje por tipo
 * de consulta (plantillas, bloques de biblioteca, ejercicios) sea cual sea el
 * número de sesiones. Las sesiones que no son de entreno devuelven «nada».
 *
 * Una sesión sin plantilla y sin bloques no es un entreno sin más: es un hueco
 * aún sin escribir, y ni cuenta ni avisa.
 */
export async function resolveSessionsContent(
  client: Sql,
  coach_id: number | bigint,
  sessions: WeekSession[],
): Promise<SessionContent[]> {
  const workouts = sessions.map((s) => s.kind === 'workout');

  // Sesiones que apuntan a una plantilla de la biblioteca: existe y es del coach.
  // tenancy: la frontera es coach_id; un id ajeno se trata como borrado (igual que
  // cloneTemplateAsInstance).
  const templateIds = [
    ...new Set(sessions.flatMap((s, i) => (workouts[i] && s.template_id != null ? [Number(s.template_id)] : []))),
  ];
  const ownedTemplates = new Set<number>();
  if (templateIds.length > 0) {
    const rows = await client<Array<{ id: string }>>`
      select id::text from templates
      where id = any(${templateIds}::bigint[]) and coach_id = ${Number(coach_id)}
    `;
    for (const r of rows) ownedTemplates.add(Number(r.id));
  }

  // Sesiones inline: sus bloques, con los de biblioteca desglosados de una vez.
  const inline = sessions.map((s, i) => (workouts[i] && s.template_id == null ? (s.blocks ?? []) : []));
  const hydrated = await hydrateBlockParts(client, coach_id, inline.flat());
  const blocksBySession: WeekDayPart[][] = [];
  let cursor = 0;
  for (const list of inline) {
    blocksBySession.push(hydrated.slice(cursor, cursor + list.length));
    cursor += list.length;
  }

  // Ejercicios que existen y ve el coach (mig 0132). El id llega tal cual del JSON
  // de la sesión, no por FK de una fila ya acotada, así que se resuelve con la
  // misma visibilidad que cualquier otra enumeración.
  const referenced = [
    ...new Set(blocksBySession.flatMap((bs) => bs.flatMap((b) => (b.items ?? []).map((it) => Number(it.exercise_id))))),
  ];
  const modalityById = new Map<number, Modality | null>();
  if (referenced.length > 0) {
    // tenancy: coach-fragment — visibleToCoach filtra por el coach de la sesión.
    const rows = await client<Array<{ id: string; modality: string | null }>>`
      select e.id::text, e.modality::text as modality from exercises e
      where e.id = any(${referenced}::bigint[])
        and ${visibleToCoach(client, coach_id)}
    `;
    for (const r of rows) modalityById.set(Number(r.id), (r.modality as Modality | null) ?? null);
  }

  return sessions.map((session, i) => {
    if (!workouts[i]) return NOTHING;
    if (session.template_id != null) {
      return ownedTemplates.has(Number(session.template_id))
        ? { ...NOTHING, materializes: true }
        : { ...NOTHING, drop: { reason: 'template_missing', session_lost: true, missing_exercises: [], empty_blocks: [] } };
    }
    const blocks = blocksBySession[i]!;
    if (blocks.length === 0) return NOTHING;

    const items = blocks.flatMap((b) => b.items ?? []);
    const missing = [...new Set(items.filter((it) => !modalityById.has(Number(it.exercise_id))).map((it) => it.exercise_name))];
    const emptyBlocks = blocks
      .filter((b) => !(b.items ?? []).some((it) => modalityById.has(Number(it.exercise_id))))
      .map((b) => b.title);
    const kept = items.length - items.filter((it) => !modalityById.has(Number(it.exercise_id))).length;
    if (kept === 0) {
      return {
        ...NOTHING,
        blocks,
        drop: {
          reason: items.length === 0 ? 'no_exercises' : 'exercises_missing',
          session_lost: true,
          missing_exercises: missing,
          empty_blocks: emptyBlocks,
        },
      };
    }
    return {
      materializes: true,
      blocks,
      modality_by_exercise: modalityById,
      drop:
        missing.length > 0 || emptyBlocks.length > 0
          ? {
              reason: missing.length > 0 ? 'exercises_missing' : 'no_exercises',
              session_lost: false,
              missing_exercises: missing,
              empty_blocks: emptyBlocks,
            }
          : null,
    };
  });
}

/** Una sesión que no se ha podido crear (o se ha creado incompleta), con su sitio en el programa. */
export interface DroppedSession extends SessionDrop {
  /** Semana del programa (1 = la primera). */
  week_number: number;
  /** 1 = lunes … 7 = domingo, en el programa (antes de repartir por la disponibilidad del atleta). */
  day_of_week: number;
  label: string;
}

export function sessionLabel(session: WeekSession): string {
  return session.focus?.trim() || session.blocks?.[0]?.title || 'Entreno';
}

const list = (names: string[]) => (names.length <= 3 ? names : [...names.slice(0, 3), `y ${names.length - 3} más`]).join(', ');

/** Frase para el coach: dónde, qué pasa y qué falta. Castellano llano, sin jerga. */
export function describeDrop(d: DroppedSession): string {
  const where = `Semana ${d.week_number}, ${DAY_LABELS_FULL[d.day_of_week - 1]?.toLowerCase() ?? `día ${d.day_of_week}`} «${d.label}»`;
  switch (d.reason) {
    case 'template_missing':
      return `${where}: el entreno de la biblioteca ya no existe; no se crea.`;
    case 'no_exercises':
      return d.session_lost
        ? `${where}: no tiene ejercicios${d.empty_blocks.length > 0 ? ` (${list(d.empty_blocks)})` : ''}; no se crea.`
        : `${where}: ${list(d.empty_blocks)} no tiene ejercicios; se crea sin ${d.empty_blocks.length === 1 ? 'ese bloque' : 'esos bloques'}.`;
    case 'exercises_missing':
      return d.session_lost
        ? `${where}: ${d.missing_exercises.length === 1 ? 'falta en tu catálogo' : 'faltan en tu catálogo'} ${list(d.missing_exercises)}; no se crea.`
        : `${where}: ${d.missing_exercises.length === 1 ? 'falta en tu catálogo' : 'faltan en tu catálogo'} ${list(d.missing_exercises)}; se crea sin ${d.missing_exercises.length === 1 ? 'él' : 'ellos'}.`;
  }
}
