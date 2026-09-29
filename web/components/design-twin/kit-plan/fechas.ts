// FECHAS DE «PLAN» — aritmética sobre el ISO `YYYY-MM-DD` y cómo se nombra un día
// respecto a hoy. Puro y sin tipos del contrato: lo comparten el modelo, los
// textos y la demo del tier libre. Espejo de `FechaES` (Formato.swift).

// ---------------------------------------------------------------------------
// Fechas — aritmética sobre el ISO, en UTC: el huso del navegador no decide en
// qué día cae una sesión.
// ---------------------------------------------------------------------------

import { fechaCorta } from '../kit-composicion/formato';

// «28 sep»: el canónico del doble (`kit-composicion/formato`), no una segunda copia.
export { fechaCorta };

const MS_DIA = 86_400_000;
const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
const INICIALES_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

function partes(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

function marca(iso: string): number {
  const { y, m, d } = partes(iso);
  return Date.UTC(y, m - 1, d);
}

/** Días de calendario de `a` a `b` (negativo = `b` ya pasó respecto a `a`). */
export function diasEntre(a: string, b: string): number {
  return Math.round((marca(b) - marca(a)) / MS_DIA);
}

export function sumaDias(iso: string, n: number): string {
  const f = new Date(marca(iso) + n * MS_DIA);
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

/** 1 = lunes … 7 = domingo. */
export function diaSemanaDe(iso: string): number {
  const dow = new Date(marca(iso)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export const inicialDeDia = (dow: number): string => INICIALES_DIA[dow - 1]!;
export const nombreDeDia = (dow: number): string => NOMBRES_DIA[dow - 1]!;
export const numeroDelMes = (iso: string): number => partes(iso).d;

/** «14 de septiembre» (`FechaES.larga`). */
export function fechaLarga(iso: string): string {
  const { m, d } = partes(iso);
  return `${d} de ${MESES_LARGOS[m - 1]}`;
}

/** «lunes 5 de octubre» (`FechaES.conDia`): para anunciar una fecha futura. */
export function fechaConDia(iso: string): string {
  return `${nombreDeDia(diaSemanaDe(iso)).toLowerCase()} ${fechaLarga(iso)}`;
}

/** «Del 28 sep al 4 oct»: el rango de una semana, siempre un hecho (viene del cable). */
export function rangoDeSemana(desde: string, hasta: string): string {
  return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
}

/** «Faltan 4 días» · «Falta 1 día»: lo que queda para que empiece un plan ya programado. Null si ya empezó (nunca un cero). */
export function faltanParaEmpezar(hoyIso: string, inicioIso: string): string | null {
  const n = diasEntre(hoyIso, inicioIso);
  if (n <= 0) return null;
  return n === 1 ? 'Falta 1 día' : `Faltan ${n} días`;
}

/** «Ayer» · «Mañana» · «Sábado 3»: cómo se nombra un día respecto a hoy, sin mentir sobre la distancia. */
export function rotuloDeDia(iso: string, hoyIso: string): string {
  const d = diasEntre(hoyIso, iso);
  if (d === 0) return 'Hoy';
  if (d === -1) return 'Ayer';
  if (d === 1) return 'Mañana';
  return `${nombreDeDia(diaSemanaDe(iso))} ${numeroDelMes(iso)}`;
}

/** «Hoy · Jueves 1» / «Ayer · Miércoles 30» / «Mañana · Viernes 2» / «Sábado 3». El prefijo es un HECHO (§7). */
export function etiquetaDeFecha(iso: string, hoyIso: string): string {
  const nombre = `${nombreDeDia(diaSemanaDe(iso))} ${numeroDelMes(iso)}`;
  const d = diasEntre(hoyIso, iso);
  if (d === 0) return `Hoy · ${nombre}`;
  if (d === -1) return `Ayer · ${nombre}`;
  if (d === 1) return `Mañana · ${nombre}`;
  return nombre;
}
