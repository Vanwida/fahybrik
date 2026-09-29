import 'server-only';

// EL PANEL — un cálculo, dos pintores (docs/analiticas/modelo.md, A1 y §5).
//
// `cargarPanel` es el ÚNICO cargador de las analíticas del atleta. Lo llaman las
// dos rutas (`/api/athlete/analytics/panel` y `/api/coach/athletes/[id]/
// analytics/panel`) y devuelven exactamente lo mismo para el mismo atleta y
// ventana. Aquí no se calcula nada: se traen las filas (`./panel-datos`), se
// resuelven el método del coach y las anclas, y se llama a los motores puros
// de `shared/domain/analytics`.
//
// LO QUE HOY SE SIRVE: estado, forma (con proyección), semanas, progreso, récords
// (`./progreso`), intensidad, recuperación y carrera (`./panel-bloques`). Los
// bloques que falten viajan como `pendientes` hasta que se construyan sobre este
// mismo contrato.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { resolveEffectiveAnalyticsMethod } from '@/lib/coach/analytics-method';
import { resolveCoachHrMethod } from '@/lib/coach/hr-method';
import { getAthleteReadinessToday } from '@/lib/coach/athlete-daily-readiness';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { defaultCoachHrMethod, hrZoneFractionsFrom } from '@fahybrid/shared/domain/coach/hr-method';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  bloquesVacios,
  cargaPlanificadaDeSesion,
  diasDelPeriodo,
  hechosDe,
  historiaDe,
  lecturasDelPanel,
  lecturasEstado,
  lecturasForma,
  lecturasSemanas,
  limitesUtc,
  preciarSesion,
  PROYECCION_MAX_DIAS,
  resolverVentana,
  serieDiaria,
  serieDiariaPlan,
  type BloquePanel,
  type CoachAnalyticsMethod,
  type PanelAnaliticas,
  type VentanaClave,
} from '@fahybrid/shared/domain/analytics';
import { loadAnclasAtleta } from './anclas';
import { cargarCumplimiento } from './cumplimiento';
import type { AtletaVerificado } from './atleta-verificado';
import { loadContexto, loadSesionesHechas, loadSesionesPlan } from './panel-datos';
import { cargarBloquesProgreso } from './progreso';
import { cargarIntensidadRecuperacionCarrera } from './panel-bloques';

/** Los bloques que este cargador aún no construye. Se quitan de aquí al servirlos. */
export const BLOQUES_PENDIENTES: readonly BloquePanel[] = [];

export async function cargarPanel(args: {
  atleta: AtletaVerificado;
  ventana: VentanaClave;
  now?: Date;
  client?: Sql;
  /** El método ya resuelto, si quien llama lo tiene; si no, se resuelve del coach del atleta. */
  metodo?: CoachAnalyticsMethod;
}): Promise<PanelAnaliticas> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const { atleta } = args;

  const contexto = await loadContexto(atleta, now, client);
  const coachId = contexto.coach_id;
  const ventana = resolverVentana({ clave: args.ventana, hoy_local: contexto.hoy, primera_sesion_iso: contexto.historia.iso });

  const [metodo, hrMethod, anclas, carreraRow, readiness] = await Promise.all([
    args.metodo ?? resolveEffectiveAnalyticsMethod(coachId ?? 0, client),
    coachId != null ? resolveCoachHrMethod(coachId, client) : Promise.resolve(defaultCoachHrMethod()),
    loadAnclasAtleta(atleta, client),
    // La carrera «próxima» se cuenta desde el día del panel (su hoy local), no
    // desde el instante en que corre el servidor: un panel pedido «a fecha de»
    // tiene que ver la misma carrera que vio ese día.
    getTargetRaceRow(atleta.athlete_id, client, parseIsoDate(contexto.hoy)),
    getAthleteReadinessToday({ athlete_id: atleta.athlete_id, on_date: now, client }),
  ]);
  const fracciones_hr = hrZoneFractionsFrom(hrMethod);

  // El horizonte del plan: hasta la carrera (una temporada como mucho), o hoy.
  const hoy = parseIsoDate(contexto.hoy);
  const carrera = carreraRow ? { fecha: carreraRow.race_date, nombre: carreraRow.name } : null;
  const diasACarrera = carrera ? Math.round((parseIsoDate(carrera.fecha).getTime() - hoy.getTime()) / 86_400_000) : 0;
  const horizonte = carrera && diasACarrera > 0 && diasACarrera <= PROYECCION_MAX_DIAS ? carrera.fecha : contexto.hoy;
  const planDesde = ventana.anterior?.desde ?? ventana.desde;

  const [hechas, planificadas] = await Promise.all([
    loadSesionesHechas(atleta, contexto.tz, limitesUtc(ventana, contexto.tz).hasta_excl, client),
    loadSesionesPlan(atleta, planDesde, horizonte, client),
  ]);

  // LO HECHO, preciado tramo a tramo y puesto en su día: la serie diaria arranca
  // en la primera sesión (o en el borde de lo que se compara, si es anterior).
  const preciadas = hechas.map((s) => preciarSesion(s, { anclas, metodo, fracciones_hr }));
  const primerDia = [contexto.historia.iso, planDesde].filter((d): d is string => d != null).sort()[0] ?? contexto.hoy;
  const diario = serieDiaria(preciadas, diasDelPeriodo({ desde: primerDia, hasta: contexto.hoy }));

  // LO PLANIFICADO, línea a línea, en su día.
  const plan = serieDiariaPlan(
    planificadas.map((s) => cargaPlanificadaDeSesion(s, { anclas, fracciones_hr })),
    diasDelPeriodo({ desde: planDesde, hasta: horizonte }),
  );
  const planHastaHoy = plan.filter((d) => d.date <= contexto.hoy);
  const planFuturo = plan.filter((d) => d.date > contexto.hoy);

  const bloques = bloquesVacios();
  bloques.forma = lecturasForma({
    diario,
    plan_futuro: planFuturo,
    ventana,
    metodo,
    anclas,
    dias_de_historia: contexto.historia.dias,
    carrera,
    hoy: contexto.hoy,
  });
  bloques.semanas = lecturasSemanas({ diario, plan: planHastaHoy, ventana, metodo });
  bloques.semanas.push(...(await cargarCumplimiento({ atleta, contexto, ventana, metodo, anclas, fracciones_hr, preciadas, planificadas, now, client })).lecturas);
  const readinessHoy = readiness ? { score: readiness.score, recorded_for: readiness.recorded_for, delta_7d: readiness.delta_7d } : null;
  const propios = await cargarIntensidadRecuperacionCarrera({
    atleta, coach_id: coachId, tz: contexto.tz, hoy: contexto.hoy, now, ventana, metodo, hr: hrMethod, anclas, hechas, diario, carrera: carreraRow, readiness: readinessHoy, client,
  });
  bloques.intensidad = propios.intensidad;
  bloques.recuperacion = propios.recuperacion;
  bloques.carrera = propios.carrera;
  bloques.estado = lecturasEstado({
    readiness: readinessHoy,
    hoy: contexto.hoy,
    forma: bloques.forma,
    bandas_readiness: propios.bandas_readiness,
  });
  Object.assign(bloques, await cargarBloquesProgreso({ atleta, ventana, contexto, metodo, anclas, fracciones_hr, client }));

  return {
    athlete_id: String(atleta.athlete_id),
    generado_iso: now.toISOString(),
    ventana,
    historia: historiaDe({ dias_de_historia: contexto.historia.dias, primera_sesion_iso: contexto.historia.iso, ventana_dias: ventana.dias }),
    metodo,
    anclas,
    bloques,
    pendientes: [...BLOQUES_PENDIENTES],
    hechos: hechosDe(lecturasDelPanel(bloques), metodo),
  };
}

/** El día siguiente a `dia` (ISO). Para quien calcule horizontes a mano. */
export function diaSiguiente(dia: string): string {
  return isoDateString(addDays(parseIsoDate(dia), 1));
}
