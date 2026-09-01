import 'server-only';

// CAPACIDAD — GET /api/athlete/running/capacidad (mapa v2, obra
// carrera-hub-ios, 13-ago-2026). Umbral+zonas, récords y el predictor — TODO
// motor real, CERO fórmula nueva:
//
//   umbral+zonas → `loadPaceThreshold` (running-progress.ts), exportado para
//     esto — el MISMO perfil que "¿Estoy mejorando?", no una segunda lectura.
//   récords → `loadMarksOverview` (web/lib/athlete/marks.ts) — la MISMA
//     lectura que sirve #Marcas, filtrada a los seis de correr/carrera.
//   predictor → `selectRunMark` + `paceForRaceDistance` (Daniels-Gilbert),
//     el MISMO selector que ya usa el umbral y que ya usa el cruce HYROX.
//
// NO LLEVA VELOCIDAD CRÍTICA (CS/D'). Corrección de contrato (team-lead,
// 13-ago-2026): el ajuste de Monod-Scherrer ya tiene un motor y un pintor
// ÚNICOS en la app — el grupo `capacidad` de `/api/athlete/analytics/lecturas`
// (shared/domain/analytics/capacidad.ts vía `lecturas.ts`), que iOS reutiliza
// en la vista nueva. Servirlo también aquí habría sido el MISMO hecho por dos
// caminos — la app podría enseñar dos CS distintos si un motor cambia y el
// otro no. Si esta puerta necesita CS más adelante, se ENLAZA a esa lectura,
// nunca se recalcula un segundo ajuste.
//
// DESVIACIÓN DECLARADA DEL CONTRATO (informe a team-lead): `records[].segundos`
// del contrato original no vale para el Cooper (`athlete_benchmarks` lo guarda
// en METROS, no en segundos — es la única marca "más alto mejor" del catálogo,
// ver shared/domain/athlete/marks.ts). Servir un Cooper de 2840 bajo una clave
// llamada `segundos` es un valor engañoso agazapado para quien lo consuma sin
// mirar `unidad`. Se sirve `valor` + `unidad: 'seconds'|'meters'` en su lugar.
//
// `test_zonas` sale de `coach_calibration_tests` × `coach_test_results` con
// `derives = 'run_zones'` (migración 0112) — el mecanismo real de la batería,
// el mismo que arma `POST /api/athlete/test-battery/start`. `methodology_tests.
// feeds_anchor` (mig 0048) es la tabla vieja del área 8: cero lectores en todo
// el repo la usan hoy, así que no es la fuente de verdad.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadPaceThreshold, loadRunMarkRows } from '../analytics/running-progress';
import { loadMarksOverview } from '../marks';
import { selectRunMark } from '@fahybrid/shared/domain/athlete/mark-projection';
import { paceForRaceDistance } from '@fahybrid/shared/domain/running/vdot';
import { MARKS } from '@fahybrid/shared/domain/athlete/marks';
import type { ZonaRitmo } from '@fahybrid/shared/domain/running/progress';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Dentro de este margen, una marca es "reciente" — mismo corte que el doble
 *  de diseño (`correr-capacidad/datos.ts::esRecord`). */
const RECORD_FRESH_DAYS = 30;
/** Una VDOT de hace ≥4 semanas hace de línea de base del predictor — ni un
 *  snapshot inventado ni una segunda tabla histórica: el propio catálogo de
 *  marcas, filtrado por antigüedad y vuelto a pasar por el MISMO selector. */
const BASELINE_MIN_AGE_DAYS = 28;

/** 5k/10k/21k/42k — las cuatro distancias que ya usa el predictor de
 *  "¿Estoy mejorando?" (running-progress.ts) y el cruce HYROX. */
const PREDICTOR_DISTANCES_M: readonly number[] = [5000, 10000, 21097, 42195];

const ORIGEN_LABEL: Record<string, string> = {
  coach_test: 'Test del coach',
  athlete_test: 'Test propio',
  onboarding_auto: 'Estimado al alta',
};

export interface CapacidadZona {
  z: number;
  nombre: string;
  desde_s_km: number | null;
  hasta_s_km: number | null;
  color: string;
}

export interface CapacidadRecord {
  slug: string;
  label_es: string;
  contexto: 'street' | 'treadmill';
  valor: number;
  unidad: 'seconds' | 'meters';
  fecha: string;
  reciente: boolean;
}

export interface CapacidadPredictorPunto {
  distancia_m: number;
  segundos: number;
  /** `segundos` menos la línea de base de hace ≥4 semanas — negativo = más
   *  rápido ahora. Null sin marca de esa antigüedad contra la que comparar. */
  delta_s: number | null;
}

export interface CapacidadPayload {
  umbral: { ritmo_s_km: number; origen_label: string | null; hace_dias: number | null; sin_revisar: boolean } | null;
  zonas: CapacidadZona[];
  records: CapacidadRecord[];
  predictor: CapacidadPredictorPunto[] | null;
  test_zonas: { slug: string; label_es: string } | null;
}

function zonaCode(code: string, fallbackOrder: number): number {
  const n = Number(code.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : fallbackOrder + 1;
}

function toCapacidadZonas(zonas: readonly ZonaRitmo[]): CapacidadZona[] {
  return zonas.map((z) => ({
    z: zonaCode(z.code, z.sort_order),
    nombre: z.label,
    desde_s_km: z.slow_s,
    hasta_s_km: z.fast_s,
    color: z.color,
  }));
}

async function loadTestZonas(client: Sql, athlete_id: number): Promise<{ slug: string; label_es: string } | null> {
  const rows = await client<Array<{ slug: string; label_es: string }>>`
    select cct.slug as slug, cct.name as label_es
    from coach_calibration_tests cct
    join coach_test_results ctr on ctr.test_id = cct.id
    join athletes a on a.coach_id = cct.coach_id
    where a.id = ${athlete_id}
      and cct.enabled = true
      and cct.archived_at is null
      and ctr.derives = 'run_zones'
    order by cct.sort_order, cct.id
    limit 1
  `;
  return rows[0] ?? null;
}

function markResultView(
  v: { value: number; recorded_at: string } | null,
  now: Date,
): { valor: number; fecha: string; reciente: boolean } | null {
  if (!v) return null;
  const ageDays = Math.floor((now.getTime() - Date.parse(v.recorded_at)) / MS_PER_DAY);
  return { valor: v.value, fecha: v.recorded_at.slice(0, 10), reciente: ageDays <= RECORD_FRESH_DAYS };
}

export async function buildRunningCapacidad(args: {
  athlete_id: number;
  now?: Date;
  client?: Sql;
}): Promise<CapacidadPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();

  const [umbralData, marksOverview, markRows, testZonas] = await Promise.all([
    loadPaceThreshold(client, args.athlete_id),
    loadMarksOverview(BigInt(args.athlete_id), client),
    loadRunMarkRows(client, args.athlete_id),
    loadTestZonas(client, args.athlete_id),
  ]);

  // ── UMBRAL + ZONAS ──────────────────────────────────────────────────────
  // `loadPaceThreshold` puede devolver un umbral con `ritmo_s_km: null` — el
  // atleta tiene una marca (VDOT) pero JAMÁS un test de zonas/ritmo
  // (`athlete_zone_profiles` vacío). Esa combinación no tiene nada que
  // enseñar en ESTA tarjeta (no hay ritmo que fijar, no hay zonas que
  // acompañarlo — `zonas` sale `[]` igual) y se colapsa a `umbral: null`,
  // que es el estado que ya dispara el CTA del test. Ver running-progress.ts
  // para el otro lector (`UmbralRitmo`), que SÍ necesita el VDOT solo.
  const ritmoSKm = umbralData.umbral?.ritmo_s_km ?? null;
  const umbral =
    umbralData.umbral && ritmoSKm != null
      ? {
          ritmo_s_km: ritmoSKm,
          origen_label: umbralData.umbral.origen ? (ORIGEN_LABEL[umbralData.umbral.origen] ?? umbralData.umbral.origen) : null,
          hace_dias: umbralData.hace_dias,
          sin_revisar: umbralData.umbral.sin_revisar,
        }
      : null;
  const zonas = toCapacidadZonas(umbralData.zonas);

  // ── RÉCORDS ──────────────────────────────────────────────────────────────
  const catalogoRunning = MARKS.filter((m) => m.group === 'run' || m.group === 'race');
  const bySlug = new Map(marksOverview.marks.map((m) => [m.slug, m]));
  const records: CapacidadRecord[] = [];
  for (const spec of catalogoRunning) {
    const view = bySlug.get(spec.slug);
    if (!view) continue;
    const unidad: 'seconds' | 'meters' = spec.unit === 'meters' ? 'meters' : 'seconds';
    if (spec.group === 'run') {
      const outdoor = markResultView(view.best_outdoor, now);
      if (outdoor) records.push({ slug: spec.slug, label_es: spec.label, contexto: 'street', unidad, ...outdoor });
      const treadmill = markResultView(view.best_treadmill, now);
      if (treadmill) records.push({ slug: spec.slug, label_es: spec.label, contexto: 'treadmill', unidad, ...treadmill });
    } else {
      // Carreras registradas: sin distinción de contexto — una maratón se
      // corre en calle por definición.
      const best = markResultView(view.best, now);
      if (best) records.push({ slug: spec.slug, label_es: spec.label, contexto: 'street', unidad, ...best });
    }
  }

  // ── PREDICTOR ────────────────────────────────────────────────────────────
  const hoy = selectRunMark(markRows);
  const predictor = hoy
    ? PREDICTOR_DISTANCES_M.map((metros) => {
        const segundos = tiempoParaDistancia(hoy.vdot, metros);
        const base = selectRunMark(markRows.filter((r) => (r.age_days ?? Infinity) >= BASELINE_MIN_AGE_DAYS));
        const segundosBase = base ? tiempoParaDistancia(base.vdot, metros) : null;
        return {
          distancia_m: metros,
          segundos,
          delta_s: segundosBase != null ? segundos - segundosBase : null,
        };
      })
    : null;

  return { umbral, zonas, records, predictor, test_zonas: testZonas };
}

function tiempoParaDistancia(vdot: number, metros: number): number {
  const ritmo = paceForRaceDistance(vdot, metros);
  return ritmo != null ? Math.round(ritmo * (metros / 1000)) : 0;
}
