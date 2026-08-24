// Receta de biblioteca, entera: crear o reescribir un microciclo desde JSON.
//
// ESCRIBE SIEMPRE EN RECETA (`program_month_templates` / `program_week_templates`),
// nunca en lo entregado (`workout_assignments`). El cascarón es el mismo del
// botón de Biblioteca (`createMonthTemplateWithEmptyWeeks`). El contenido pasa
// por las TRES PUERTAS del día MCP y se persiste con serializeDay + upsert —
// ver `microcycle-write.ts`. V1: solo biblioteca. No publica.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  MICROCICLO_ABSOLUTE_MAX_WEEKS,
  MICROCICLO_MIN_WEEKS,
} from '@fahybrid/shared/domain/coach/program-months';
import { sql } from '@/lib/db';
import { coachActor, recordAudit } from '@/lib/audit/record-edit';
import {
  ProgramMonthError,
  createMonthTemplateWithEmptyWeeks,
  deleteMonthTemplate,
  loadMonthTemplateWithWeeks,
} from '@/lib/dashboard/coach/program-months';
import { ProgramWeekError } from '@/lib/dashboard/coach/program-weeks';
import { resyncWeekTemplateAssignments } from '@/lib/dashboard/coach/instantiate-program';
import { InvalidAuthoringLineError } from '@/lib/dashboard/v2/editor-serialize';
import { fail, ok, withCoach } from './runtime';
import { ContentError, contentBlocksArg, contentGrammar, contentReadback } from './write-content';
import {
  WEEKDAY_NAMES,
  itemCount,
  persistPreparedWeeks,
  prepareWeeksContent,
  trainingDayCount,
  type PreparedContent,
} from './microcycle-write';

const weekdayArg = z
  .number()
  .int()
  .min(1)
  .max(7)
  .describe('Día de la semana: 1 = lunes … 7 = domingo.');

const dayArg = z.object({
  weekday: weekdayArg,
  title: z
    .string()
    .min(1)
    .max(120)
    .describe(
      'El nombre del ENTRENO que lee el atleta: «Fuerza tren superior + core», «Test running 3′+9′». NO es el nombre del primer bloque. Un calentamiento se llama «Calentamiento» en su bloque; este campo es el de la sesión entera.',
    ),
  blocks: contentBlocksArg.describe(
    'Los bloques de ESE día, en el orden en que se hacen. Misma forma que create_session. El título de cada bloque es de ESE bloque («Calentamiento», «Bloque A · Tracción»), nunca el del entreno.',
  ),
});

const weekArg = z
  .object({
    focus: z
      .string()
      .max(200)
      .optional()
      .describe('Foco de esa semana. Sin esto se queda el que tenía (o vacío al crear).'),
    days: z
      .array(dayArg)
      .max(7)
      .describe('Los días de entreno de esa semana. Un día omitido queda en descanso al crear.'),
  })
  .superRefine((week, ctx) => {
    const seen = new Set<number>();
    for (const day of week.days) {
      if (seen.has(day.weekday)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El ${WEEKDAY_NAMES[day.weekday]} está repetido en la misma semana.`,
        });
      }
      seen.add(day.weekday);
    }
  });

// El `.max()` de aquí es el techo ABSOLUTO del sistema (26), no el del coach —
// un zod estático no puede saber quién es (card 135). El tope REAL de este
// coach (`coaches.max_microcycle_weeks`) lo comprueba `createMonthTemplateWithEmptyWeeks`,
// que es por donde escribe `create_microcycle` más abajo — misma puerta, sin duplicar el check.
const weeksArg = z
  .array(weekArg)
  .min(MICROCICLO_MIN_WEEKS)
  .max(MICROCICLO_ABSOLUTE_MAX_WEEKS)
  .describe(
    `Las semanas del microciclo, en orden (de ${MICROCICLO_MIN_WEEKS} a ${MICROCICLO_ABSOLUTE_MAX_WEEKS}). Al actualizar tienen que ser las mismas que ya tiene.`,
  );

function recipeReadback(prepared: PreparedContent) {
  return prepared.weeks.map((week, i) => ({
    week_index: i,
    focus: week.focus ?? null,
    days: week.days.map((day) => ({
      weekday: day.weekday,
      title: day.title,
      blocks: contentReadback(day.blocks, prepared.exercises),
    })),
  }));
}

function writeErrorMessage(err: unknown): string | null {
  if (err instanceof InvalidAuthoringLineError) return err.message;
  if (err instanceof ProgramMonthError) return err.message;
  if (err instanceof ProgramWeekError) return err.message;
  if (err instanceof ContentError) return err.message;
  return null;
}

export function registerMicrocycleTools(server: McpServer): void {
  server.registerTool(
    'create_microcycle',
    {
      title: 'Crear un microciclo de biblioteca',
      description:
        'Crea un microciclo NUEVO en la BIBLIOTECA (la receta, no el calendario de un atleta): nombre, nivel y las semanas con sus días. Cada día lleva TÍTULO del entreno + los mismos bloques tipados que create_session (el título del día NO es el del primer bloque). No publica ni asigna a nadie. Si alguna línea no se podría ejecutar, no crea nada.\n\n' +
        contentGrammar(),
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(200)
          .describe('Cómo se llama el microciclo en la biblioteca: «Base 4 semanas», «Específico 2».'),
        // OPCIONAL (card 137). Era obligatorio y bloqueó la primera importación
        // real de un ciclo por aquí: el contenido pasó entero y lo tumbó este
        // campo, que además ninguna herramienta de lectura sabe entregar. Los
        // niveles son la forma de organizarse de ALGUNOS entrenadores; quien no
        // los use crea sus bloques sin nivel, como ya hacen 3 de los 11 que hay.
        // Para descubrirlos: `search_library` con kind 'level'.
        level_id: z
          .number()
          .int()
          .positive()
          .nullish()
          .describe(
            'OPCIONAL. El nivel al que cuelga este microciclo, si el entrenador organiza por niveles. Búscalos con search_library (kind: "level"). Si no usa niveles, no lo mandes.',
          ),
        weeks: weeksArg,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _name, session) => {
        const prepared = await prepareWeeksContent({ coach_id, weeks: args.weeks });
        if ('error' in prepared) return fail(prepared.error);

        const coachId = Number(coach_id);
        let monthId = '';
        try {
          await sql.begin(async (tx) => {
            const created = await createMonthTemplateWithEmptyWeeks({
              coach_id,
              payload: {
                name: args.name,
                level_id: args.level_id,
                week_count: args.weeks.length,
              },
              client: tx,
            });
            monthId = created.id;
            const loaded = await loadMonthTemplateWithWeeks({
              coach_id,
              month_id: Number(created.id),
              client: tx,
            });
            if (!loaded) {
              throw new ProgramMonthError(
                'not_found',
                'No se pudo cargar el microciclo recién creado.',
                500,
              );
            }
            await persistPreparedWeeks({
              coach_id: coachId,
              month: loaded,
              prepared,
              client: tx,
            });
            await recordAudit(tx, {
              entity_type: 'program_month_templates',
              entity_id: BigInt(created.id),
              action: 'create',
              actor: coachActor(session),
              channel: 'mcp',
              diff: {
                name: args.name,
                level_id: args.level_id,
                week_count: args.weeks.length,
                training_days: trainingDayCount(prepared.weeks),
                item_count: args.weeks.reduce(
                  (n, w) => n + w.days.reduce((m, d) => m + itemCount(d.blocks), 0),
                  0,
                ),
              },
            });
          });
        } catch (err) {
          const why = writeErrorMessage(err);
          if (why) return fail(`No he creado el microciclo: ${why}`);
          throw err;
        }

        const days = trainingDayCount(prepared.weeks);
        const loaded = await loadMonthTemplateWithWeeks({
          coach_id,
          month_id: Number(monthId),
        });
        return ok(
          {
            microcycle_id: monthId,
            name: args.name,
            week_count: args.weeks.length,
            weeks: (loaded?.weeks ?? []).map((week, i) => ({
              week_template_id: week.id,
              week_index: week.week_index,
              focus: week.focus,
              days: recipeReadback(prepared)[i]?.days ?? [],
            })),
            avisos: prepared.avisos,
          },
          `Biblioteca · «${args.name}» creado (${args.weeks.length} ${args.weeks.length === 1 ? 'semana' : 'semanas'}, ${days} ${days === 1 ? 'día' : 'días'} de entreno). No está asignado a nadie ni publicado.`,
        );
      }),
  );

  server.registerTool(
    'update_microcycle',
    {
      title: 'Editar un microciclo de biblioteca',
      description:
        'Reescribe los días de un microciclo de BIBLIOTECA que ya existe. Cada día lleva TÍTULO del entreno + los mismos bloques tipados que create_session. Si el microciclo ya está asignado a atletas, las sesiones que siguen por hacer se actualizan; las ya entrenadas no se tocan. No publica. Un plan personal (de un atleta concreto) no se edita con esta tool.\n\n' +
        contentGrammar(),
      inputSchema: {
        microcycle_id: z
          .number()
          .int()
          .positive()
          .describe('El id del microciclo de biblioteca (program_month_templates).'),
        name: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe('Cambia también el nombre. Sin esto se queda el que tenía.'),
        weeks: weeksArg,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _name, session) => {
        const existing = await loadMonthTemplateWithWeeks({
          coach_id,
          month_id: args.microcycle_id,
        });
        if (!existing) {
          return fail(
            'No hay ningún microciclo tuyo con ese identificador. Es de la biblioteca, no un plan personal.',
          );
        }
        if (existing.month.athlete_id != null) {
          return fail(
            'Ese microciclo es un plan personal de un atleta. Esta tool solo escribe recetas de biblioteca.',
          );
        }
        if (args.weeks.length !== existing.weeks.length) {
          return fail(
            `Este microciclo tiene ${existing.weeks.length} semanas; el JSON trae ${args.weeks.length}. Esta tool no añade ni quita semanas.`,
          );
        }

        const prepared = await prepareWeeksContent({ coach_id, weeks: args.weeks });
        if ('error' in prepared) return fail(prepared.error);

        const coachId = Number(coach_id);
        const name = args.name ?? existing.month.name;
        try {
          await sql.begin(async (tx) => {
            if (args.name) {
              await tx`
                update program_month_templates
                set name = ${args.name}
                where id = ${args.microcycle_id}
                  and coach_id = ${coachId}
                  and athlete_id is null
              `;
            }
            const loaded = await loadMonthTemplateWithWeeks({
              coach_id,
              month_id: args.microcycle_id,
              client: tx,
            });
            if (!loaded) {
              throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
            }
            await persistPreparedWeeks({
              coach_id: coachId,
              month: loaded,
              prepared,
              client: tx,
            });
            await recordAudit(tx, {
              entity_type: 'program_month_templates',
              entity_id: BigInt(args.microcycle_id),
              action: 'update',
              actor: coachActor(session),
              channel: 'mcp',
              diff: {
                name,
                week_count: args.weeks.length,
                training_days: trainingDayCount(prepared.weeks),
              },
            });
          });
        } catch (err) {
          const why = writeErrorMessage(err);
          if (why) return fail(`No he cambiado nada: ${why}`);
          throw err;
        }

        let microcycles_checked = 0;
        let assignments_resynced = 0;
        for (const week of existing.weeks) {
          const resync = await resyncWeekTemplateAssignments({
            coach_id,
            week_template_id: Number(week.id),
          });
          microcycles_checked += resync.microcycles_checked;
          assignments_resynced += resync.assignments_resynced;
        }

        const days = trainingDayCount(prepared.weeks);
        const resyncBit =
          microcycles_checked === 0
            ? 'Nadie lo tenía asignado; solo ha cambiado la receta.'
            : `${assignments_resynced} ${assignments_resynced === 1 ? 'sesión por hacer actualizada' : 'sesiones por hacer actualizadas'}; las ya entrenadas no se tocan.`;

        return ok(
          {
            microcycle_id: String(args.microcycle_id),
            name,
            week_count: existing.weeks.length,
            weeks: existing.weeks.map((week, i) => ({
              week_template_id: week.id,
              week_index: week.week_index,
              focus: prepared.weeks[i]?.focus ?? week.focus,
              days: recipeReadback(prepared)[i]?.days ?? [],
            })),
            avisos: prepared.avisos,
            resync: { microcycles_checked, assignments_resynced },
          },
          `Biblioteca · «${name}» actualizado (${days} ${days === 1 ? 'día' : 'días'} de entreno). ${resyncBit}`,
        );
      }),
  );

  // BORRAR UN MICROCICLO DE BIBLIOTECA (card 139).
  //
  // POR QUÉ HACE FALTA: crear por aquí es TODO O NADA —una línea mal tumba el
  // lote— pero lo que sí entraba se quedaba para siempre, porque no había forma
  // de deshacerlo desde el asistente. Cada intento a medias dejaba basura
  // permanente en la biblioteca del entrenador, y eso encarece justo lo que hay
  // que poder hacer barato: probar.
  //
  // El borrado en sí YA EXISTÍA (es el mismo del botón del panel, con sus
  // guardas); lo que faltaba era poder pedirlo. Se reusa tal cual, sin relajar
  // ninguna: se niega si el microciclo forma parte de una secuencia, y sólo
  // toca los del propio entrenador.
  //
  // Sólo BIBLIOTECA. Un plan personal cuelga de una cadena con fechas y un
  // atleta detrás: sacarle un tramo de en medio es otra operación, con otras
  // consecuencias, y tiene su propio camino en el panel.
  server.registerTool(
    'delete_microcycle',
    {
      title: 'Borrar un microciclo de biblioteca',
      description:
        'Borra un microciclo de la BIBLIOTECA del entrenador, con sus semanas. Sólo los suyos y sólo los de biblioteca: un plan personal de un atleta no se toca desde aquí. Se niega si el microciclo forma parte de una secuencia (nivel × días). Es IRREVERSIBLE: confirma con el entrenador antes de usarla.',
      inputSchema: {
        microcycle_id: z
          .number()
          .int()
          .positive()
          .describe('El microciclo de biblioteca que se borra. Búscalo con search_library.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _name, session) => {
        // Se lee ANTES de borrar para poder decir QUÉ se ha borrado. Después ya
        // no hay a quién preguntárselo, y «borrado el 41» no le dice nada a
        // nadie.
        let nombre: string;
        let semanas: number;
        try {
          const loaded = await loadMonthTemplateWithWeeks({ coach_id, month_id: args.microcycle_id });
          if (!loaded) return fail('No encuentro ese microciclo en tu biblioteca.');
          nombre = loaded.month.name;
          semanas = loaded.weeks.length;
        } catch (err) {
          const why = writeErrorMessage(err);
          return fail(why ? `No he podido leerlo: ${why}` : 'No he podido leer ese microciclo.');
        }

        try {
          await sql.begin(async (tx) => {
            await deleteMonthTemplate({ coach_id, month_id: args.microcycle_id, client: tx });
            await recordAudit(tx, {
              entity_type: 'program_month_templates',
              entity_id: BigInt(args.microcycle_id),
              action: 'delete',
              actor: coachActor(session),
              channel: 'mcp',
              diff: { name: nombre, week_count: semanas },
            });
          });
        } catch (err) {
          const why = writeErrorMessage(err);
          return fail(why ? `No lo he borrado: ${why}` : 'No he podido borrar ese microciclo.');
        }

        return ok(
          { microcycle_id: String(args.microcycle_id), name: nombre, week_count: semanas },
          `Biblioteca · «${nombre}» borrado (${semanas} ${semanas === 1 ? 'semana' : 'semanas'}).`,
        );
      }),
  );
}
