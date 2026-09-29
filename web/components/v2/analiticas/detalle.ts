// LOS DETALLES QUE EL PANEL PIDE APARTE — el cumplimiento tramo a tramo
// (`GET …/analytics/cumplimiento?ventana=`) y el detalle de una sesión
// (`GET …/analytics/sesion/[executionId]`), el mismo cálculo que ve el atleta
// (A1). Los construyen otras sesiones sobre el mismo contrato (modelo §5): hasta
// que su ruta existe, la petición contesta 404 y el panel pinta su hueco como
// «todavía no se calcula aquí», sin inventar.
//
// POR QUÉ UN TIPO DE CONSUMO Y NO EL TIPO DEL MOTOR. Las dos formas viven en
// ramas que aún no están fusionadas; importar sus tipos haría que esta pestaña
// no compilara hasta entonces. Aquí se declara SOLO lo que el panel lee (un
// subconjunto estructural del sobre del motor): cuando las ramas se fusionen, se
// sustituyen por `DetalleCumplimiento` y `DetalleSesion` de sus módulos y el
// compilador dirá si algo no casa. Lo que no está aquí, el panel no lo usa.
//
// LA FUENTE ES INYECTABLE: el producto pide por HTTP (`fuenteHttp`); el doble
// entrega casos (`kit-analiticas/casos`). La vista no sabe de dónde vienen.

import type { VentanaClave } from '@fahybrid/shared/domain/analytics/ventana';
import type { Ancla, Familia, Lectura } from '@fahybrid/shared/domain/analytics/lectura';

// ---------------------------------------------------------------------------
// El cumplimiento — sesión → línea → tramo → comprobación
// ---------------------------------------------------------------------------

export type VeredictoTramo = 'dentro' | 'por_encima' | 'por_debajo' | 'sin_dato';

export interface ComprobacionConsumo {
  eje: string;
  pregunta: string;
  unidad: string | null;
  objetivo: { min: number | null; max: number | null; zona: { desde: number; hasta: number } | null; ancla: Ancla | null } | null;
  hecho: number | null;
  veredicto: VeredictoTramo;
  motivo: string | null;
}

export interface FilaTramoConsumo {
  segment_execution_id: string;
  posicion: number;
  papel: 'trabajo' | 'recuperacion';
  fase: 'calentamiento' | 'principal' | 'vuelta';
  ordinal: number | null;
  veredicto: VeredictoTramo;
  motivo: string | null;
  comprobaciones: ComprobacionConsumo[];
  series: Array<{ indice: number; veredicto: VeredictoTramo; comprobaciones: ComprobacionConsumo[] }>;
}

export interface FilaLineaConsumo {
  template_segment_id: string;
  ejercicio: string | null;
  familia: Familia;
  rol: string;
  estado: string;
  tramos: FilaTramoConsumo[];
}

export type EstadoSesionConsumo = 'cumplida' | 'desviada' | 'fuera' | 'no_hecha' | 'hecha_sin_medida' | 'pendiente' | 'excluida';

export interface FilaSesionConsumo {
  assignment_id: string;
  execution_id: string | null;
  dia: string;
  titulo: string | null;
  estado: EstadoSesionConsumo;
  color: 'verde' | 'ambar' | 'rojo' | 'gris' | null;
  hecha: boolean;
  /** Contra qué se comparó: carga, duración o distancia (la primera que las dos partes saben). */
  base: string | null;
  unidad: string | null;
  plan: number | null;
  hecho: number | null;
  pct: number | null;
  plan_minimo: boolean;
  ancla: Ancla | null;
  tramos: { total: number; evaluables: number; dentro: number; por_encima: number; por_debajo: number; sin_dato: number; sin_ejecutar: number };
  lineas: FilaLineaConsumo[];
}

export interface DetalleCumplimientoConsumo {
  lecturas: Lectura[];
  /** Las sesiones del plan de la ventana, la más reciente primero. */
  sesiones: FilaSesionConsumo[];
}

// ---------------------------------------------------------------------------
// El detalle de una sesión — su carga tramo a tramo y su traza
// ---------------------------------------------------------------------------

export interface TramoSesionConsumo {
  id: string;
  posicion: number;
  familia: Familia;
  ejercicio_es: string | null;
  papel: string | null;
  fase: string | null;
  segundos: number | null;
  prescrito: { texto_es: string } | null;
  hecho: {
    duration_seconds: number | null;
    distance_meters: number | null;
    avg_pace_s_per_km: number | null;
    avg_pace_s_per_500m: number | null;
    avg_power_w: number | null;
    avg_hr: number | null;
    run_cadence_spm: number | null;
    reps_completed: number | null;
    weight_used_kg: number | null;
  } | null;
  carga: { tss: number | null; peldano: 'potencia' | 'ritmo' | 'pulso' | 'esfuerzo' | null; ancla: Ancla | null } | null;
}

export interface DetalleSesionConsumo {
  execution_id: string;
  dia: string;
  titulo_es: string | null;
  formato: string | null;
  fuera_del_plan: string | null;
  lecturas: Lectura[];
  tramos: TramoSesionConsumo[];
  traza: { pulso: { offsets_s: readonly number[]; values: readonly number[] } | null };
}

// ---------------------------------------------------------------------------
// La fuente
// ---------------------------------------------------------------------------

/** `pendiente`: la ruta aún no existe (o la sesión no tiene detalle) · `error`: falló la red o el servidor. */
export type Resultado<T> = { estado: 'ok'; datos: T } | { estado: 'pendiente' } | { estado: 'error' };

export interface FuenteDetalle {
  cumplimiento: (ventana: VentanaClave) => Promise<Resultado<DetalleCumplimientoConsumo>>;
  sesion: (executionId: string) => Promise<Resultado<DetalleSesionConsumo>>;
}

async function pedir<T>(url: string): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (res.status === 404) return { estado: 'pendiente' };
    if (!res.ok) return { estado: 'error' };
    const cuerpo = (await res.json().catch(() => null)) as T | null;
    return cuerpo == null ? { estado: 'error' } : { estado: 'ok', datos: cuerpo };
  } catch {
    return { estado: 'error' };
  }
}

/** Las rutas del coach sobre su atleta (el ámbito de club lo comprueba cada ruta). */
export function fuenteHttp(athleteId: string): FuenteDetalle {
  const base = `/api/coach/athletes/${encodeURIComponent(athleteId)}/analytics`;
  return {
    cumplimiento: (ventana) => pedir<DetalleCumplimientoConsumo>(`${base}/cumplimiento?ventana=${ventana}`),
    sesion: (executionId) => pedir<DetalleSesionConsumo>(`${base}/sesion/${encodeURIComponent(executionId)}`),
  };
}
