import 'server-only';

// Pestaña Rendimiento de la ficha — las analíticas del atleta con el MISMO
// cálculo que ve él en su iPhone (`cargarPanel`, docs/analiticas/modelo.md A1),
// en la ventana que pide la URL; sus umbrales con su peldaño (el toque para
// declararlos); y lo que ningún bloque del panel cubre: zonas y tests, 1RM
// medidos y cuerpo (check-ins y VO₂). Cada parte lleva su error: un fallo nunca
// se pinta como «sin datos» (S5).
//
// La carga 42/7 fija de la ficha (`LoadView`, el PMC viejo) y las marcas por
// test (`benchmarks`) se retiraron el 29-09: las cubren «Forma y fatiga»,
// «Progreso» y «Récords».

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAthleteZoneProfiles } from '@/lib/dashboard/v2/zone-profile';
import { loadStrengthMaxes, loadStrengthMaxHistory } from '@/lib/strength/strength-max';
import { loadBatteryStatus, type CalibrationTestStatus } from '@/lib/coach/battery-status';
import { listCoachTests } from '@/lib/coach/coach-tests';
import { buildAthleteBody, type BodyPayload } from '@/lib/dashboard/coach/deep-dive-body';
import { verificarAtletaDelCoach } from '@/lib/analytics/atleta-verificado';
import { cargarPanel } from '@/lib/analytics/panel';
import { getUmbralesAtleta, type UmbralesAtleta } from '@/lib/analytics/declaraciones';
import { captureRouteError } from '@/lib/observability/capture';
import { strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import type { PanelAnaliticas } from '@fahybrid/shared/domain/analytics/panel';
import type { VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

export interface StrengthMaxView {
  exercise_slug: string;
  exercise_label: string;
  one_rm_kg: number;
  recorded_at: string;
  source: string;
  history: { one_rm_kg: number; recorded_at: string }[];
}

type Part<T> = { ok: true; data: T } | { ok: false };

export interface FichaRendimiento {
  athlete_id: string;
  athlete_name: string;
  /** El panel de analíticas (el mismo sobre que el iPhone) en la ventana pedida. */
  panel: Part<PanelAnaliticas>;
  /** Sus umbrales resueltos con su peldaño, y lo declarado de un toque. */
  umbrales: Part<UmbralesAtleta>;
  zones: Part<AthleteZoneProfile[]>;
  tests: Part<{ tests: CalibrationTestStatus[]; library: { id: string; name: string; last_done: string | null }[] }>;
  strength: Part<StrengthMaxView[]>;
  body: Part<BodyPayload>;
  max_hr_bpm: number | null;
}

async function part<T>(p: Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, data: await p };
  } catch {
    return { ok: false };
  }
}

export async function loadFichaRendimiento(params: {
  coach_id: number | bigint;
  athlete_id: number;
  /** La ventana del panel (A4); la resuelve la URL. */
  ventana: VentanaClave;
  client?: Sql;
}): Promise<FichaRendimiento> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);
  const ath = params.athlete_id;
  const head = await client<Array<{ full_name: string; max_hr_bpm: number | null }>>`
    select full_name, max_hr_bpm from athletes where id = ${ath} and coach_id = ${coachId}
  `;
  // El ámbito de club, comprobado en la base antes de leer nada del panel (un atleta ajeno no tiene panel).
  const atleta = await verificarAtletaDelCoach(ath, coachId, client);
  const [panel, umbrales, zones, tests, strength, body] = await Promise.all([
    atleta
      ? part(
          cargarPanel({ atleta, ventana: params.ventana, client }).catch((err: unknown) => {
            // La pestaña enseña «no se ha podido calcular» con Reintentar; el porqué tiene que llegar a los registros.
            captureRouteError(err, { route: 'ficha/rendimiento/panel', meta: { athlete_id: ath, ventana: params.ventana } });
            throw err;
          }),
        )
      : Promise.resolve({ ok: false } as const),
    atleta ? part(getUmbralesAtleta(atleta, client)) : Promise.resolve({ ok: false } as const),
    part(loadAthleteZoneProfiles({ coach_id: coachId, athlete_id: ath, client })),
    part(
      Promise.all([loadBatteryStatus(ath, client), listCoachTests(coachId, { onlyEnabled: true }, client)]).then(
        ([battery, lib]) => {
          const last = new Map<string, string>();
          for (const t of battery.tests) {
            if (!t.result_captured) continue;
            const prev = last.get(t.calibration_slug);
            if (!prev || t.scheduled_for > prev) last.set(t.calibration_slug, t.scheduled_for);
          }
          return {
            tests: battery.tests,
            library: lib.map((t) => ({ id: String(t.id), name: t.name, last_done: last.get(t.slug) ?? null })),
          };
        },
      ),
    ),
    part(
      Promise.all([
        loadStrengthMaxes({ coach_id: coachId, athlete_id: ath, client }),
        loadStrengthMaxHistory({ athlete_id: ath, client }),
      ]).then(([current, history]) =>
        current.map((m) => ({
          exercise_slug: m.exercise_slug,
          exercise_label: strengthLiftLabel(m.exercise_slug),
          one_rm_kg: m.one_rm_kg,
          recorded_at: m.recorded_at,
          source: m.source,
          history: history
            .filter((h) => h.exercise_slug === m.exercise_slug)
            .map((h) => ({ one_rm_kg: h.one_rm_kg, recorded_at: h.recorded_at })),
        })),
      ),
    ),
    part(buildAthleteBody({ coach_id: coachId, athlete_id: ath, client })),
  ]);
  return {
    athlete_id: String(ath),
    athlete_name: head[0]?.full_name ?? '',
    panel,
    umbrales,
    zones,
    tests,
    strength,
    body,
    max_hr_bpm: head[0]?.max_hr_bpm ?? null,
  };
}
