import 'server-only';

// EL CUMPLIMIENTO — un cálculo, dos pintores (docs/analiticas/modelo.md A1, A7, A8).
//
// `cargarCumplimiento` lo usan el panel (las tres lecturas en el bloque
// `semanas`) y el detalle `GET …/analytics/cumplimiento?ventana=` (las mismas
// lecturas y sus filas: sesión → línea → tramo → serie). Recibe lo que el panel
// ya cargó — el método, las anclas, la carga hecha de cada ejecución y la
// planificada de cada sesión — para que el porcentaje de carga de una sesión sea
// EXACTAMENTE el de la curva de forma y la serie de plan, no otra cuenta.
//
// Aquí no se juzga nada: se traen las filas (`./cumplimiento-datos`), las bandas
// del coach (zonas de ritmo, pendiente que retira el ritmo) y se llama al motor
// puro (`shared/domain/analytics/cumplimiento*`).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadCoachZonesForUnit } from '@/lib/dashboard/v2/zone-derivation';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import { resolveEffectiveAnalyticsMethod } from '@/lib/coach/analytics-method';
import { resolveCoachHrMethod } from '@/lib/coach/hr-method';
import { defaultCoachHrMethod, hrZoneFractionsFrom } from '@fahybrid/shared/domain/coach/hr-method';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { standardZonesFor, type HrZoneFractions } from '@fahybrid/shared/domain/methodology';
import { diffDays, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  cargaPlanificadaDeSesion,
  cumplimientoDeSesion,
  lecturasCumplimiento,
  limitesUtc,
  preciarSesion,
  resolverVentana,
  type AnclasAtleta,
  type CoachAnalyticsMethod,
  type ContextoBandas,
  type DetalleCumplimiento,
  type FilaSesion,
  type Lectura,
  type PrecioSesion,
  type ResumenSinPlan,
  type SesionPlan,
  type VentanaClave,
  type VentanaResuelta,
} from '@fahybrid/shared/domain/analytics';
import { loadAnclasAtleta } from './anclas';
import type { AtletaVerificado } from './atleta-verificado';
import { loadEjecucionesDelPlan, loadPrimerDiaDelPlan, loadSesionesCumplimiento } from './cumplimiento-datos';
import { loadContexto, loadSesionesHechas, loadSesionesPlan, type ContextoAtleta } from './panel-datos';

export interface ResultadoCumplimiento {
  /**
   * El periodo que se juzgó: la ventana del panel, salvo en «todo», que en el
   * cumplimiento es toda la historia DEL PLAN (desde su primer día programado).
   */
  ventana: VentanaResuelta;
  lecturas: Lectura[];
  /** Las sesiones del plan de la VENTANA (sin el periodo anterior), la más reciente primero. */
  sesiones: FilaSesion[];
  sin_plan: ResumenSinPlan;
}

/** El contexto de las bandas: lo del atleta (anclas) y lo del coach (zonas de ritmo, pendiente, holguras). */
async function contextoBandas(args: {
  coach_id: number | null;
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  metodo: CoachAnalyticsMethod;
  client: Sql;
}): Promise<ContextoBandas> {
  const { coach_id, client } = args;
  const [porKm, por500, carrera] = await Promise.all([
    coach_id != null ? loadCoachZonesForUnit(client, coach_id, 'per_km') : Promise.resolve([...standardZonesFor('per_km')]),
    coach_id != null ? loadCoachZonesForUnit(client, coach_id, 'per_500m') : Promise.resolve([...standardZonesFor('per_500m')]),
    coach_id != null ? resolveEffectiveRunningThresholds(coach_id, client) : Promise.resolve(defaultCoachRunningThresholds()),
  ]);
  return {
    anclas: args.anclas,
    fracciones_hr: args.fracciones_hr,
    zonas_ritmo: { per_km: porKm, per_500m: por500 },
    metodo: args.metodo,
    pendiente_retira_ritmo_pct: carrera.gradient_retires_pace_pct,
  };
}

/**
 * EL cumplimiento de una ventana. Las sesiones del plan del coach desde el
 * periodo anterior hasta hoy, juzgadas; lo hecho sin plan, contado aparte.
 */
export async function cargarCumplimiento(args: {
  atleta: AtletaVerificado;
  contexto: ContextoAtleta;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  anclas: AnclasAtleta;
  fracciones_hr: HrZoneFractions;
  /** La carga hecha de cada ejecución (`preciarSesion`), la de la curva de forma. */
  preciadas: readonly PrecioSesion[];
  /** Las sesiones planificadas (`loadSesionesPlan`), las de la serie de plan. */
  planificadas: readonly SesionPlan[];
  now: Date;
  client?: Sql;
}): Promise<ResultadoCumplimiento> {
  const client = args.client ?? defaultSql;
  const { atleta, contexto, metodo, anclas, fracciones_hr } = args;

  // «Todo» es la historia del PLAN: puede empezar antes del primer entreno (un
  // atleta con plan y sin nada hecho) o mucho después (años de importaciones de
  // Salud antes de tener coach). Sin plan, la ventana tal cual: sin dato por «plan».
  let ventana = args.ventana;
  if (ventana.clave === 'todo') {
    const primer = await loadPrimerDiaDelPlan(atleta, contexto.hoy, client);
    if (primer != null) {
      const dias = diffDays(parseIsoDate(contexto.hoy), parseIsoDate(primer)) + 1;
      ventana = { ...ventana, desde: primer, dias, anterior: null, cubre_todo: true };
    }
  }
  const desde = ventana.anterior?.desde ?? ventana.desde;

  const [sesiones, delPlan, ctx] = await Promise.all([
    loadSesionesCumplimiento(atleta, { tz: contexto.tz, desde, hoy: contexto.hoy, now: args.now }, client),
    loadEjecucionesDelPlan(atleta, client),
    contextoBandas({ coach_id: contexto.coach_id, anclas, fracciones_hr, metodo, client }),
  ]);

  const precioDe = new Map(args.preciadas.map((p) => [p.id, p] as const));
  const planDe = new Map(args.planificadas.map((p) => [p.id, p] as const));
  const filas: FilaSesion[] = [];
  for (const s of sesiones) {
    const plan = planDe.get(s.assignment_id) ?? null;
    const fila = cumplimientoDeSesion(s, {
      hoy: contexto.hoy,
      metodo,
      ctx,
      plan,
      precio_plan: plan ? cargaPlanificadaDeSesion(plan, { anclas, fracciones_hr }) : null,
      precio_hecho: s.ejecucion ? (precioDe.get(s.ejecucion.id) ?? null) : null,
    });
    if (fila) filas.push(fila);
  }

  // Lo hecho SIN plan del coach en la ventana (libre, fuera del plan, importado):
  // cuenta en la carga, no en el cumplimiento — aquí solo se cuenta, en gris.
  const sinPlan = args.preciadas.filter((p) => p.dia >= ventana.desde && p.dia <= ventana.hasta && !delPlan.has(p.id));
  const preciadas = sinPlan.filter((p) => p.tss != null);
  const sin_plan: ResumenSinPlan = {
    sesiones: sinPlan.length,
    segundos: sinPlan.reduce((a, p) => a + p.segundos, 0),
    tss: preciadas.length > 0 ? preciadas.reduce((a, p) => a + (p.tss ?? 0), 0) : null,
  };

  return {
    ventana,
    lecturas: lecturasCumplimiento({ hoy: contexto.hoy, ventana, metodo, sesiones: filas, sin_plan }),
    sesiones: filas.filter((f) => f.dia >= ventana.desde && f.dia <= ventana.hasta).sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0)),
    sin_plan,
  };
}

/**
 * El detalle del cumplimiento para las dos rutas (atleta y coach). Carga lo mismo
 * que el panel necesita para el cumplimiento — contexto, método, anclas, la carga
 * hecha y la planificada — y llama al MISMO `cargarCumplimiento`: el detalle y el
 * bloque `semanas` del panel no pueden discrepar.
 */
export async function cargarDetalleCumplimiento(args: {
  atleta: AtletaVerificado;
  ventana: VentanaClave;
  now?: Date;
  client?: Sql;
}): Promise<DetalleCumplimiento> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const { atleta } = args;

  const contexto = await loadContexto(atleta, now, client);
  const ventana = resolverVentana({ clave: args.ventana, hoy_local: contexto.hoy, primera_sesion_iso: contexto.historia.iso });
  const coachId = contexto.coach_id;
  const [metodo, hrMethod, anclas] = await Promise.all([
    resolveEffectiveAnalyticsMethod(coachId ?? 0, client),
    coachId != null ? resolveCoachHrMethod(coachId, client) : Promise.resolve(defaultCoachHrMethod()),
    loadAnclasAtleta(atleta, client),
  ]);
  const fracciones_hr = hrZoneFractionsFrom(hrMethod);
  const [hechas, planificadas] = await Promise.all([
    loadSesionesHechas(atleta, contexto.tz, limitesUtc(ventana, contexto.tz).hasta_excl, client),
    loadSesionesPlan(atleta, ventana.anterior?.desde ?? ventana.desde, contexto.hoy, client),
  ]);
  const preciadas = hechas.map((s) => preciarSesion(s, { anclas, metodo, fracciones_hr }));

  const r = await cargarCumplimiento({ atleta, contexto, ventana, metodo, anclas, fracciones_hr, preciadas, planificadas, now, client });
  return {
    athlete_id: String(atleta.athlete_id),
    generado_iso: now.toISOString(),
    ventana: r.ventana,
    metodo,
    lecturas: r.lecturas,
    sesiones: r.sesiones,
    sin_plan: r.sin_plan,
  };
}
