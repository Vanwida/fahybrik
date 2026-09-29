import 'server-only';

// Las sesiones que el reloj Garmin se lleva de golpe: de `from` a `from + days − 1`
// con su plan compacto. Es la lectura de base del endpoint
// `GET /api/athlete/wearables/garmin/plan`; el constructor y el códec son puros
// y viven en `garmin-plan.ts` y `garmin-plan-blob.ts`.
//
// Reutiliza lo que ya resuelve el resto del sistema, sin reimplementarlo:
//   · `buildAthleteWeekPlan`  → qué sesiones hay cada día (la misma semana que ve la app)
//   · `loadAssignmentDetail`  → la sesión resuelta: líneas y estructura de carrera
//   · `loadAthleteZoneInputs` → benchmarks, zonas de ritmo y cortes de pulso del coach
//   · `loadAthleteHrZones`    → las zonas de pulso que el atleta ve en la app
//
// Solo se lee la base para las sesiones cuya modalidad es correr: las demás son
// `fase_2` sin abrir su detalle. `from` es la fecha LOCAL del reloj (el atleta
// puede estar en otro huso): no se resuelve nada contra el «hoy» del servidor.

import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadAthleteHrZones } from '@/lib/athlete/hr-zones';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import { sql } from '@/lib/db';
import { buildGarminPlan, type MetodoCoachGarmin, type ZonasAtletaGarmin } from './garmin-plan';
import { sesionGarmin, type SesionPlanGarmin } from './garmin-plan-blob';
import { WATCHABLE_MODALITY, loadAthleteZoneInputs } from './watch-workout-source';

/** Semanas que hay que mirar para cubrir 14 días desde hoy: la actual y las dos siguientes. */
const SEMANAS_A_MIRAR = [0, 1, 2] as const;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` más N días, en calendario (sin husos). */
export function sumarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

async function cargarZonas(athlete_id: bigint): Promise<ZonasAtletaGarmin> {
  const [entradas, pulso] = await Promise.all([loadAthleteZoneInputs(athlete_id), loadAthleteHrZones(athlete_id)]);
  return { ...entradas, pulso };
}

export async function loadGarminPlanSessions(params: {
  athlete_id: bigint;
  user_id: bigint;
  from: string;
  days: number;
  /** El método del coach para el reloj. Hoy no hay dónde guardarlo: sin él, los defectos del kit. */
  metodo?: MetodoCoachGarmin;
}): Promise<SesionPlanGarmin[]> {
  const hasta = sumarDias(params.from, params.days - 1);
  const semanas = await Promise.all(SEMANAS_A_MIRAR.map((o) => buildAthleteWeekPlan(params.athlete_id, o)));

  const vistas = new Set<string>();
  const sesiones = semanas
    .flatMap((s) => s.days)
    .filter((d) => d.iso_date >= params.from && d.iso_date <= hasta)
    .sort((a, b) => a.iso_date.localeCompare(b.iso_date))
    .flatMap((d) => d.sessions.map((s) => ({ fecha: d.iso_date, sesion: s })))
    .filter(({ sesion }) => !vistas.has(sesion.assignment_id) && vistas.add(sesion.assignment_id));

  const hayCorrer = sesiones.some(({ sesion }) => sesion.modality === WATCHABLE_MODALITY);
  const zonas = hayCorrer ? await cargarZonas(params.athlete_id) : null;

  return Promise.all(
    sesiones.map(async ({ fecha, sesion }): Promise<SesionPlanGarmin> => {
      const id = Number(sesion.assignment_id);
      if (sesion.modality !== WATCHABLE_MODALITY || !zonas) {
        return sesionGarmin(id, fecha, { soportada: false, motivo: 'fase_2' });
      }
      const detalle = await loadAssignmentDetail({
        sql,
        athlete_id: params.athlete_id,
        assignment_id: BigInt(sesion.assignment_id),
        self_user_id: params.user_id,
      });
      return sesionGarmin(id, fecha, buildGarminPlan(detalle?.workout ?? null, zonas, params.metodo));
    }),
  );
}
