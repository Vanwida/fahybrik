import 'server-only';

// INTENSIDAD, RECUPERACIÓN Y CARRERA — tres bloques del panel, cargados de una
// vez (docs/analiticas/modelo.md §3 filas 4, 7 y 8).
//
// `cargarPanel` los pide con UNA llamada y les pasa lo que ya tiene resuelto (el
// contexto, la ventana, el método, las anclas, las sesiones hechas y la serie
// diaria de la carga única): nada de eso se vuelve a leer ni a calcular aquí.
// Lo que sí se lee aquí es lo propio de estos bloques: las zonas de ritmo del
// coach, las muestras de recuperación con su día, los readiness guardados, los
// umbrales de señal del coach (bandas del readiness y pesos de la disposición),
// lo debido día a día y la previsión de la pizarra de carrera.
//
// Las muestras de variabilidad se leen UNA vez y las usan la recuperación y la
// disposición: la basal de las dos es la misma, y la muestra también.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getCoachPaceZones } from '@/lib/coach/methodology-zones';
import { resolveCoachThresholds } from '@/lib/coach/signal-thresholds';
import {
  lecturasIntensidad,
  lecturasRecuperacionPanel,
  primerDiaNecesario,
  ventanaBasalDe,
  type AnclasAtleta,
  type BandasReadiness,
  type CoachAnalyticsMethod,
  type DiaCarga,
  type Lectura,
  type SesionHecha,
  type VentanaResuelta,
} from '@fahybrid/shared/domain/analytics';
import { hrZoneFractionsFrom, type CoachHrMethod } from '@fahybrid/shared/domain/coach/hr-method';
import { DEFAULT_COACH_THRESHOLDS, type CoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { TargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';
import { resolveHrZones, resolveZonesForAthlete, standardZonesFor, type ResolvedZone } from '@fahybrid/shared/domain/methodology';
import type { AtletaVerificado } from './atleta-verificado';
import { cargarCarrera } from './carrera';
import { loadMuestrasRecuperacion, loadSerieReadiness } from './recuperacion';

export interface BloquesIntensidadRecuperacionCarrera {
  intensidad: Lectura[];
  recuperacion: Lectura[];
  carrera: Lectura[];
  /** Las bandas del readiness del coach, para la cabecera (`estado.readiness`). */
  bandas_readiness: BandasReadiness;
}

/** Las bandas del readiness de un coach, en el vocabulario del panel. */
export function bandasReadinessDe(t: CoachThresholds): BandasReadiness {
  return { ok_min: t.readiness_ok_min, cautela_min: t.readiness_caution_min, max_edad_dias: t.readiness_max_age_days };
}

/** Las seis zonas de ritmo del coach sobre el umbral de correr del atleta. Null sin umbral o con un modelo roto. */
async function zonasRitmoCorrer(anclas: AnclasAtleta, coachId: number | null, client: Sql): Promise<{ ancla: NonNullable<AnclasAtleta['ritmo']['run']>; zonas: ResolvedZone[] } | null> {
  const ancla = anclas.ritmo.run;
  if (!ancla) return null;
  const modelo = coachId != null ? (await getCoachPaceZones(coachId, 'per_km', client)).zones : [...standardZonesFor('per_km')];
  try {
    return { ancla, zonas: resolveZonesForAthlete({ modality: 'run', threshold_s: ancla.valor, pace_unit: 'per_km' }, modelo) };
  } catch {
    // Un modelo que no resuelve (no son seis zonas, un ritmo negativo) no pinta zonas inventadas.
    return null;
  }
}

export async function cargarIntensidadRecuperacionCarrera(args: {
  atleta: AtletaVerificado;
  coach_id: number | null;
  tz: string;
  hoy: string;
  now: Date;
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
  hr: CoachHrMethod;
  anclas: AnclasAtleta;
  hechas: readonly SesionHecha[];
  diario: readonly DiaCarga[];
  carrera: TargetRaceRow | null;
  /** El readiness de hoy (cómputo fresco) o el último guardado. */
  readiness: { score: number; recorded_for: string; delta_7d: number | null } | null;
  client?: Sql;
}): Promise<BloquesIntensidadRecuperacionCarrera> {
  const client = args.client ?? defaultSql;
  const { atleta, ventana, metodo, hoy } = args;
  const primerDia = ventana.anterior?.desde ?? ventana.desde;

  const [umbrales, ritmo, muestras, serieReadiness] = await Promise.all([
    args.coach_id != null ? resolveCoachThresholds(args.coach_id, client) : Promise.resolve({ ...DEFAULT_COACH_THRESHOLDS }),
    zonasRitmoCorrer(args.anclas, args.coach_id, client),
    loadMuestrasRecuperacion(atleta, { tz: args.tz, desde: primerDiaNecesario(primerDia, ventanaBasalDe(metodo)), hasta: hoy }, client),
    loadSerieReadiness(atleta, { desde: primerDia, hasta: hoy }, client),
  ]);
  const bandas = bandasReadinessDe(umbrales);

  const intensidad = lecturasIntensidad({
    sesiones: args.hechas,
    ventana,
    metodo,
    hr: args.hr,
    pulso: {
      ancla: args.anclas.pulso,
      bandas: args.anclas.pulso ? (resolveHrZones({ lthr_bpm: args.anclas.pulso.valor }, hrZoneFractionsFrom(args.hr))?.bands ?? null) : null,
    },
    ritmo_correr: ritmo,
  });

  const recuperacion = lecturasRecuperacionPanel({
    hoy,
    ventana,
    metodo,
    vfc: muestras.vfc,
    pulso_reposo: muestras.pulso_reposo,
    sueno: muestras.sueno,
    proveedor: muestras.proveedor,
    readiness: {
      hoy: args.readiness ? { puntos: args.readiness.score, dia: args.readiness.recorded_for, delta_7d: args.readiness.delta_7d } : null,
      serie: serieReadiness,
      bandas,
    },
  });

  const carrera = await cargarCarrera({
    atleta,
    now: args.now,
    hoy,
    ventana,
    metodo,
    umbrales,
    carrera: args.carrera,
    diario: args.diario,
    vfc: muestras.vfc,
    client,
  });

  return { intensidad, recuperacion, carrera, bandas_readiness: bandas };
}
