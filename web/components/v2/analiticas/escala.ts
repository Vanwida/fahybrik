// LA ESCALA DE LOS GRÁFICOS — mecanismo de PINTADO de las analíticas (no de
// cálculo): cómo se reparten las marcas de un eje, cómo se cuentan los días
// entre dos fechas ISO y cómo se agrupan las semanas cuando no caben legibles.
//
// Vive en el producto (la pestaña Rendimiento del coach) y el doble lo importa
// de aquí (`design-twin/kit-analiticas/mecanismo.ts` lo reexporta): el doble
// replica el producto, no al revés.
//
// Puro. La aritmética de fechas va sobre el ISO en UTC a propósito: el huso del
// navegador no decide en qué día cae un entreno.

import type { PuntoSerie } from '@fahybrid/shared/domain/analytics/lectura';

const MS_DIA = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** `YYYY-MM-DD` de un instante UTC. */
export function isoDe(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function sumarDias(iso: string, n: number): string {
  return isoDe(utc(iso) + n * MS_DIA);
}

/** `b − a` en días (positivo si b es después). */
export function diasEntre(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / MS_DIA);
}

/** El lunes de la semana de `iso`. */
export function lunesDe(iso: string): string {
  const dow = new Date(utc(iso)).getUTCDay();
  const desdeLunes = dow === 0 ? 6 : dow - 1;
  return sumarDias(iso, -desdeLunes);
}

// ---------------------------------------------------------------------------
// Agrupar para ventanas largas — un hueco sigue siendo un hueco
// ---------------------------------------------------------------------------

/**
 * Agrupa `tamano` puntos consecutivos (semanas → bloques de 4 semanas) cuando
 * no caben legibles. Un grupo todo a null sigue a null: el hueco no se tapa.
 */
export function agruparPuntos(puntos: readonly PuntoSerie[], tamano: number, modo: 'suma' | 'media' = 'suma'): PuntoSerie[] {
  if (tamano <= 1) return [...puntos];
  const out: PuntoSerie[] = [];
  for (let i = 0; i < puntos.length; i += tamano) {
    const grupo = puntos.slice(i, i + tamano);
    const vals = grupo.map((p) => p.v).filter((v): v is number => v != null);
    const v = vals.length === 0 ? null : modo === 'suma' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ t: grupo[0]!.t, v });
  }
  return out;
}

/** Cuántos puntos por grupo para que cada columna tenga al menos `minAncho` px. */
export function tamanoGrupo(puntos: number, anchoDisponible: number, minAncho: number): number {
  if (puntos <= 0) return 1;
  return Math.max(1, Math.ceil(puntos / Math.max(1, Math.floor(anchoDisponible / minAncho))));
}

/** Cuántos cubos caben legibles en `ancho` px: de uno en uno; si no, de 2 en 2 o de 4 en 4 (un mes). */
export function agrupacionDe(n: number, ancho: number, minAncho = 20): number {
  const g = tamanoGrupo(n, ancho, minAncho);
  return g <= 1 ? 1 : g <= 2 ? 2 : 4;
}

// ---------------------------------------------------------------------------
// Escala de ejes: números redondos, siempre
// ---------------------------------------------------------------------------

function pasoBonito(bruto: number, permitidos?: readonly number[]): number {
  if (bruto <= 0 || !Number.isFinite(bruto)) return 1;
  if (permitidos && permitidos.length) return permitidos.find((p) => p >= bruto) ?? permitidos[permitidos.length - 1]!;
  const exp = Math.floor(Math.log10(bruto));
  const f = bruto / 10 ** exp;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * 10 ** exp;
}

/** Los pasos que un eje de TIEMPO admite: 5 s, 10 s, 15 s, 30 s, 1, 2, 5, 10, 15, 30 min, 1 h. Un eje de ritmo a «2:30 · 3:20 · 4:10» no lo lee nadie. */
export const PASOS_TIEMPO: readonly number[] = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export interface Escala {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Escala «bonita» que cubre [min, max] con ~`n` marcas redondas. Nunca más
 * de n + 2 marcas: si el paso bonito deja demasiadas, se dobla.
 */
export function escalaBonita(min: number, max: number, n = 4, opciones?: { desdeCero?: boolean; pasos?: readonly number[] }): Escala {
  let lo = opciones?.desdeCero ? Math.min(0, min) : min;
  let hi = opciones?.desdeCero ? Math.max(0, max) : max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) {
    hi = lo + 1;
  }
  const construir = (paso: number): Escala => {
    const niceMin = Math.floor(lo / paso) * paso;
    const niceMax = Math.ceil(hi / paso) * paso;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + paso / 2; v += paso) ticks.push(Math.round(v * 1e6) / 1e6);
    return { min: niceMin, max: niceMax, ticks };
  };
  let paso = pasoBonito((hi - lo) / Math.max(1, n - 1), opciones?.pasos);
  let escala = construir(paso);
  let vueltas = 0;
  while (escala.ticks.length > n + 2 && vueltas < 6) {
    paso = opciones?.pasos ? (opciones.pasos.find((p) => p > paso) ?? paso * 2) : paso * 2;
    escala = construir(paso);
    vueltas += 1;
  }
  return escala;
}
