// FORMATEADORES DE CARRERAS — uno por concepto (CONTRATO-UI §2), puros.
//
// Espejo de `Formato` / `GoalGapFormat` / `AthleteNextRace` en Swift. Las dos
// escalas que el atleta ve juntas:
//   · TOTALES de carrera (meta, predicho, resultado): minutos corridos, «64:32».
//     Es la escala de «sub-60»: el marcador de carrera habla en minutos
//     (`Formato.clock(_, enHoras: false)`). Un atleta compara su meta con su
//     resultado, así que las tres cifras no pueden estar en escalas distintas.
//   · PARCIALES (vueltas, estaciones, RoxZone): m:ss, «4:12».

import type { FondoCarrera } from '../kit-dia/tokens';
import type { Categoria, CarreraPasada, CompaneroDeEquipo, Division, Formato, Prioridad, ProximaCarrera, Severidad } from './contrato';

const dos = (n: number) => String(n).padStart(2, '0');

/** «4:12» (o «1:04:12» si pasa de la hora). Los parciales. */
export function reloj(segundos: number): string {
  const t = Math.max(0, Math.round(segundos));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

/** «64:32»: minutos corridos, jamás «1:04:32». Los totales de carrera. */
export function relojCarrera(segundos: number): string {
  const t = Math.max(0, Math.round(segundos));
  return `${Math.floor(t / 60)}:${dos(t % 60)}`;
}

/** «+0:42», «−0:08», «±0:00». El menos es el de verdad (U+2212), como el resto de deltas de la app. */
export function conSigno(segundos: number): string {
  const magnitud = reloj(Math.abs(segundos));
  if (segundos > 0) return `+${magnitud}`;
  if (segundos < 0) return `−${magnitud}`;
  return `±${magnitud}`;
}

/**
 * La meta como la dice el atleta: «Sub-65» si son minutos redondos, el reloj
 * exacto si no («64:30»). Espejo de `goalLabel` (shared/domain/goal-gap/label.ts),
 * con la escala de minutos de arriba para lo no redondo.
 */
export function metaTexto(segundos: number): string {
  const t = Math.round(segundos);
  return t > 0 && t % 60 === 0 ? `Sub-${t / 60}` : relojCarrera(t);
}

/** «96 %» (con espacio, como `Formato.porcentaje`). */
export function porcentaje(valor: number): string {
  return `${Math.round(valor)} %`;
}

/** «día» / «días»: un solo sitio para que la cuenta atrás, el pie y el lector de pantalla pluralicen igual. */
export function unidadDias(n: number): string {
  return n === 1 ? 'día' : 'días';
}

// ── Fechas (ISO YYYY-MM-DD, sin husos: el «hoy» ya viene resuelto) ─────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

function partes(iso: string): { a: number; m: number; d: number } {
  const [a, m, d] = iso.split('-').map(Number);
  return { a, m, d };
}

const utc = (iso: string) => {
  const { a, m, d } = partes(iso);
  return Date.UTC(a, m - 1, d);
};

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

/** ISO + n días. */
export function sumaDias(iso: string, n: number): string {
  const f = new Date(utc(iso) + n * 86_400_000);
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;
}

/** «8 nov», o «8 nov 2027» si no es del año de `hoy`. */
export function fechaCorta(iso: string, hoy: string): string {
  const { a, m, d } = partes(iso);
  return `${d} ${MESES[m - 1]}${a === partes(hoy).a ? '' : ` ${a}`}`;
}

/** «Noviembre 2026»: la cabecera de un mes en el calendario. */
export function mesLargo(iso: string): string {
  const { a, m } = partes(iso);
  return `${MESES_LARGOS[m - 1]} ${a}`;
}

/** «nov 25»: el mes y el año corto, para el eje de una gráfica donde una fecha entera no cabe. */
export function mesAnio(iso: string): string {
  const { a, m } = partes(iso);
  return `${MESES[m - 1]} ${String(a).slice(2)}`;
}

/** «Sáb 8 nov»: para lo que viene, el día de la semana importa (se organiza el fin de semana). */
export function fechaConDia(iso: string, hoy: string): string {
  const dia = DIAS[new Date(utc(iso)).getUTCDay()];
  return `${dia} ${fechaCorta(iso, hoy)}`;
}

/** «Ayer» / «Hace 3 días» (desde 1). */
export function haceCuanto(dias: number): string {
  return dias === 1 ? 'Ayer' : `Hace ${dias} días`;
}

/** Fecha de una carrera con la frase por defecto de la app para las que no la traen. */
export function fechaOConfirmar(iso: string | null, hoy: string): string {
  return iso ? fechaCorta(iso, hoy) : 'Fecha por confirmar';
}

// ── Etiquetas (tokens de cable → texto de cara al atleta) ─────────────────────

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  target: 'Objetivo principal',
  secondary: 'Secundaria',
  // «Tune-up» es inglés: en español de box, la carrera de puesta a punto.
  tune_up: 'Puesta a punto',
};

const ETIQUETA_FORMATO: Record<Formato, string> = { singles: 'Individual', doubles: 'Dobles', relay: 'Relevos' };
const ETIQUETA_DIVISION: Record<Division, string> = { open: 'Open', pro: 'Pro', elite: 'Elite' };
const ETIQUETA_CATEGORIA: Record<Categoria, string> = { men: 'Hombres', women: 'Mujeres', mixed: 'Mixto' };

export const esPrincipal = (c: Pick<ProximaCarrera, 'prioridad'>): boolean => (c.prioridad ?? 'target') === 'target';
export const esDeEquipo = (formato: Formato): boolean => formato !== 'singles';
/** Etiqueta del chip de equipo: «Dobles» o «Relevos» (en Swift el historial decía «Relay»). */
export const etiquetaEquipo = (formato: Formato): string | null => (formato === 'singles' ? null : ETIQUETA_FORMATO[formato]);

/**
 * «Individual · Open · Hombres». En una carrera que NO es HYROX ni DEKA el
 * servidor rellena estos tres con sus defectos (nadie los eligió): pintarlos
 * sería enseñar como dato del atleta lo que es un relleno (§7). Con el chip de
 * equipo puesto, el formato no se repite.
 */
export function lineaCategoria(c: Pick<ProximaCarrera, 'tipoEvento' | 'formato' | 'division' | 'categoria'>): string | null {
  if (c.tipoEvento === 'other') return null;
  const partesLinea = [
    esDeEquipo(c.formato) ? null : ETIQUETA_FORMATO[c.formato],
    ETIQUETA_DIVISION[c.division],
    ETIQUETA_CATEGORIA[c.categoria],
  ].filter(Boolean);
  return partesLinea.join(' · ');
}

export const etiquetaDivision = (d: Division): string => ETIQUETA_DIVISION[d];

/** «con Aina» / «con Aina y Joan» / «con Aina, Joan y Pau». Null sin equipo. */
export function textoEquipo(companeros: CompaneroDeEquipo[]): string | null {
  const nombres = [...companeros]
    .sort((a, b) => a.posicion - b.posicion)
    .map((c) => c.nombre.trim())
    .filter(Boolean);
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return `con ${nombres[0]}`;
  return `con ${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** «Puesto 412 de 1.180 · top 35 %». Sin campo, solo el puesto; sin puesto, nada. */
export function puestoTexto(puesto: number | null, campo: number | null): string | null {
  if (puesto == null || puesto <= 0) return null;
  const miles = (n: number) => n.toLocaleString('es-ES');
  if (campo == null || campo <= 0) return `Puesto ${miles(puesto)}`;
  const top = Math.min(100, Math.max(1, Math.round((puesto / campo) * 100)));
  return `Puesto ${miles(puesto)} de ${miles(campo)} · top ${top} %`;
}

/** Tu puesto entre el campo, en palabras (el color solo no basta: §4.2). */
export const PUESTO_EN_CAMPO: Record<Severidad, string> = {
  better: 'Arriba',
  slightly_worse: 'Medio',
  worse: 'Abajo',
};

// ── Estaciones HYROX (espejo de `HyroxStation.labels`, HyroxStations.swift) ────

export const ESTACION: Record<number, string> = {
  2: 'SkiErg 1km',
  4: 'Sled push',
  6: 'Sled pull',
  8: 'Burpee broad jump 80m',
  10: 'Row 1km',
  12: 'Farmer carry 200m',
  14: 'Sandbag lunge 200m',
  16: 'Wall ball 100',
};

export const INDICES_ESTACION = [2, 4, 6, 8, 10, 12, 14, 16] as const;

/** Tiempo total en estaciones: solo si están LAS OCHO. Una suma de siete no es «tus estaciones». */
export function estacionesTotalS(c: Pick<CarreraPasada, 'estaciones'>): number | null {
  const porIndice = new Map(c.estaciones.map((e) => [e.indice, e.segundos]));
  let total = 0;
  for (const i of INDICES_ESTACION) {
    const s = porIndice.get(i);
    if (s == null || s <= 0) return null;
    total += s;
  }
  return total;
}

// ── La foto de la carrera ─────────────────────────────────────────────────────

const FONDOS: FondoCarrera[] = ['sled-push', 'running', 'wall-balls'];

/** FNV-1a de 64 bits sobre los bytes UTF-8 (el hash de `BrandImagery`: estable entre procesos). */
export function fnv1a64(clave: string): bigint {
  let h = BigInt('0xcbf29ce484222325');
  const primo = BigInt('0x100000001b3');
  const tope = BigInt('0xffffffffffffffff');
  for (const b of new TextEncoder().encode(clave)) {
    h ^= BigInt(b);
    h = (h * primo) & tope;
  }
  return h;
}

/**
 * La misma carrera, siempre la misma foto: FNV-1a sobre su clave, como
 * `BrandImagery.raceCardBackground(for:)` (no `hashValue`, que cambia por
 * proceso). La app tiene un catálogo de cinco fotos; el doble, tres.
 */
export function fondoDe(clave: string): FondoCarrera {
  return FONDOS[Number(fnv1a64(clave) % BigInt(FONDOS.length))];
}
