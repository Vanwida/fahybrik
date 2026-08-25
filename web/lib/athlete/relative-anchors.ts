import 'server-only';

// Anclas para traducir un objetivo RELATIVO al número de ESTE atleta.
//
// Vive aquí (no dentro de assignment-detail ni del ingest) para que el camino
// de LECTURA del día y el SELLO al ejecutar compartan la misma construcción:
// snapshot de zonas + ritmo de carrera + peso + división/género de la carrera
// objetivo + la tabla de kilos del coach. Un solo sitio, dos llamantes.

import type { Sql, TransactionClient } from '@/lib/db';
import { loadAthleteZoneProfilesForAthlete } from '@/lib/dashboard/v2/zone-profile';
import { getTargetRace } from '@/lib/races/next-race';
import { loadCoachStationLoadLookup } from '@/lib/coach/station-loads';
import { athleteBenchmarksFromSlugRows } from '@fahybrid/shared/domain/methodology';
import {
  anchorsFromBenchmarks,
  anchorsFromZoneProfiles,
  racePaceAnchor,
  type AthleteAnchors,
} from '@fahybrid/shared/domain/prescription/resolve-relative';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

export async function loadAthleteRelativeAnchors(args: {
  sql: Sql | TransactionClient;
  athlete_id: number;
  coach_id?: bigint | number | null;
  zoneProfiles?: AthleteZoneProfile[];
}): Promise<AthleteAnchors> {
  const { sql, athlete_id } = args;
  const client = sql as Sql;

  const [benchRows, athleteRows, targetRace, zoneProfiles] = await Promise.all([
    sql<{ exercise_slug: string; value: number | null }[]>`
      select exercise_slug, value::float8 as value
      from athlete_benchmarks
      where athlete_id = ${athlete_id}
    `,
    sql<{ weight_kg: string | null; coach_id: string | null }[]>`
      select weight_kg::text as weight_kg, coach_id::text as coach_id
      from athletes
      where id = ${athlete_id}
      limit 1
    `,
    getTargetRace(athlete_id, client),
    args.zoneProfiles
      ? Promise.resolve(args.zoneProfiles)
      : loadAthleteZoneProfilesForAthlete({ athlete_id, client }),
  ]);

  const coachId =
    args.coach_id ?? (athleteRows[0]?.coach_id != null ? BigInt(athleteRows[0].coach_id) : null);
  const lookup = coachId != null ? await loadCoachStationLoadLookup(coachId, sql) : undefined;
  const bodyweightKg =
    athleteRows[0]?.weight_kg != null ? Number(athleteRows[0].weight_kg) : null;

  const benchmarks = athleteBenchmarksFromSlugRows(benchRows);
  const fromProfiles = anchorsFromZoneProfiles(zoneProfiles, {
    racePace: racePaceAnchor(benchmarks),
    bodyweightKg,
    division: targetRace?.division ?? null,
    gender: targetRace?.gender_category ?? null,
    stationLoad: lookup,
  });
  // Si el snapshot es del alta (estimado) pero ya hay una marca de umbral
  // guardada, esa marca es el número. No se inventa un segundo calculador:
  // `anchorsFromBenchmarks` ya filtra lo estimado.
  const fromMarks = anchorsFromBenchmarks(benchmarks);
  return {
    ...fromProfiles,
    thresholdPace: { ...fromMarks.thresholdPace, ...fromProfiles.thresholdPace },
  };
}
