import 'server-only';

// Marcadores clave del coach (mig 0233): cuáles mira y qué valen para un atleta.
// El catálogo, el defecto y el formato viven en shared/domain/coach/key-markers.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  KEY_MARKERS_MAX,
  formatKeyMarkerValue,
  isKeyMarkerKey,
  resolveKeyMarkers,
  type KeyMarkerDef,
} from '@fahybrid/shared/domain/coach/key-markers';

export interface AthleteKeyMarker {
  key: string;
  label: string;
  /** «110 kg», «19:40»… null = todavía no hay dato. */
  value_label: string | null;
  /** YYYY-MM-DD de la medida, si la hay. */
  measured_on: string | null;
  /** Mejor/peor que la medida anterior; null si no hay dos o no tiene dirección. */
  trend: 'better' | 'worse' | 'same' | null;
  /** De dónde sale: decide adónde lleva «programar test». */
  source: KeyMarkerDef['source']['kind'];
}

export class KeyMarkersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyMarkersError';
  }
}

/** Las claves guardadas por el coach, en orden (vacío = defecto). */
export async function loadCoachKeyMarkerKeys(coach_id: number | bigint, client: Sql = defaultSql): Promise<string[]> {
  const rows = await client<Array<{ marker_key: string }>>`
    select marker_key from coach_key_markers
    where coach_id = ${Number(coach_id)}
    order by position asc, id asc
  `;
  return rows.map((r) => r.marker_key);
}

/** Los marcadores efectivos del coach (los suyos o el defecto). */
export async function loadCoachKeyMarkers(coach_id: number | bigint, client: Sql = defaultSql): Promise<KeyMarkerDef[]> {
  return resolveKeyMarkers(await loadCoachKeyMarkerKeys(coach_id, client));
}

/** Reemplaza la elección del coach (1..MAX claves del catálogo, en orden). */
export async function saveCoachKeyMarkers(params: {
  coach_id: number | bigint;
  keys: string[];
  client?: Sql;
}): Promise<KeyMarkerDef[]> {
  const keys = [...new Set(params.keys)];
  if (keys.length === 0) throw new KeyMarkersError('Elige al menos un marcador.');
  if (keys.length > KEY_MARKERS_MAX) throw new KeyMarkersError(`Como mucho ${KEY_MARKERS_MAX} marcadores.`);
  const unknown = keys.find((k) => !isKeyMarkerKey(k));
  if (unknown) throw new KeyMarkersError(`Marcador desconocido: ${unknown}.`);
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  await client.begin(async (tx) => {
    await tx`delete from coach_key_markers where coach_id = ${coachId}`;
    for (const [i, key] of keys.entries()) {
      await tx`insert into coach_key_markers (coach_id, marker_key, position) values (${coachId}, ${key}, ${i})`;
    }
  });
  return resolveKeyMarkers(keys);
}

function trendOf(def: KeyMarkerDef, last: number, prev: number | null): AthleteKeyMarker['trend'] {
  if (prev == null) return null;
  if (last === prev) return 'same';
  const up = last > prev;
  return up === !def.lower_is_better ? 'better' : 'worse';
}

/**
 * Los marcadores del coach con el valor de ESTE atleta. Dos consultas (la
 * elección del coach y los valores de todas sus fuentes a la vez). El atleta
 * debe ser del coach (se comprueba en la consulta).
 */
export async function loadAthleteKeyMarkers(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteKeyMarker[]> {
  const client = params.client ?? defaultSql;
  const defs = await loadCoachKeyMarkers(params.coach_id, client);
  const benchSlugs = defs.flatMap((d) => (d.source.kind === 'benchmark' ? [d.source.slug] : []));
  const strengthSlugs = defs.flatMap((d) => (d.source.kind === 'strength' ? [d.source.slug] : []));

  const rows = await client<
    Array<{ kind: 'benchmark' | 'strength' | 'max_hr'; slug: string; value: number; on: string; rn: number }>
  >`
    with a as (
      select id, max_hr_bpm from athletes where id = ${params.athlete_id} and coach_id = ${Number(params.coach_id)}
    )
    select * from (
      select 'benchmark'::text as kind, ab.exercise_slug as slug, ab.value::float8 as value,
             to_char(ab.recorded_at, 'YYYY-MM-DD') as on,
             row_number() over (partition by ab.exercise_slug order by ab.recorded_at desc, ab.id desc)::int as rn
      from athlete_benchmarks ab join a on a.id = ab.athlete_id
      where ab.exercise_slug = any(${benchSlugs}::text[])
      union all
      select 'strength', sm.exercise_slug, sm.one_rm_kg::float8,
             to_char(sm.recorded_at, 'YYYY-MM-DD'),
             row_number() over (partition by sm.exercise_slug order by sm.version desc, sm.id desc)::int
      from athlete_strength_maxes sm join a on a.id = sm.athlete_id
      where sm.exercise_slug = any(${strengthSlugs}::text[])
      union all
      select 'max_hr', 'max_hr', a.max_hr_bpm::float8, null, 1 from a where a.max_hr_bpm is not null
    ) x where rn <= 2
  `;

  const by = new Map<string, { last: { value: number; on: string | null } | null; prev: number | null }>();
  for (const r of rows) {
    const id = `${r.kind}:${r.slug}`;
    const cur = by.get(id) ?? { last: null, prev: null };
    if (r.rn === 1) cur.last = { value: Number(r.value), on: r.on };
    else cur.prev = Number(r.value);
    by.set(id, cur);
  }

  return defs.map((def) => {
    const id = def.source.kind === 'max_hr' ? 'max_hr:max_hr' : `${def.source.kind}:${def.source.slug}`;
    const hit = by.get(id);
    const last = hit?.last ?? null;
    return {
      key: def.key,
      label: def.label,
      value_label: last ? formatKeyMarkerValue(def.unit, last.value) : null,
      measured_on: last?.on ?? null,
      trend: last ? trendOf(def, last.value, hit?.prev ?? null) : null,
      source: def.source.kind,
    };
  });
}
