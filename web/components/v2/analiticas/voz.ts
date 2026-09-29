// LA PALABRA EN LA VOZ DEL COACH — el sobre es el mismo que ve el atleta (A1)
// y sus palabras están escritas para él («En tu normal», «Vas a más», «En tu
// reparto»). El cliente pinta por `code` (lectura.ts: «el cliente colorea por
// ella»), así que el panel del coach escribe la MISMA palabra en tercera
// persona. No cambia el juicio, cambia el pronombre. Un code que no está aquí
// se escribe tal como llega.
//
// Puro.

import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';

const POR_LECTURA: Record<string, Record<string, string>> = {
  'recuperacion.variabilidad': { en_tu_normal: 'En su normal', por_debajo: 'Por debajo de su normal', por_encima: 'Por encima de su normal' },
  'recuperacion.pulso_reposo': { en_tu_normal: 'En su normal', por_debajo: 'Más bajo que su normal', por_encima: 'Más alto que su normal' },
  'recuperacion.sueno': { en_tu_normal: 'En su normal', por_debajo: 'Duerme menos que su normal', por_encima: 'Duerme más que su normal' },
  'intensidad.polarizacion': { en_reparto: 'En su reparto' },
};

const POR_CODE: Record<string, string> = {
  mejor: 'Va a más',
  igual: 'Se mantiene',
  peor: 'Va a menos',
};

/** La etiqueta del veredicto de una lectura, en tercera persona. Null si no hay veredicto. */
export function palabraCoach(l: Pick<Lectura, 'id' | 'veredicto'>): string | null {
  const v = l.veredicto;
  if (!v) return null;
  return POR_LECTURA[l.id]?.[v.code] ?? (l.id.startsWith('progreso.') ? POR_CODE[v.code] : undefined) ?? v.etiqueta_es;
}
