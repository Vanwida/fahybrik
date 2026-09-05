// Las carreras del atleta: a qué va, con qué objetivo, y cómo le fue.
//
// Lee las MISMAS proyecciones que el hub de Carreras del atleta y la ficha del
// coach (`getAthleteRacesForCoach` → `getTargetRace` / `getUpcomingRaces` /
// `listAthletePastRaces`), así que las tres superficies no pueden divergir.
//
// Y añade una cosa que ninguna lista tiene: PREDICHO VS REAL de la última carrera
// con resultado. Es la pregunta que el coach hace después de una carrera («¿le
// clavamos el tiempo?») y la única forma de saber si el modelo de predicción le
// está sirviendo o mintiendo. Se revisa solo la última porque la predicción es un
// snapshot congelado por carrera: revisar el historial entero serían decenas de
// consultas para contestar algo que no se pregunta.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { athleteTargetRaceInput } from '@fahybrid/shared/schema';
import { getAthleteRacesForCoach } from '@/lib/races/coach-races';
import { buildPredictionReview } from '@/lib/athlete/prediction-review';
import { setAthleteTargetRace, TargetRaceError } from '@/lib/races/target-race-write';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  ok,
  resolveOwnedAthlete,
  withCoach,
} from './runtime';
import { racesResumen, toRaces } from './shape-races';

export function registerRacesTools(server: McpServer): void {
  server.registerTool(
    'get_races',
    {
      title: 'Las carreras del atleta',
      description:
        'Las carreras del atleta: a cuál apunta el plan y con qué objetivo de tiempo, las que tiene en el calendario con su cuenta atrás, y las que ya corrió con su resultado, puesto y parciales. Incluye, de la última con resultado, lo que se le predijo contra lo que hizo de verdad.',
      inputSchema: { athlete_id: athleteIdArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        const races = await getAthleteRacesForCoach({
          coach_id,
          athlete_id: args.athlete_id,
        });

        // La más reciente CON resultado: `past` ya viene de más nueva a más vieja.
        const reviewed = races.past.find((r) => r.result_time_seconds != null) ?? null;
        const review = reviewed
          ? await buildPredictionReview({
              athlete_id: args.athlete_id,
              race_id: reviewed.race_id,
            })
          : null;

        return ok(
          {
            races: toRaces({
              athlete_id: races.athlete_id,
              athlete_name: athlete.full_name,
              target_race: races.target_race,
              upcoming: races.upcoming,
              past: races.past,
              review,
              reviewed_race: reviewed,
            }),
          },
          racesResumen({
            athlete_name: athlete.full_name,
            target_race: races.target_race,
            upcoming_count: races.upcoming.length,
            past: races.past,
          }),
        );
      }),
  );

  server.registerTool(
    'set_target_race',
    {
      title: 'Fijar la carrera objetivo del atleta',
      description:
        'Fija la carrera OBJETIVO del atleta a partir de un evento del catálogo: formato, división y categoría. Es el mismo acto que el selector de carrera del panel. No inventa una nota: si hay que apuntar algo interno, usa add_note.',
      inputSchema: {
        athlete_id: athleteIdArg,
        event_id: athleteTargetRaceInput.shape.event_id.describe(
          'El evento del catálogo al que apunta el plan.',
        ),
        format: athleteTargetRaceInput.shape.format,
        division: athleteTargetRaceInput.shape.division,
        gender_category: athleteTargetRaceInput.shape.gender_category,
        goal_time_seconds: athleteTargetRaceInput.shape.goal_time_seconds.describe(
          'Objetivo de tiempo en segundos. Sin esto, sin objetivo de reloj.',
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        try {
          const result = await setAthleteTargetRace({
            athlete_id: args.athlete_id,
            event_id: args.event_id,
            format: args.format,
            division: args.division,
            gender_category: args.gender_category,
            goal_time_seconds: args.goal_time_seconds ?? null,
            require_visible: false,
          });
          return ok(
            {
              athlete_id: String(args.athlete_id),
              athlete_name: athlete.full_name,
              race_id: result.race_id,
              target_race: result.target_race,
            },
            result.target_race
              ? `${athlete.full_name}: objetivo «${result.target_race.name}».`
              : `${athlete.full_name}: carrera objetivo fijada.`,
          );
        } catch (err) {
          if (err instanceof TargetRaceError) {
            return fail(
              err.code === 'event_not_found' ? 'No encuentro ese evento.' : err.message,
            );
          }
          throw err;
        }
      }),
  );
}
