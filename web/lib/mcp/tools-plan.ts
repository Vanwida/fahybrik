// El plan del atleta y el detalle de una sesión.
//
// Estas dos tools se encadenan: `get_plan` con vista de semana devuelve, por día,
// el `assignment_id` de cada sesión con su estado y de qué va; `get_session` coge
// ese id —o directamente una FECHA, que es como habla un entrenador— y devuelve el
// prescrito contra el ejecutado, tramo a tramo, con el veredicto de cada uno.
//
// POR QUÉ `get_session` ACEPTA FECHA. Un coach no dice «enséñame la asignación
// 41827», dice «¿cómo le fue el martes?». Si la tool solo aceptara ids, el
// asistente tendría que pedir el plan entero antes de cada pregunta y, cuando hay
// doble sesión, elegiría una de las dos a ciegas. Con fecha: si hay una, el
// detalle; si hay varias, la lista corta para que el cliente pregunte cuál;
// si no hay ninguna, se dice, y eso no es un error — es la respuesta.
//
// TENANCY. `buildAthletePlan` y `loadCoachSessionDetail` resuelven el atleta
// contra el `coach_id` del token DENTRO de su consulta, y un atleta ajeno se
// responde igual que uno inexistente (ver `runtime.ts`).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '@/lib/db';
import { buildAthletePlan, type PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import { loadCoachSessionDetail } from '@/lib/coach/session-detail';
import { loadSessionContentSummaries } from '@/lib/coach/session-content';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  withCoach,
} from './runtime';
import {
  planResumen,
  sessionChoiceResumen,
  sessionResumen,
  toPlanMacro,
  toPlanMonth,
  toPlanWeek,
  toSessionChoice,
  toSessionDetail,
} from './shape-plan';

const PLAN_VIEWS = ['macro', 'month', 'week'] as const;

export function registerPlanTools(server: McpServer): void {
  server.registerTool(
    'get_plan',
    {
      title: 'El plan del atleta',
      description:
        'El plan del atleta: el macro entero, un mes o una semana concreta con sus sesiones. La semana trae cada día con lo que tiene puesto, su estado y de qué va, más el session_id para pedir el detalle con get_session. Dice también si el atleta ya lo ve en su app o sigue en borrador.',
      inputSchema: {
        athlete_id: athleteIdArg,
        view: z
          .enum(PLAN_VIEWS)
          .describe(
            'macro = el plan completo por semanas y tramos; month = el microciclo asignado día a día; week = una semana concreta con el detalle de cada día.',
          ),
        anchor: isoDateArg
          .optional()
          .describe(
            'Un día cualquiera dentro de la semana o el mes que quieres ver. Sin esto, hoy. La respuesta dice siempre qué tramo de fechas devuelve.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const plan = await buildAthletePlan({
          coach_id,
          athlete_id: args.athlete_id,
          view_mode: args.view,
          anchor_iso: args.anchor,
        });

        if (args.view === 'macro') return ok({ plan: toPlanMacro(plan) }, planResumen(plan));
        if (args.view === 'month') return ok({ plan: toPlanMonth(plan) }, planResumen(plan));

        // Solo la semana lleva contenido por sesión: es la vista en la que el coach
        // decide, y son pocas sesiones. Una consulta para todas.
        const contents = await loadSessionContentSummaries({
          sql,
          coach_id,
          athlete_id: args.athlete_id,
          assignment_ids: sessionsOf(plan).map((s) => s.assignment_id),
        });
        return ok({ plan: toPlanWeek(plan, contents) }, planResumen(plan));
      }),
  );

  server.registerTool(
    'get_session',
    {
      title: 'Una sesión, prescrita contra ejecutada',
      description:
        'Una sesión concreta al detalle: lo que le pusiste (bloques, dosis, la banda de ritmo o los kg que le tocaban a ÉL) contra lo que hizo de verdad, tramo a tramo, con el veredicto de cada tramo y el tiempo, el RPE y las molestias que reportó. Pídela por fecha (como habla el coach) o por session_id. Si ese día tiene dos sesiones, devuelve la lista corta para que elijas.',
      inputSchema: {
        athlete_id: athleteIdArg,
        date: isoDateArg
          .optional()
          .describe('El día de la sesión (AAAA-MM-DD). Úsalo cuando el coach hable en fechas.'),
        session_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('El session_id / assignment_id que devuelve get_plan. Manda sobre la fecha.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        if (args.session_id == null && args.date == null) {
          return fail(
            'Dime de qué sesión hablamos: pásame la fecha (date, en formato AAAA-MM-DD) o el session_id que devuelve get_plan.',
          );
        }

        // Un id explícito no se discute: si además viene una fecha y no cuadran,
        // manda el id (y la respuesta lleva la fecha real de esa sesión).
        if (args.session_id != null) {
          return detailAnswer({
            coach_id,
            athlete_id: args.athlete_id,
            assignment_id: args.session_id,
          });
        }

        const plan = await buildAthletePlan({
          coach_id,
          athlete_id: args.athlete_id,
          view_mode: 'week',
          anchor_iso: args.date!,
        });
        const day = plan.weeks[0]?.days.find((d) => d.iso_date === args.date);
        const sessions = day?.sessions ?? [];

        if (sessions.length === 0) {
          // No es un fallo: es que ese día no tiene nada puesto.
          return ok(
            {
              athlete_id: plan.athlete_id,
              athlete_name: plan.athlete_name,
              iso_date: args.date,
              sessions: [],
            },
            `${plan.athlete_name} no tiene nada programado el ${args.date}.`,
          );
        }

        if (sessions.length === 1) {
          return detailAnswer({
            coach_id,
            athlete_id: args.athlete_id,
            assignment_id: Number(sessions[0]!.assignment_id),
          });
        }

        const contents = await loadSessionContentSummaries({
          sql,
          coach_id,
          athlete_id: args.athlete_id,
          assignment_ids: sessions.map((s) => s.assignment_id),
        });
        return ok(
          {
            athlete_id: plan.athlete_id,
            athlete_name: plan.athlete_name,
            iso_date: args.date,
            sessions: sessions.map((s) => toSessionChoice(s, contents.get(s.assignment_id))),
          },
          sessionChoiceResumen(plan.athlete_name, args.date!, sessions.length),
        );
      }),
  );
}

/** Todas las sesiones del tramo devuelto, en orden. */
function sessionsOf(plan: { weeks: Array<{ days: Array<{ sessions: PlanSession[] }> }> }): PlanSession[] {
  return plan.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions));
}

/**
 * El detalle de UNA sesión. Los dos rechazos se dicen distinto a propósito: si el
 * atleta no es suyo, el asistente tiene que volver a `list_athletes`; si es suyo
 * pero el id de sesión no existe, a `get_plan`. Un mismo «no encontrado» para los
 * dos casos le haría insistir con el id equivocado.
 */
async function detailAnswer(params: {
  coach_id: bigint;
  athlete_id: number;
  assignment_id: number;
}) {
  const result = await loadCoachSessionDetail({
    sql,
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
    assignment_id: params.assignment_id,
  });

  if (!result.ok) {
    return result.reason === 'athlete_not_found'
      ? fail(NO_SUCH_ATHLETE_MESSAGE)
      : fail(
          'Ese atleta no tiene ninguna sesión con ese identificador. Pide su semana con get_plan y usa el session_id que salga ahí.',
        );
  }

  return ok(
    { session: toSessionDetail(result.session) },
    sessionResumen(result.athlete_name, result.session),
  );
}
