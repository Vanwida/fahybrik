// LA SEÑAL DEL PULSO DE LA SESIÓN — cuando solo se guardó el agregado por
// bloque y no la traza segundo a segundo.
//
// Misma técnica ILUSTRATIVA que `screens/lectura-carrera/senal.ts` (inercia +
// ondulación senoidal, cero aleatorio, determinista): no se reescribe la de al
// lado porque esa opera sobre los PASOS de una carrera y esta sobre los
// BLOQUES de una sesión, que son una forma distinta de partir el tiempo. Quien
// llama a esto declara SIEMPRE en su `procedencia` que la curva es
// reconstruida, nunca «medida» — la app real archivaría el latido a latido;
// el doble no lo tiene, y esto es lo que se enseña mientras tanto (card 118).

import type { Bloque } from './modelo';
import type { Muestra } from '../lectura-carrera/modelo';

/** Cuánto se acerca el pulso a su objetivo en cada muestra — bajo, para que un
 *  cambio de bloque suba en rampa y no en escalón. */
const INERCIA = 0.045;
/** Tres ondas de periodo distinto: la lenta es la deriva del bloque, la media
 *  es el vaivén de una serie o una zancada, la rápida es el temblor latido a
 *  latido. Sumadas dan la variación real de un pulsómetro sin necesitar ruido
 *  aleatorio (la señal sigue siendo determinista, igual que su hermana). */
const ONDAS: ReadonlyArray<{ amplitudPpm: number; periodoS: number }> = [
  { amplitudPpm: 2.6, periodoS: 97 },
  { amplitudPpm: 4.8, periodoS: 21 },
  { amplitudPpm: 3.2, periodoS: 307 },
];

/** Sin medida (un calentamiento sin conectar), se infiere un valle de arranque
 *  — nunca se enseña como dato, solo da forma a la curva. */
const PPM_SIN_MEDIDA = 70;
/** Cuánto baja el pulso en un descanso prescrito, contra el bloque que cierra. */
const CAIDA_EN_DESCANSO_PPM = 18;

interface Objetivo {
  desdeS: number;
  hastaS: number;
  ppm: number;
}

/**
 * Reparte el tiempo total entre los bloques Y sus descansos, en el MISMO
 * orden en que pasaron — es la única forma de que la curva cubra exactamente
 * `duracionTotalS` cuando algunos bloques no traen cronómetro propio (§7: no
 * se inventa una duración, se reparte lo que sobra a partes iguales entre los
 * que no la tienen).
 */
function objetivosDe(bloques: Bloque[], duracionTotalS: number): Objetivo[] {
  const sumaConocida = bloques.reduce((acc, b) => acc + (b.duracionS ?? 0) + (b.descansoS ?? 0), 0);
  const sinDuracion = bloques.filter((b) => b.duracionS == null).length;
  const repartoRestante = sinDuracion > 0 ? Math.max(0, duracionTotalS - sumaConocida) / sinDuracion : 0;

  const objetivos: Objetivo[] = [];
  let cursor = 0;
  for (const b of bloques) {
    const dur = b.duracionS ?? repartoRestante;
    const ppm = b.fcMediaPpm ?? PPM_SIN_MEDIDA;
    objetivos.push({ desdeS: cursor, hastaS: cursor + dur, ppm });
    cursor += dur;
    if (b.descansoS != null && b.descansoS > 0) {
      objetivos.push({ desdeS: cursor, hastaS: cursor + b.descansoS, ppm: Math.max(PPM_SIN_MEDIDA, ppm - CAIDA_EN_DESCANSO_PPM) });
      cursor += b.descansoS;
    }
  }
  return objetivos;
}

/**
 * La traza plausible de la sesión entera, en `muestras` puntos equiespaciados.
 * `muestras` fija el número exacto de puntos (no el intervalo): así el doble
 * puede declarar «620 muestras» y que sea literalmente cierto.
 */
export function trazaPulsoIlustrativa(bloques: Bloque[], duracionTotalS: number, muestras: number): Muestra[] {
  const objetivos = objetivosDe(bloques, duracionTotalS);
  if (objetivos.length === 0 || duracionTotalS <= 0) return [];
  const paso = duracionTotalS / Math.max(1, muestras - 1);

  let ppm = objetivos[0]!.ppm;
  const salida: Muestra[] = [];
  for (let i = 0; i < muestras; i += 1) {
    const t = i * paso;
    const objetivo = objetivos.find((o) => t >= o.desdeS && t < o.hastaS) ?? objetivos[objetivos.length - 1]!;
    ppm += (objetivo.ppm - ppm) * INERCIA;
    const ondulacion = ONDAS.reduce((acc, o) => acc + Math.sin((2 * Math.PI * t) / o.periodoS) * o.amplitudPpm, 0);
    // Redondeado a dos decimales por la misma razón que `senal.ts`: server y
    // cliente no pueden escribir un float distinto para el mismo punto.
    salida.push({ t: Math.round(t * 100) / 100, v: Math.round(ppm + ondulacion) });
  }
  return salida;
}
