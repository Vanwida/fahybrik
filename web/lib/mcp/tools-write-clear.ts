// Quitar una sesión o dejar el día en descanso. Las dos primitivas de FH-79,
// habladas desde el conector: `clearAthleteSessionScheduled` y
// `clearAthleteDayScheduled`. El panel ya las usa en el PATCH del día; aquí no
// hay un segundo modelo.
//
// Solo PENDING (`scheduled`, origin coach). Una ya entrenada no se toca: el
// historial se queda. Si al quitar una sesión el día se queda sin pendientes,
// el día es descanso (`kind: 'rest'`, `sessions: []`).
//
// El día ambiguo es el de `move_session` / `edit_day`: dos sesiones y sin
// session_id → se listan y no se muta nada.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { coachActor } from '@/lib/audit/record-edit';
import {
  clearAthleteDayScheduled,
  clearAthleteSessionScheduled,
  DaySessionError,
} from '@/lib/dashboard/coach/day-sessions';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  resolveOwnedAthlete,
  withCoach,
} from './runtime';
import { deleteResumen, restDayResumen, weekVisibility } from './shape-write';
import {
  ambiguousDay,
  findSessionById,
  isPendingSession,
  sessionIdArg,
  sessionsOnDate,
} from './write-resolve';

const EXECUTED_MESSAGE =
  'Esa sesión ya está entrenada: no se quita. El historial se queda. ' +
  'Solo se pueden quitar las que siguen por hacer.';

export function registerClearWriteTools(server: McpServer): void {
  // ── delete_session ─────────────────────────────────────────────────────────
  server.registerTool(
    'delete_session',
    {
      title: 'Quitar una sesión del plan',
      description:
        'Quita una sesión PENDIENTE del plan de un atleta. Dile la sesión por session_id o por la fecha (si ese día tiene dos, te pide cuál y no toca nada). Es IRREVERSIBLE: la sesión desaparece del plan; confirma con el entrenador antes de usarla. Una ya entrenada no se toca. Si el día se queda sin sesiones por hacer, queda en descanso.',
      inputSchema: {
        athlete_id: athleteIdArg,
        session_id: sessionIdArg
          .optional()
          .describe('La sesión que se quita. Manda sobre date.'),
        date: isoDateArg
          .optional()
          .describe('El día de la sesión (AAAA-MM-DD), como habla el coach.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        if (args.session_id == null && args.date == null) {
          return fail(
            'Dime qué sesión quitar: pásame el session_id que devuelve get_plan o la fecha (date).',
          );
        }

        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        let source: Awaited<ReturnType<typeof findSessionById>>;
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
          const onDate = await sessionsOnDate({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.date!,
          });
          if (onDate.length === 0) {
            return fail(
              `${athlete.full_name} no tiene nada programado el ${args.date}, así que no hay nada que quitar.`,
            );
          }
          if (onDate.length > 1) {
            return ambiguousDay({
              athlete_name: athlete.full_name,
              iso_date: args.date!,
              sessions: onDate,
              what: 'la quito',
            });
          }
          source = onDate[0]!;
        }

        if (!isPendingSession(source)) {
          return fail(EXECUTED_MESSAGE);
        }

        try {
          await clearAthleteSessionScheduled({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: source.iso_date,
            assignment_id: Number(source.assignment_id),
            actor: coachActor(session),
            channel: 'mcp',
          });
        } catch (err) {
          if (err instanceof DaySessionError) {
            if (err.code === 'not_pending') return fail(EXECUTED_MESSAGE);
            return fail(err.message);
          }
          throw err;
        }

        const remaining = await sessionsOnDate({
          coach_id,
          athlete_id: args.athlete_id,
          iso_date: source.iso_date,
        });
        const pendingLeft = remaining.filter(isPendingSession);
        const dayIsRest = pendingLeft.length === 0;
        const visibility = await weekVisibility({
          athlete_id: args.athlete_id,
          iso_date: source.iso_date,
        });

        return ok(
          {
            session_id: source.assignment_id,
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            iso_date: source.iso_date,
            title: source.title,
            kind: dayIsRest ? 'rest' : 'workout',
            sessions: pendingLeft.map((s) => ({
              session_id: s.assignment_id,
              title: s.title,
              status: s.status,
            })),
            visibility,
          },
          deleteResumen({
            athlete_name: athlete.full_name,
            title: source.title,
            iso_date: source.iso_date,
            dayIsRest,
            visibility,
          }),
        );
      }),
  );

  // ── set_rest_day ───────────────────────────────────────────────────────────
  server.registerTool(
    'set_rest_day',
    {
      title: 'Dejar un día en descanso',
      description:
        'Deja un día en DESCANSO: quita todas las sesiones pendientes de ese día (`kind: rest`, sin sesiones). Es IRREVERSIBLE para lo que quita: confirma con el entrenador antes de usarla. Las ya entrenadas no se tocan. Un día que ya no tiene nada pendiente no se vuelve a vaciar.',
      inputSchema: {
        athlete_id: athleteIdArg,
        date: isoDateArg.describe('El día que queda en descanso (AAAA-MM-DD).'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        let cleared: number;
        try {
          const result = await clearAthleteDayScheduled({
            coach_id,
            athlete_id: args.athlete_id,
            iso_date: args.date,
            actor: coachActor(session),
            channel: 'mcp',
          });
          cleared = result.cleared;
        } catch (err) {
          if (err instanceof DaySessionError) return fail(err.message);
          throw err;
        }

        const visibility = await weekVisibility({
          athlete_id: args.athlete_id,
          iso_date: args.date,
        });
        return ok(
          {
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            iso_date: args.date,
            kind: 'rest',
            sessions: [],
            cleared,
            visibility,
          },
          restDayResumen({
            athlete_name: athlete.full_name,
            iso_date: args.date,
            cleared,
            visibility,
          }),
        );
      }),
  );
}
