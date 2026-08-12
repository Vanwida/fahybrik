// EL EJE DEL RITMO — qué parte de la carrera manda en la escala del dibujo.
//
// Vive suelto y exportado porque es una regla de dominio hecha número: así se
// prueba sin montar un componente, y así no puede volver a afinarse por
// accidente sin que salte un test.

import type { TramoLeido } from './modelo';

/** Una muestra de la curva: el eje va explícito porque la cadencia es variable
 *  y un hueco es un hueco. */
export interface Muestra {
  t: number;
  v: number;
}

/**
 * EL EJE LO FIJA LO QUE SE CORRIÓ. **Andar y parar no es correr.**
 *
 * Bajar andando de una cuesta son 11:40/km. Metido en el eje junto a unas
 * subidas de 4:30 aplasta las repeticiones contra el borde de arriba, y la curva
 * deja de leerse justo donde el sujeto es cuánto se cayó de la primera a la
 * última. El criterio es la LOCOMOCIÓN, no el papel del tramo: un trote entre
 * series es correr y entra; andar es otra forma de moverse y se queda fuera.
 *
 * ESTO ESPEJA `dominioDelRitmo()` del doble (`design-twin/screens/
 * lectura-carrera/curva.tsx`), que es donde la regla se afinó tres veces y donde
 * están sus tests. **No se importa de allí a propósito:** vive dentro de un
 * componente que arrastra el kit de UI del doble entero, y meter eso en el
 * bundle del panel por veinte líneas de aritmética sale mucho más caro que
 * espejarlas. El sitio donde debería vivir UNA vez es
 * `shared/domain/running/`, sin UI colgando, y desde ahí la llamarían las dos.
 *
 * El suelo importa: si no se corrió NADA —una caminata entera— andar deja de
 * ser la excepción porque es lo único que hay, y manda. Sin esto el eje se queda
 * sin nada que lo fije y la curva sale degenerada.
 */
export function dominioDelRitmo(
  ritmo: Muestra[],
  tramos: TramoLeido[],
  banda: { rapidoSkm: number; lentoSkm: number } | null,
): { min: number; max: number } | null {
  const ventanas = tramos
    .filter((t) => t.papel === 'recuperacion' && (t.modo === 'caminar' || t.modo === 'parado'))
    .filter((t) => t.inicioS != null && t.duracionS != null)
    .map((t) => [t.inicioS!, t.inicioS! + t.duracionS!] as const);
  const noSeCorrio = (t: number) => ventanas.some(([desde, hasta]) => t >= desde && t < hasta);
  const corrido = ritmo.filter((m) => !noSeCorrio(m.t));
  const mandan = corrido.length > 1 ? corrido : ritmo;
  if (mandan.length === 0) return null;
  const valores = mandan.map((m) => m.v);
  if (banda) valores.push(banda.rapidoSkm, banda.lentoSkm);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const margen = (max - min) * 0.14 || 1;
  return { min: min - margen, max: max + margen };
}

