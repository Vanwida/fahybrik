// Las escrituras del día: crear, cambiar, mover, quitar una sesión y dejar el
// día en descanso.
//
// Pasan por las MISMAS funciones que el panel: `createDaySession` +
// `updateAthleteInstanceDay` para el contenido, `rescheduleAssignment` para la
// fecha, y `clearAthleteSessionScheduled` / `clearAthleteDayScheduled` para
// quitar. Ni una consulta paralela, así que el conector no puede divergir del panel.
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
import type { PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import { createDaySession, DaySessionError } from '@/lib/dashboard/coach/day-sessions';
import { loadAthleteDayEditor } from '@/lib/dashboard/coach/athlete-day-editor';
import { updateAthleteInstanceDay } from '@/lib/dashboard/coach/template-instance';
import { AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { PLAN_SLOT, rescheduleAssignment } from '@/lib/coach/deep-dive-plan';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  resolveOwnedAthlete,
  withCoach,
} from './runtime';
import { contentBlocksArg, contentGrammar, contentReadback, sessionFormatFor } from './write-content';
import {
  contentWriteError,
  itemCount,
  prepareContent,
  rollbackCreatedSession,
  snapshotBlocks,
} from './write-prepare';
import { moveResumen, weekVisibility, writeResumen } from './shape-write';
import { registerClearWriteTools } from './tools-write-clear';
import { ambiguousDay, findSessionById, sessionIdArg, sessionsOnDate } from './write-resolve';

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
              dose_lines: [],
              dose_more: 0,
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

  registerClearWriteTools(server);
}
