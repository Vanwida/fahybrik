// The coach's read tools — phase 1 of the connector (docs/mcp-conector-coach.html).
//
// Each tool is a thin mouth over a function the dashboard already calls, reached
// WITHOUT an HTTP hop: `lib/coach/*` takes `{ coach_id, … }` and is consumed
// directly by RSC pages today. So the connector and the dashboard cannot drift
// apart, because there is only one implementation to drift.
//
// TENANCY. No tool ever trusts an id from the client as a scope. The `coach_id`
// comes from the OAuth token on every single call (`coachFromAuthInfo`), and the
// libraries take it INSIDE their WHERE clauses — `buildAthleteDeepDive` resolves
// the athlete against the coach in `loadHeader` and throws 'forbidden' rather
// than returning a row, which is why `get_athlete` can honestly answer "no
// existe" for another club's athlete without leaking that it does.
//
// NAMING. Tool names are English (the MCP convention every client's UI assumes);
// descriptions are the Spanish a coach speaks, because the description is what
// the assistant reads to decide whether this is the tool for what he just asked.
// A description written in schema-speak gets the wrong tool called.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { buildCohort } from '@/lib/coach/cohort';
import { buildBriefing } from '@/lib/coach/briefing';
import { buildAthleteDeepDive, AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { countUnreadForCoach } from '@/lib/chat/service';
import { McpNotACoachError, coachFromAuthInfo } from './auth';
import {
  athleteResumen,
  athletesResumen,
  briefingResumen,
  toAthleteDetail,
  toAthleteSummary,
} from './shape';

/** The plan an athlete is on. Matches `subscriptions.plan_type` exactly. */
const MODALITY = ['individual', 'dobles', 'pro_elite'] as const;

/**
 * Every answer is JSON plus `_resumen`, the one line a person would have said.
 * `structuredContent` carries the same object so a client that understands it
 * gets the data typed instead of re-parsing a string out of the text block.
 */
function ok(payload: Record<string, unknown>, resumen: string): CallToolResult {
  const body = { _resumen: resumen, ...payload };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}

/**
 * A refusal the assistant can read out loud and act on. `isError` is what stops
 * it from treating the sentence as data and telling the coach his athlete has a
 * readiness of "no encontrado".
 */
function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Runs a tool body with the coach resolved from the token, turning the two
 * expected refusals into readable text instead of a stack trace: not a coach,
 * and an athlete that is not his. Anything else rethrows — a DB outage must not
 * be dressed up as a clean answer.
 */
async function withCoach(
  authInfo: AuthInfo | undefined,
  body: (coach_id: bigint, coach_name: string) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    const coach = await coachFromAuthInfo(authInfo);
    return await body(coach.coach_id, coach.full_name);
  } catch (err) {
    if (err instanceof McpNotACoachError) return fail(err.message);
    if (err instanceof AthleteDeepDiveError) {
      // 'forbidden' (another club's athlete) is answered exactly like
      // 'not_found', same as the dashboard API: confirming that an id exists
      // somewhere else is itself the leak.
      return fail(
        'No hay ningún atleta tuyo con ese identificador. Pide la lista con list_athletes y usa el athlete_id que salga ahí.',
      );
    }
    throw err;
  }
}

export function registerCoachReadTools(server: McpServer): void {
  server.registerTool(
    'get_briefing',
    {
      title: 'El día del coach',
      description:
        'El día del coach: qué atletas necesitan atención hoy y por qué (check-ins, señales, mensajes sin leer). Empieza por aquí cuando pregunte cómo va el día, quién está mal, o qué tiene pendiente.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (extra) =>
      withCoach(extra.authInfo, async (coach_id, coach_name) => {
        // The unread count is READ, never guessed: skipping it makes the
        // builder drop the line entirely rather than paint a plausible number.
        const [cohort, unread_messages] = await Promise.all([
          buildCohort({ coach_id }),
          countUnreadForCoach({ coach_id }),
        ]);
        const briefing = buildBriefing({
          coach_first_name: coach_name,
          cohort,
          unread_messages,
        });
        return ok(
          { briefing },
          briefingResumen({
            active_athlete_count: briefing.active_athlete_count,
            cohort,
            unread_messages,
          }),
        );
      }),
  );

  server.registerTool(
    'list_athletes',
    {
      title: 'Sus atletas',
      description:
        'Todos sus atletas de un vistazo: adherencia, readiness, señales activas, qué tienen hoy y a qué carrera van. Úsalo para comparar entre atletas o para encontrar a quién se refiere antes de pedir su ficha.',
      inputSchema: {
        modality: z
          .enum(MODALITY)
          .optional()
          .describe(
            'Deja solo los atletas de un plan: individual, dobles o pro_elite. Sin esto salen todos.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const cohort = await buildCohort({ coach_id });
        let rows = cohort.map(toAthleteSummary);

        // The cohort roll-up carries no plan type (it is billing, not training),
        // so the filter is delegated to the roster query that already owns it
        // and the result is intersected by id. Both calls are scoped to the same
        // coach_id, so tenancy holds on both sides. Only runs when asked, so the
        // common "list everyone" stays a single read.
        if (args.modality) {
          const onPlan = await fetchAthletesForCoach({
            coach_id,
            modality: args.modality,
          });
          const allowed = new Set(onPlan.map((a) => a.athlete_id));
          rows = rows.filter((r) => allowed.has(r.athlete_id));
        }

        return ok(
          { athletes: rows, count: rows.length, filtered_by_modality: args.modality ?? null },
          athletesResumen({ rows, modality: args.modality ?? null }),
        );
      }),
  );

  server.registerTool(
    'get_athlete',
    {
      title: 'Ficha de un atleta',
      description:
        'La ficha completa de un atleta: cómo está de fresco, cómo lleva la adherencia, qué ha entrenado estos días, sus mejores marcas, lo que él mismo ha reportado y las notas del coach. Es la respuesta a "cómo va X".',
      inputSchema: {
        athlete_id: z
          .number()
          .int()
          .positive()
          .describe('El athlete_id tal y como lo devuelve list_athletes.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const deepDive = await buildAthleteDeepDive({
          coach_id,
          athlete_id: String(args.athlete_id),
        });
        const detail = toAthleteDetail(deepDive);
        return ok({ athlete: detail }, athleteResumen(detail));
      }),
  );
}
