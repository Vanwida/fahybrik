// LOS MECANISMOS — lo que es NUESTRO en las analíticas (HARD RULE Nº0):
// cómo se corta una ventana y su periodo anterior, cómo se lee una frescura
// contra unas bandas, cómo se compara una cifra con su referencia en la MISMA
// unidad que la juzga (A3), cómo se decide «dentro» de un tramo (A8), cómo se
// proyecta la forma con la carga planificada (A7), cómo se deriva el estado
// de un bloque (A10) y cómo se escala un eje. Todo puro, todo con test
// (`tests/design-twin/kit-analiticas.test.ts`), y sin un solo número que sea
// método: los números vienen de `metodo.ts`.
//
// La forma y la fatiga NO se reimplementan: se llama al Banister de
// `shared/domain/training-load` — el mismo que ejecuta el servidor.

import { computeLoadSeries, type DailyTss, type LoadPoint } from '@fahybrid/shared/domain/training-load';
import {
  VENTANA_DIAS,
  type Ancla,
  type ClaseVeredicto,
  type Comparacion,
  type Cumplimiento,
  type EstadoBloque,
  type EstadoFrescuraClave,
  type LecturaPanel,
  type RangoVentana,
  type RecordPanel,
  type UnidadPanel,
  type VeredictoForma,
  type Ventana,
} from './contrato';
import type { BandaFrescura, EjeCumplimiento, MetodoAnaliticas, ToleranciaEje } from './metodo';

// ---------------------------------------------------------------------------
// Fechas, escala de ejes y agrupación — son mecanismo de PINTADO y viven en el
// producto (`components/v2/analiticas/escala.ts`): el doble los importa de allí.
// ---------------------------------------------------------------------------

import { agruparPuntos, diasEntre, escalaBonita, isoDe, lunesDe, sumarDias, tamanoGrupo, PASOS_TIEMPO, type Escala } from '@/components/v2/analiticas/escala';

export { agruparPuntos, diasEntre, escalaBonita, isoDe, lunesDe, sumarDias, tamanoGrupo, PASOS_TIEMPO, type Escala };

// ---------------------------------------------------------------------------
// La ventana (A4)
// ---------------------------------------------------------------------------

/**
 * Corta la ventana pedida en el día local del atleta y calcula el periodo
 * anterior de igual longitud. `todo` va desde la primera sesión; sin ninguna,
 * cae a un año (no hay desde cuándo contar).
 */
export function rangoDe(ventana: Ventana, hoy: string, primeraSesion: string | null): RangoVentana {
  const dias =
    ventana === 'todo'
      ? primeraSesion
        ? Math.max(7, diasEntre(primeraSesion, hoy) + 1)
        : VENTANA_DIAS['1a']
      : VENTANA_DIAS[ventana];
  const desde = sumarDias(hoy, -(dias - 1));
  return {
    ventana,
    desde,
    hasta: hoy,
    dias,
    paso: dias <= 7 ? 'dia' : 'semana',
    anterior: { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) },
    cubre_todo: primeraSesion != null && desde <= primeraSesion,
  };
}

/** Las semanas (lunes) que caen dentro de la ventana, de la más vieja a la actual. */
export function semanasDe(rango: RangoVentana): string[] {
  const out: string[] = [];
  let lunes = lunesDe(rango.desde);
  const ultimo = lunesDe(rango.hasta);
  while (lunes <= ultimo) {
    out.push(lunes);
    lunes = sumarDias(lunes, 7);
  }
  return out;
}

// ---------------------------------------------------------------------------
// La frescura contra las bandas del coach
// ---------------------------------------------------------------------------

export function estadoFrescuraDe(tsb: number, bandas: readonly BandaFrescura[]): BandaFrescura {
  for (const b of bandas) if (b.hasta == null || tsb <= b.hasta) return b;
  return bandas[bandas.length - 1]!;
}

// ---------------------------------------------------------------------------
// Comparar (A3)
// ---------------------------------------------------------------------------

export function comparar(args: {
  actual: number;
  referencia: number;
  contra: Comparacion['contra'];
  /** Umbral de cambio del método, en la misma unidad que el dato. */
  umbral: number;
  etiqueta_es: string;
  menos_es_mejor?: boolean;
}): Comparacion {
  const delta = args.actual - args.referencia;
  return {
    contra: args.contra,
    valor: args.referencia,
    delta,
    delta_pct: args.referencia !== 0 ? (delta / Math.abs(args.referencia)) * 100 : null,
    significativo: Math.abs(delta) >= args.umbral,
    etiqueta_es: args.etiqueta_es,
    ...(args.menos_es_mejor != null ? { menos_es_mejor: args.menos_es_mejor } : {}),
  };
}

/** ¿Es mejor el delta? Depende de la unidad: menos segundos por km es mejor; más vatios, mejor. */
export function menosEsMejor(unidad: UnidadPanel): boolean {
  return unidad === 's_km' || unidad === 's_500m' || unidad === 's_1000m' || unidad === 'segundos' || unidad === 'bpm';
}

/** ¿Mejora esta comparación? La comparación lo dice si lo sabe; si no, la unidad. */
export function esMejora(c: Comparacion, unidad: UnidadPanel): boolean {
  const menos = c.menos_es_mejor ?? menosEsMejor(unidad);
  return menos ? c.delta < 0 : c.delta > 0;
}

// ---------------------------------------------------------------------------
// Cumplimiento por tramo (A8)
// ---------------------------------------------------------------------------

/** La banda [lo, hi] de un objetivo puntual con la tolerancia del coach. */
export function bandaDe(objetivo: number, tol: ToleranciaEje): [number, number] {
  const h = tol.tipo === 'pct' ? Math.abs(objetivo) * (tol.valor / 100) : tol.valor;
  return [objetivo - h, objetivo + h];
}

/**
 * Dentro / más de lo pedido / menos de lo pedido, con «más» leído como MÁS
 * INTENSIDAD: en ritmo y split menos segundos es más; en RIR menos RIR es más.
 */
export function cumplimientoDe(
  eje: EjeCumplimiento,
  objetivo: number | [number, number],
  hecho: number | null,
  tolerancias: Record<EjeCumplimiento, ToleranciaEje>,
): Cumplimiento {
  if (hecho == null) return 'no-hecha';
  const tol = tolerancias[eje];
  const [lo, hi] = Array.isArray(objetivo) ? objetivo : bandaDe(objetivo, tol);
  if (hecho >= lo && hecho <= hi) return 'dentro';
  const porArriba = hecho > hi;
  return porArriba === tol.masEsMas ? 'por-encima' : 'por-debajo';
}

// ---------------------------------------------------------------------------
// Proyección de forma y frescura (A7) — el Banister del servidor, no otro
// ---------------------------------------------------------------------------

export interface Proyeccion {
  /** Hasta hoy, calculado sobre TODA la historia (el arranque en frío sostiene y no se ve). */
  pasado: LoadPoint[];
  /** De mañana a la carrera, con la carga planificada. */
  futuro: LoadPoint[];
}

export function proyectar(hecho: readonly DailyTss[], planFuturo: readonly DailyTss[], metodo: MetodoAnaliticas): Proyeccion {
  const todo = computeLoadSeries([...hecho, ...planFuturo], { ctl_tau: metodo.ctl_days, atl_tau: metodo.atl_days });
  return { pasado: todo.slice(0, hecho.length), futuro: todo.slice(hecho.length) };
}

/** Subida del fondo en los últimos 7 días, en unidades de carga por semana. */
export function subidaSemana(serie: readonly LoadPoint[]): number | null {
  if (serie.length < 8) return null;
  return serie[serie.length - 1]!.ctl - serie[serie.length - 8]!.ctl;
}

// ---------------------------------------------------------------------------
// El veredicto de forma — con retirada por cobertura (§4)
// ---------------------------------------------------------------------------

export function veredictoForma(args: {
  subida: number | null;
  estado: EstadoFrescuraClave | null;
  cobertura_pct: number | null;
  estimada_pct: number | null;
  metodo: MetodoAnaliticas;
}): VeredictoForma {
  const { metodo } = args;
  const base = { cobertura_pct: args.cobertura_pct, estimada_pct: args.estimada_pct };
  if (args.cobertura_pct == null || args.subida == null || args.estado == null) {
    return { ...base, clase: 'sin-veredicto', frase_es: 'Todavía sin veredicto', retirado_es: 'Falta carga calculada para decir si vas a más.' };
  }
  if (args.cobertura_pct < metodo.cobertura_minima_veredicto_pct) {
    return {
      ...base,
      clase: 'sin-veredicto',
      frase_es: 'Sin veredicto',
      retirado_es: `Solo el ${Math.round(args.cobertura_pct)} % de tu carga se ha podido calcular; el veredicto necesita el ${metodo.cobertura_minima_veredicto_pct} %.`,
    };
  }
  const estimada = args.estimada_pct != null && args.estimada_pct > 0 ? ` El ${Math.round(args.estimada_pct)} % de la carga va con umbral estimado.` : '';
  const subida = Math.round(args.subida * 10) / 10;
  const subidaTxt = subida.toFixed(1).replace('.', ',');
  let clase: ClaseVeredicto;
  let frase: string;
  if (args.estado === 'sobrecarga' || args.subida > metodo.ramp_alert_tss_per_week) {
    clase = 'te-pasas';
    frase = `Te pasas: la forma sube ${subidaTxt} por semana, más de lo que asimilas (tu coach avisa a partir de ${metodo.ramp_alert_tss_per_week}).`;
  } else if (args.subida >= 1 && (args.estado === 'optimo' || args.estado === 'mantener')) {
    clase = 'a-mas';
    frase = `Vas a más: la forma sube ${subidaTxt} por semana y la fatiga va a la par.`;
  } else if (args.subida <= -1) {
    clase = 'mantiene';
    frase = `La forma baja ${subidaTxt.replace('-', '')} por semana: descansas más de lo que entrenas.`;
  } else {
    clase = 'mantiene';
    frase = `Mantienes: la forma no se mueve (${subidaTxt} por semana).`;
  }
  return { ...base, clase, frase_es: frase + estimada, retirado_es: null };
}

// ---------------------------------------------------------------------------
// El estado de un bloque (A10) — derivado, no escrito a mano
// ---------------------------------------------------------------------------

export function diasDesde(iso: string | null, hoy: string): number | null {
  return iso == null ? null : diasEntre(iso, hoy);
}

/**
 * vacío: ninguna lectura tiene dato y ninguna lleva historia empezada · poco:
 * alguna espera historia (con algo ya andado), no llega a las muestras
 * mínimas o cubre menos ventana de la que el coach exige · viejo: el dato
 * más reciente supera los días del coach · lleno: lo demás.
 */
export function estadoDeBloque(lecturas: readonly LecturaPanel[], hoy: string, metodo: MetodoAnaliticas): EstadoBloque {
  const conDato = lecturas.filter((l) => l.estado === 'medida');
  const esperaHistoria = (l: LecturaPanel) => l.estado === 'sin_dato' && l.cobertura.falta?.por === 'historia' && l.cobertura.falta.llevas > 0;
  if (conDato.length === 0) return lecturas.some(esperaHistoria) ? 'poco' : 'vacio';
  const poco = lecturas.some(
    (l) =>
      esperaHistoria(l) ||
      (l.estado === 'medida' && l.cobertura.muestras < metodo.muestras_minimas) ||
      (l.estado === 'medida' && l.cobertura.pct != null && l.cobertura.pct < metodo.cobertura_poco_pct),
  );
  if (poco) return 'poco';
  const ultimos = conDato.map((l) => l.cobertura.ultimo_dato).filter((x): x is string => x != null);
  if (ultimos.length > 0) {
    const masReciente = ultimos.reduce((a, b) => (a > b ? a : b));
    if (diasEntre(masReciente, hoy) > metodo.dato_viejo_dias) return 'viejo';
  }
  return 'lleno';
}

/** Los récords no son lecturas: vacío sin ninguno, poco con menos que las muestras mínimas, viejo si el último es más viejo que el tope del coach, lleno si no. */
export function estadoDeRecords(records: readonly RecordPanel[], hoy: string, metodo: MetodoAnaliticas): EstadoBloque {
  if (records.length === 0) return 'vacio';
  if (records.length < metodo.muestras_minimas) return 'poco';
  const ultimo = records.map((r) => r.fecha).reduce((a, b) => (a > b ? a : b));
  return diasEntre(ultimo, hoy) > metodo.dato_viejo_dias ? 'viejo' : 'lleno';
}

/** La carrera: vacío sin carrera elegida; poco con menos tramos con dato que el mínimo; viejo si la última marca que la sostiene es vieja. */
export function estadoDeCarrera(carrera: { cobertura: { con_dato: number; de: number }; tramos: ReadonlyArray<{ ancla: Ancla }> } | null, ultimoDato: string | null, hoy: string, metodo: MetodoAnaliticas): EstadoBloque {
  if (!carrera) return 'vacio';
  if (carrera.cobertura.con_dato < carrera.cobertura.de) return 'poco';
  if (ultimoDato != null && diasEntre(ultimoDato, hoy) > metodo.dato_viejo_dias) return 'viejo';
  return 'lleno';
}

// ---------------------------------------------------------------------------
// Récords: lo nuevo es lo conseguido dentro de la ventana
// ---------------------------------------------------------------------------

export function marcarNuevos(records: readonly Omit<RecordPanel, 'nuevo'>[], rango: RangoVentana): RecordPanel[] {
  return records.map((r) => ({ ...r, nuevo: r.fecha >= rango.desde && r.fecha <= rango.hasta }));
}

/** Cuánto cuenta un ancla para la cobertura: la poblacional, nada. */
export function anclaCuenta(a: Ancla): boolean {
  return a !== 'poblacional';
}

// ---------------------------------------------------------------------------
// Carga por esfuerzo (peldaño 4): RPE × minutos → unidades de carga
// ---------------------------------------------------------------------------

/** sRPE: (rpe/10)² × horas × tss de una hora a RPE 10. En fuerza, RPE = 10 − RIR si solo hay RIR. */
export function cargaPorEsfuerzo(rpe: number, segundos: number, metodo: MetodoAnaliticas): number {
  const intensidad = Math.max(0, Math.min(10, rpe)) / 10;
  return intensidad * intensidad * (segundos / 3600) * metodo.esfuerzo_tss_hora_rpe10;
}
