// Las escrituras del día: crear una sesión, cambiarle el contenido y moverla.
//
// Son las tres cosas que el coach hace de pie en el gym («añádele un rodaje el
// martes», «cámbiale el 5×5 a 3×5 con 2 de RIR», «muévele el jueves al sábado»), y
// las tres pasan por las MISMAS funciones que el panel: `createDaySession` +
// `updateAthleteInstanceDay` para el contenido y `rescheduleAssignment` para la
// fecha. Ni una consulta paralela, así que el conector no puede divergir del panel.
//
// LO QUE NO HACE ESTE FICHERO, Y ES DELIBERADO:
//
//   · No estrena estados. Que el atleta vea o no lo que se acaba de escribir lo
//     decide `weekly_plans` de esa semana, igual que en el panel — y como SIN FILA
//     una semana es VISIBLE, tocar un día publicado le llega al móvil al momento.
//     El conector no marca borradores por su cuenta: lo LEE y lo DICE
//     (`shape-write.ts`). Publicar es otra llamada, y es de la Fase 4.
//   · No acepta dosis en texto. El contenido entra tipado y pasa por los tres
//     portones de `write-content.ts` (Zod del dominio → catálogo del coach →
//     completitud). Lo que no es ejecutable no entra; lo que es criterio del
//     entrenador vuelve como aviso.
//   · No adivina cuando hay dos sesiones el mismo día. Devuelve la lista corta y
//     NO TOCA NADA — el patrón de `get_session`, con más razón al escribir.
//
// AUDITORÍA. Toda mutación estampa `audit_log` con el `user_id` de la PERSONA que
// lo dictó (no el del club) y canal `mcp` (migración 0165), así que «¿esto lo
// cambié desde el chat o desde el panel?» tiene respuesta.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '@/lib/db';
import { coachActor, recordAudit } from '@/lib/audit/record-edit';
import { buildAthletePlan, type PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import { createDaySession, DaySessionError } from '@/lib/dashboard/coach/day-sessions';
import { loadAthleteDayEditor } from '@/lib/dashboard/coach/athlete-day-editor';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { TemplateError } from '@/lib/dashboard/coach/templates';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';
import { AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { PLAN_SLOT, rescheduleAssignment } from '@/lib/coach/deep-dive-plan';
import { prescriptionToText, type Prescription } from '@fahybrid/shared/domain/prescription';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  resolveOwnedAthlete,
  withCoach,
} from './runtime';
import {
  ContentError,
  contentBlocksArg,
  contentGrammar,
  contentReadback,
  contentToSegments,
  gateContent,
  normalizeContentBlocks,
  resolveContentExercises,
  sessionFormatFor,
  type ContentBlock,
  type NormalizedContentBlock,
} from './write-content';
import { moveResumen, weekVisibility, writeResumen } from './shape-write';

const sessionIdArg = z
  .number()
  .int()
  .positive()
  .describe('El session_id que devuelve get_plan (el assignment_id de esa sesión).');

/** Cómo se avisa de que una sesión con dos candidatas no se ha tocado. */
function ambiguousDay(params: {
  athlete_name: string;
  iso_date: string;
  sessions: PlanSession[];
  what: string;
}) {
  return ok(
    {
      touched: false,
      iso_date: params.iso_date,
      sessions: params.sessions.map((s) => ({
        session_id: s.assignment_id,
        title: s.title,
        status: s.status,
      })),
    },
    `${params.athlete_name} tiene ${params.sessions.length} sesiones el ${params.iso_date}: ` +
      `dime cuál con session_id y ${params.what}. No he tocado nada.`,
  );
}

export function registerWriteTools(server: McpServer): void {
  // ── create_session ─────────────────────────────────────────────────────────
  server.registerTool(
    'create_session',
    {
      title: 'Crear una sesión en un día',
      description:
        'Crea una sesión NUEVA en un día concreto de un atleta, con su contenido ya escrito: bloques, ejercicios del catálogo y la dosis de cada línea. Úsalo cuando el coach diga «añádele», «ponle» o «métele» un entreno un día. La respuesta dice exactamente qué ha quedado escrito y si el atleta ya lo ve o sigue en borrador.\n\n' +
        contentGrammar(),
      inputSchema: {
        athlete_id: athleteIdArg,
        date: isoDateArg.describe('El día en que va la sesión (AAAA-MM-DD).'),
        title: z
          .string()
          .min(1)
          .max(200)
          .describe(
            'El nombre que lee el atleta: «Rodaje largo», «Fartlek», «Fuerza tren inferior». SOLO el nombre: la dosis (series, distancias, zonas, descansos) va SIEMPRE tipada en las líneas de los bloques, nunca escrita en el título.',
          ),
        blocks: contentBlocksArg.describe(
          'Los bloques de la sesión, en el orden en que se hacen. Cada bloque, sus líneas; cada línea, su ejercicio y su dosis tipada.',
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        const prepared = await prepareContent({ coach_id, blocks: args.blocks });
        if ('error' in prepared) return fail(prepared.error);
        const { blocks, exercises, segments } = prepared;

        // La sesión nace AUTORADA (instancia vacía), no copiando una plantilla
        // cualquiera: un fork arrastraría el formato, el calentamiento y la nota
        // de otro entreno dentro de este.
        let created: { assignment_id: string; template_id: number };
        try {
          created = await createDaySession({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.date,
            display_title: args.title,
            content_source: 'authored',
            format: sessionFormatFor(blocks),
          });
        } catch (err) {
          if (err instanceof DaySessionError) return fail(err.message);
          throw err;
        }

        // El contenido va por el escritor del panel. Si fallara aquí, el día se
        // quedaría con una sesión vacía: se deshace lo que acabamos de crear y se
        // dice, en vez de dejar un hueco que el atleta abriría el martes.
        try {
          await updateAthleteInstanceDay({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.date,
            payload: { template_id: created.template_id, name: args.title, segments },
            actor: coachActor(session),
            channel: 'mcp',
          });
        } catch (err) {
          await rollbackCreatedSession({
            coach_id,
            athlete_id: args.athlete_id,
            assignment_id: Number(created.assignment_id),
            template_id: created.template_id,
          });
          const why = contentWriteError(err);
          if (why) return fail(`No he creado la sesión: ${why}`);
          throw err;
        }

        await recordAudit(sql, {
          entity_type: 'workout_assignments',
          entity_id: BigInt(created.assignment_id),
          action: 'create',
          actor: coachActor(session),
          channel: 'mcp',
          diff: {
            athlete_id: String(args.athlete_id),
            iso_date: args.date,
            title: args.title,
            template_id: created.template_id,
            block_count: args.blocks.length,
            item_count: itemCount(args.blocks),
          },
        });

        const visibility = await weekVisibility({ athlete_id: args.athlete_id, iso_date: args.date });
        return ok(
          {
            session_id: created.assignment_id,
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            iso_date: args.date,
            title: args.title,
            blocks: contentReadback(blocks, exercises),
            visibility,
            avisos: prepared.avisos,
          },
          writeResumen({
            athlete_name: athlete.full_name,
            iso_date: args.date,
            title: args.title,
            block_count: args.blocks.length,
            item_count: itemCount(args.blocks),
            visibility,
            verb: 'creada',
          }),
        );
      }),
  );

  // ── edit_day ───────────────────────────────────────────────────────────────
  server.registerTool(
    'edit_day',
    {
      title: 'Cambiar el entreno de un día',
      description:
        'Cambia el contenido de una sesión que YA existe en un día: la dosis de un ejercicio, su carga o su RIR, el objetivo de un cardio, o quitar y añadir líneas. Llámalo PRIMERO SIN `blocks`: devuelve el contenido actual tal y como se escribe, tú lo modificas y lo devuelves COMPLETO en `blocks`. Ojo: `blocks` REEMPLAZA la sesión entera, así que reenvía también lo que no cambia. Si el día tiene dos sesiones y no dices cuál, no toca nada y te da la lista.\n\n' +
        contentGrammar(),
      inputSchema: {
        athlete_id: athleteIdArg,
        date: isoDateArg.describe('El día del entreno que se cambia (AAAA-MM-DD).'),
        session_id: sessionIdArg
          .optional()
          .describe('Cuál de las sesiones del día. Solo hace falta si ese día tiene más de una.'),
        blocks: contentBlocksArg
          .optional()
          .describe(
            'El contenido COMPLETO que queda en la sesión. Sin esto no se escribe nada: se devuelve el contenido actual para que lo modifiques.',
          ),
        title: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe('Cambia también el nombre del entreno. Sin esto se queda el que tenía.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        const day = await loadAthleteDayEditor({
          coach_id,
          athlete_id: args.athlete_id,
          iso_date: args.date,
        });
        if (!day) return fail(NO_SUCH_ATHLETE_MESSAGE);

        if (day.sessions.length === 0) {
          return fail(
            `${day.athlete_name} no tiene ninguna sesión el ${args.date}, así que no hay nada que cambiar. ` +
              'Si quieres ponerle una, usa create_session.',
          );
        }

        const target = args.session_id
          ? day.sessions.find((s) => s.assignment_id === String(args.session_id))
          : day.sessions.length === 1
            ? day.sessions[0]
            : undefined;

        if (!target) {
          if (args.session_id) {
            return fail(
              `Ese session_id no es de ninguna sesión de ${day.athlete_name} el ${args.date}. ` +
                'Pide el día con get_plan y usa el session_id que salga ahí.',
            );
          }
          return ambiguousDay({
            athlete_name: day.athlete_name,
            iso_date: args.date,
            sessions: day.sessions.map((s) => ({
              assignment_id: s.assignment_id,
              iso_date: args.date,
              title: s.title,
              status: s.status as PlanSession['status'],
              duration_min: null,
              format: null,
              rpe: null,
              // Desambiguar el día solo necesita título y estado; la modalidad
              // no se lee aquí, y null es «no se sabe», no una modalidad.
              modality: null,
            })),
            what: 'te digo su contenido actual',
          });
        }

        // Sin `blocks` esto es una LECTURA: el borrador editable de la sesión, en
        // la misma forma que acepta la escritura. Es la mitad que hace que un
        // cambio quirúrgico («solo el RIR») no obligue a reinventar el día entero.
        if (!args.blocks) {
          return ok(
            {
              touched: false,
              session_id: target.assignment_id,
              athlete_id: String(args.athlete_id),
              athlete_name: day.athlete_name,
              iso_date: args.date,
              title: target.title,
              blocks: snapshotBlocks(target.model.blocks),
            },
            `${day.athlete_name}, ${args.date} · «${target.title}»: te paso el contenido actual ` +
              `(${target.model.blocks.length} bloques). Modifícalo y vuelve a llamarme con blocks COMPLETO.`,
          );
        }

        const prepared = await prepareContent({ coach_id, blocks: args.blocks });
        if ('error' in prepared) return fail(prepared.error);

        const title = args.title ?? target.title;
        try {
          await updateAthleteInstanceDay({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.date,
            payload: { template_id: Number(target.template_id), name: title, segments: prepared.segments },
            actor: coachActor(session),
            channel: 'mcp',
          });
        } catch (err) {
          const why = contentWriteError(err);
          if (why) return fail(`No he cambiado nada: ${why}`);
          throw err;
        }

        await recordAudit(sql, {
          entity_type: 'templates',
          entity_id: BigInt(target.template_id),
          action: 'update',
          actor: coachActor(session),
          channel: 'mcp',
          diff: {
            athlete_id: String(args.athlete_id),
            iso_date: args.date,
            session_id: target.assignment_id,
            title,
            block_count_before: target.model.blocks.length,
            block_count_after: args.blocks.length,
            item_count_after: itemCount(args.blocks),
          },
        });

        const visibility = await weekVisibility({ athlete_id: args.athlete_id, iso_date: args.date });
        return ok(
          {
            session_id: target.assignment_id,
            athlete_id: String(args.athlete_id),
            athlete_name: day.athlete_name,
            iso_date: args.date,
            title,
            blocks: contentReadback(prepared.blocks, prepared.exercises),
            /** Las otras sesiones de ese día no se han tocado: se dicen para que quede claro. */
            untouched_sessions: day.sessions
              .filter((s) => s.assignment_id !== target.assignment_id)
              .map((s) => ({ session_id: s.assignment_id, title: s.title })),
            visibility,
            avisos: prepared.avisos,
          },
          writeResumen({
            athlete_name: day.athlete_name,
            iso_date: args.date,
            title,
            block_count: args.blocks.length,
            item_count: itemCount(args.blocks),
            visibility,
            verb: 'cambiada',
          }),
        );
      }),
  );

  // ── move_session ───────────────────────────────────────────────────────────
  server.registerTool(
    'move_session',
    {
      title: 'Mover una sesión a otro día',
      description:
        'Mueve una sesión a otra fecha sin tocar su contenido. Dile la sesión por session_id o por la fecha de la que sale (si ese día tiene dos, te pide cuál y no toca nada). Solo se mueven las sesiones que están por hacer: una ya entrenada no se recoloca.',
      inputSchema: {
        athlete_id: athleteIdArg,
        session_id: sessionIdArg.optional().describe('La sesión que se mueve. Manda sobre from_date.'),
        from_date: isoDateArg
          .optional()
          .describe('El día del que sale la sesión (AAAA-MM-DD), como habla el coach.'),
        to_date: isoDateArg.describe('El día al que va (AAAA-MM-DD).'),
        to_slot: z
          .enum(PLAN_SLOT)
          .optional()
          .describe('AM o PM en el día de destino. Sin esto se queda el que tenía.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        if (args.session_id == null && args.from_date == null) {
          return fail(
            'Dime qué sesión mover: pásame el session_id que devuelve get_plan o la fecha de la que sale (from_date).',
          );
        }

        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        // Se resuelve la sesión ANTES de moverla porque la lectura de vuelta tiene
        // que decir de dónde salió y cómo se llama, y eso ya no existe después.
        let source: PlanSession | undefined;
        if (args.session_id != null) {
          source = await findSessionById({
            coach_id,
            athlete_id: args.athlete_id,
            assignment_id: args.session_id,
          });
          if (!source) {
            return fail(
              'Ese atleta no tiene ninguna sesión con ese identificador. ' +
                'Pide su semana con get_plan y usa el session_id que salga ahí.',
            );
          }
        } else {
          const sessions = await sessionsOnDate({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.from_date!,
          });
          if (sessions.length === 0) {
            return fail(
              `${athlete.full_name} no tiene nada programado el ${args.from_date}, así que no hay nada que mover.`,
            );
          }
          if (sessions.length > 1) {
            return ambiguousDay({
              athlete_name: athlete.full_name,
              iso_date: args.from_date!,
              sessions,
              what: 'la muevo',
            });
          }
          source = sessions[0]!;
        }

        let moved: { session_id: string; iso_date: string; slot: string };
        try {
          moved = await rescheduleAssignment({
            coach_id,
            athlete_id: String(args.athlete_id),
            session_id: source.assignment_id,
            to_iso_date: args.to_date,
            ...(args.to_slot ? { to_slot: args.to_slot } : {}),
          });
        } catch (err) {
          if (err instanceof AthleteDeepDiveError) {
            return fail(
              `«${source.title}» no se puede mover: o ya está hecha, o no está en estado de recolocarse. ` +
                'Solo se mueven las sesiones que siguen por hacer.',
            );
          }
          throw err;
        }

        await recordAudit(sql, {
          entity_type: 'workout_assignments',
          entity_id: BigInt(moved.session_id),
          action: 'update',
          actor: coachActor(session),
          channel: 'mcp',
          diff: {
            athlete_id: String(args.athlete_id),
            title: source.title,
            from_iso_date: source.iso_date,
            to_iso_date: moved.iso_date,
            slot: moved.slot,
          },
        });

        const visibility = await weekVisibility({
          athlete_id: args.athlete_id,
          iso_date: moved.iso_date,
        });
        return ok(
          {
            session_id: moved.session_id,
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            title: source.title,
            from_iso_date: source.iso_date,
            to_iso_date: moved.iso_date,
            slot: moved.slot,
            visibility,
          },
          moveResumen({
            athlete_name: athlete.full_name,
            title: source.title,
            from_iso: source.iso_date,
            to_iso: moved.iso_date,
            visibility,
          }),
        );
      }),
  );
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

function itemCount(blocks: ContentBlock[]): number {
  return blocks.reduce((n, b) => n + b.items.length, 0);
}

/**
 * Los tres portones seguidos, y las filas listas para escribir. Devuelve
 * `{ error }` con una frase accionable en vez de lanzar: un rechazo de dosis no es
 * una excepción, es la respuesta.
 *
 * Lo PRIMERO es normalizar (canónico + plano derivado de la estructura): a partir
 * de ahí todo — completitud, avisos, serialización y lectura de vuelta — habla de
 * `blocks`, la prescripción que de verdad se persiste. Ver la nota de
 * `write-content.ts`.
 */
async function prepareContent(params: { coach_id: bigint; blocks: ContentBlock[] }): Promise<
  | { error: string }
  | {
      blocks: NormalizedContentBlock[];
      exercises: Awaited<ReturnType<typeof resolveContentExercises>>;
      segments: ReturnType<typeof contentToSegments>;
      avisos: string[];
    }
> {
  let blocks: NormalizedContentBlock[];
  try {
    blocks = normalizeContentBlocks(params.blocks);
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  let exercises: Awaited<ReturnType<typeof resolveContentExercises>>;
  try {
    exercises = await resolveContentExercises({ coach_id: params.coach_id, blocks });
  } catch (err) {
    if (err instanceof ContentError) return { error: err.message };
    throw err;
  }

  const gate = gateContent(blocks, exercises);
  if (gate.blocking.length > 0) {
    return {
      error:
        'No he escrito nada: hay líneas que el atleta no podría ejecutar. ' +
        `${gate.blocking.join(' · ')}. Complétalas y vuelve a intentarlo.`,
    };
  }

  try {
    return {
      blocks,
      exercises,
      segments: contentToSegments(blocks, exercises),
      avisos: gate.avisos,
    };
  } catch (err) {
    if (err instanceof InvalidAuthoringLineError || err instanceof ContentError) {
      return { error: err.message };
    }
    throw err;
  }
}

/** El porqué legible de un fallo al escribir contenido, o null si no es de los nuestros. */
function contentWriteError(err: unknown): string | null {
  if (err instanceof InvalidAuthoringLineError) return err.message;
  if (err instanceof TemplateError) return err.message;
  if (err instanceof ContentError) return err.message;
  return null;
}

/**
 * Deshace una sesión recién creada cuyo contenido no se pudo escribir. Solo toca
 * los dos ids que acabamos de crear en esta misma llamada, y ambos con su dueño en
 * el WHERE. Los segmentos de la instancia caen por cascada.
 */
async function rollbackCreatedSession(params: {
  coach_id: bigint;
  athlete_id: number;
  assignment_id: number;
  template_id: number;
}): Promise<void> {
  await sql`
    delete from workout_assignments
    where id = ${params.assignment_id} and athlete_id = ${params.athlete_id}
  `;
  await sql`
    delete from templates
    where id = ${params.template_id}
      and coach_id = ${Number(params.coach_id)}
      and instance_athlete_id = ${params.athlete_id}
  `;
}

/** Las sesiones de un día, por el mismo camino que las lee `get_session`. */
async function sessionsOnDate(params: {
  coach_id: bigint;
  athlete_id: number;
  iso_date: string;
}): Promise<PlanSession[]> {
  const plan = await buildAthletePlan({
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    view_mode: 'week',
    anchor_iso: params.iso_date,
  });
  return plan.weeks[0]?.days.find((d) => d.iso_date === params.iso_date)?.sessions ?? [];
}

/**
 * Una sesión por id, con su fecha y su nombre — lo que hace falta para contar de
 * dónde sale al moverla. Scoped al atleta Y al coach: la de otro club se responde
 * igual que una que no existe.
 */
async function findSessionById(params: {
  coach_id: bigint;
  athlete_id: number;
  assignment_id: number;
}): Promise<PlanSession | undefined> {
  const rows = await sql<
    Array<{ id: string; iso: string; title: string; status: string; format: string | null }>
  >`
    select wa.id::text as id,
           to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso,
           t.name as title,
           wa.status::text as status,
           t.format::text as format
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id
    left join templates t on t.id = wa.template_id
    where wa.id = ${params.assignment_id}
      and wa.athlete_id = ${params.athlete_id}
      and a.coach_id = ${Number(params.coach_id)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    assignment_id: row.id,
    iso_date: row.iso,
    title: row.title ?? 'Entreno',
    status: row.status as PlanSession['status'],
    duration_min: null,
    format: row.format,
    rpe: null,
    // Este lector va por assignment_id y no baja a los segmentos: null = «no se
    // sabe» (quien la necesite pide el plan, que sí la resuelve).
    modality: null,
  };
}

/**
 * El contenido actual de una sesión, en la MISMA forma que acepta la escritura —
 * más la dosis escrita de cada línea, para que el asistente pueda decirle al coach
 * lo que hay hoy sin interpretar la gramática por su cuenta.
 */
function snapshotBlocks(
  blocks: Array<{
    title: string;
    format: string | null;
    items: Array<{
      exercise_id: number | null;
      exercise_name: string;
      prescription: Prescription;
      notes?: string | undefined;
    }>;
  }>,
): Array<Record<string, unknown>> {
  return blocks.map((block) => ({
    title: block.title,
    format: block.format,
    items: block.items.map((item) => ({
      exercise_id: item.exercise_id,
      exercise_name: item.exercise_name,
      prescription: item.prescription,
      dose: prescriptionToText(item.prescription).trim() || null,
      ...(item.notes ? { notes: item.notes } : {}),
    })),
  }));
}
