// Presentación de textos: nada de esto decide un dato (una portada PINTA); solo
// parte, capitaliza y compone lo que el contrato ya trae resuelto.

import type { EstadoSesion } from '../../kit-hoy/contrato';

/** «68 ms» → { num: '68', unidad: 'ms' }. Sin unidad, todo es cifra. */
export function partirValor(valor: string): { num: string; unidad: string } {
  const i = valor.indexOf(' ');
  return i < 0 ? { num: valor, unidad: '' } : { num: valor.slice(0, i), unidad: valor.slice(i + 1) };
}

/** Mismo criterio que InicioView.timeOfDayGreeting: 6-12 días, 13-20 tardes, resto noches. */
export function saludoDeLaHora(hora: string): string {
  const h = Number.parseInt(hora.split(':')[0] ?? '', 10);
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** «Biel» → «BI»; «Ana María» → «AM». */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return (palabras[0] ?? '').slice(0, 2).toUpperCase();
}

/**
 * El vocabulario de estado de sesión de la app: el de `SessionMarkState` tal como
 * lo dice el plan (`PlanHeroeHoy.marcaDeEstado`: «Completada», «A medias», «Sin
 * hacer»). La pendiente no lleva sello en el plan; aquí lleva la palabra porque
 * la portada dice el ESTADO de la sesión de hoy.
 */
export const TEXTO_ESTADO: Record<EstadoSesion, string> = {
  pendiente: 'Pendiente',
  hecha: 'Completada',
  parcial: 'A medias',
  saltada: 'Sin hacer',
};

export const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
