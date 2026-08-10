// Lo que el coach le ha comunicado — y qué ha hecho el atleta con ello.
//
// DOS LECTURAS, UNA TOOL, porque son la misma pregunta a dos alturas:
//
//   · con `athlete_id` → lo comunicado a ESE atleta con SU estado (visto, hecho,
//     contestado y los pasos que lleva marcados). Es la lectura de la ficha, que es
//     donde vive el seguimiento: no hay pestaña global de comunicados porque con
//     cien atletas el coach piensa en EL atleta (docs/DECISIONS.md 2026-08-09).
//   · sin `athlete_id` → su lista: lo publicado con el agregado de seguimiento, sus
//     plantillas o lo que tiene a medias.
//
// El estado NO es un extra: un comunicado sin seguimiento es un mensaje al vacío, y
// lo que el coach pregunta siempre es «¿lo ha leído?», «¿lo ha hecho?».

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '@/lib/db';
import { COMMUNICATION_VIEWS } from '@fahybrid/shared/domain/coach-communications';
import {
  listCommunications,
  listCommunicationsForAthlete,
} from '@/lib/coach/communications';
import { NO_SUCH_ATHLETE_MESSAGE, fail, ok, resolveOwnedAthlete, withCoach } from './runtime';
import {
  athleteCommsResumen,
  coachCommsResumen,
  toAthleteCommunication,
  toCommunication,
} from './shape-comms';

export function registerCommunicationsTools(server: McpServer): void {
  server.registerTool(
    'list_communications',
    {
      title: 'Lo que le has comunicado',
      description:
        'Los comunicados del coach —protocolos, preguntas, tareas, notas y focos— con su seguimiento: quién lo ha visto, quién lo ha hecho y quién ha contestado qué. Con athlete_id devuelve lo que le has mandado a ESE atleta y en qué estado lo tiene él; sin athlete_id, tu lista (publicados, plantillas o borradores).',
      inputSchema: {
        athlete_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'El athlete_id de list_athletes, para ver lo que le has comunicado a él con su estado.',
          ),
        view: z
          .enum(COMMUNICATION_VIEWS)
          .optional()
          .describe(
            'Solo cuando NO pasas athlete_id: published (lo que ya está en su app), templates (tu biblioteca) o drafts (lo que tienes a medias). Por defecto published.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        if (args.athlete_id != null) {
          const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
          if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

          const rows = await listCommunicationsForAthlete({
            coach_id,
            athlete_id: args.athlete_id,
            sql,
          });
          return ok(
            {
              athlete_id: athlete.athlete_id,
              athlete_name: athlete.full_name,
              // La ficha incluye lo ARCHIVADO a propósito: es el historial de lo que
              // le dijo, no solo lo que sigue vivo en su bandeja.
              communications: rows.map(toAthleteCommunication),
              count: rows.length,
            },
            athleteCommsResumen({ athlete_name: athlete.full_name, rows }),
          );
        }

        const view = args.view ?? 'published';
        const rows = await listCommunications({ coach_id, view, sql });
        return ok(
          { view, communications: rows.map(toCommunication), count: rows.length },
          coachCommsResumen({ view, rows }),
        );
      }),
  );
}
