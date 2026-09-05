// Asignar un microciclo de biblioteca al calendario de UN atleta.
//
// Es el espejo de POST /api/coach/athletes/[id]/assign-month: la misma
// `assignMonthToAthlete` y el mismo staggered `markFutureWeeksDraft`. No toca
// la receta de biblioteca ni a otros atletas.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '@/lib/db';
import { notifyAthlete } from '@/lib/notifications/dispatch';
import { planPublishedPush } from '@/lib/notifications/plan-published';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import {
  AssignMonthError,
  assignMonthToAthlete,
} from '@/lib/dashboard/programming/assign-month';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  resolveOwnedAthlete,
  withCoach,
} from './runtime';

export function registerAssignTools(server: McpServer): void {
  server.registerTool(
    'assign_microcycle',
    {
      title: 'Asignar un microciclo a un atleta',
      description:
        'Asigna un microciclo de la BIBLIOTECA al calendario de UN atleta, a partir de una fecha. Es el mismo acto que «asignar mes» del panel: materializa las sesiones y deja las semanas siguientes en borrador para que se le abran solas. No cambia la receta. No toca a otros atletas.',
      inputSchema: {
        athlete_id: athleteIdArg,
        microcycle_id: z
          .number()
          .int()
          .positive()
          .describe('El microciclo de biblioteca. Búscalo con search_library.'),
        start: isoDateArg.describe(
          'El día en que empieza (AAAA-MM-DD). Se ancla solo al lunes de esa semana.',
        ),
        start_week_number: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'Semana del plan (1 = desde el principio) por la que entra este atleta. Sin esto, la 1.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        let result: Awaited<ReturnType<typeof assignMonthToAthlete>>;
        try {
          result = await assignMonthToAthlete({
            coach_id,
            athlete_id: args.athlete_id,
            month_template_id: args.microcycle_id,
            start_date: args.start,
            start_week_number: args.start_week_number,
          });
        } catch (err) {
          if (err instanceof AssignMonthError) {
            return fail(
              err.code === 'not_found'
                ? err.message.includes('Athlete')
                  ? NO_SUCH_ATHLETE_MESSAGE
                  : 'No encuentro ese microciclo en tu biblioteca.'
                : err.message,
            );
          }
          throw err;
        }

        await markFutureWeeksDraft({
          coach_id,
          athlete_id: args.athlete_id,
          start_date: result.start_date,
          week_count: result.microcycle_ids.length,
        });

        if (result.assignment_count > 0) {
          await notifyAthlete({
            sql,
            athlete_id: BigInt(args.athlete_id),
            type: 'plan_published',
            payload: {
              athlete_id: args.athlete_id,
              week_start: result.start_date,
              deep_link: `/plan?week=${result.start_date}`,
            },
            push: {
              ...(await planPublishedPush(sql, BigInt(args.athlete_id), 'assigned')),
              deeplink: { screen: 'plan', week_start: result.start_date },
            },
          }).catch(() => undefined);
        }

        return ok(
          {
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            microcycle_id: String(args.microcycle_id),
            month_assignment_id: result.month_assignment_id,
            start_date: result.start_date,
            end_date: result.end_date,
            assignment_count: result.assignment_count,
            week_count: result.microcycle_ids.length,
          },
          `${athlete.full_name}: asignado el microciclo del ${result.start_date} al ${result.end_date} ` +
            `(${result.assignment_count} ${result.assignment_count === 1 ? 'sesión' : 'sesiones'}).`,
        );
      }),
  );
}
