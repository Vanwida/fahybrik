// LA LECTURA DE UNA SESIÓN — qué ve el atleta al terminar algo que NO es una
// carrera sola. `lectura-carrera` contesta «¿la carrera midió lo pedido?»;
// esta contesta la pregunta que viene ANTES — qué hiciste, cuando la sesión
// mezcla fuerza, ergómetro, correr y trabajo funcional en cualquier orden, o
// es puramente una de esas cosas.
//
// DE DÓNDE SALE (card 118). Una sesión real de 47′ —fuerza B + trineos— se
// leyó a pantalla completa como «RITMO MEDIO · 0:00/km · Corriste a una sola
// intensidad»: la app solo sabía contar la historia de una carrera y la contó
// aunque la sesión no lo fuera. El enrutado ya decide en Swift cuándo esto NO
// es una carrera; esta pantalla es la lectura que le corresponde a la que sí.
//
// EL MODELO ENTERO, cuatro capas y nada más:
//
//   1. CABECERA     título, día, si se hizo entera o a medias.
//   2. EL SUJETO     un número, el que ES la sesión según su FORMATO — nunca
//                    el de otra modalidad, nunca un cero (§7): sin medida, el
//                    recuadro no existe.
//   3. EL DESGLOSE   bloque a bloque, en el ORDEN en que pasó, cada uno en su
//                    propio idioma (correr / ergómetro / fuerza / funcional).
//                    La FC media de un bloque, solo si se midió.
//   4. LO QUE DIJO EL ATLETA   esfuerzo, cómo fue, la molestia si la hubo.
//                    Siempre al final y aparte: es la única capa que no mide.
//
// Y las zonas de pulso entre el 3 y el 4, si las hay — el mismo cálculo que ya
// usan `post-entreno` y `lectura-carrera` (`distribucionZonas`), no uno nuevo.

import { hrZone } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import { distribucionZonas } from '../../zonas';
import type { SegmentoZona } from '../post-entreno/piezas';

// ---------------------------------------------------------------------------
// El desglose — un bloque, en su propio idioma
// ---------------------------------------------------------------------------

export type Modalidad = 'correr' | 'ergometro' | 'fuerza' | 'funcional';

/** Un grupo de series iguales dentro de un ejercicio: «5×5 a 100 kg». */
export interface GrupoFuerza {
  sets: number;
  reps: number;
  /** Nulo = peso corporal. No se pliega en el tonelaje sin el peso del atleta
   *  medido (§7): inventarlo sería inventar un dato que nadie pesó. */
  kg: number | null;
}

interface BloqueBase {
  /** «Peso muerto» · «Trineos» · «Calentamiento». Lo que el atleta reconoce. */
  etiqueta: string;
  /** Nulo = este tramo no llevó cronómetro propio (§7): no se inventa uno. */
  duracionS: number | null;
  /** Nulo = no se midió. Nunca se pinta un guion en su lugar. */
  fcMediaPpm: number | null;
  /**
   * A qué ronda pertenece — solo cuando la sesión SE PRESCRIBIÓ en rondas
   * (un simulacro, un metcon). Ausente = la sesión no tiene esa estructura, y
   * el desglose se lee como lista plana (fuerza y trineos, fuerza pura): el
   * agrupado sale del dato, nunca de una rama especial de la pantalla.
   */
  ronda?: number;
  /**
   * Descanso prescrito DESPUÉS de este tramo, si lo hubo. No es solo de
   * fuerza: un simulacro cierra cada estación con su pausa antes de la
   * siguiente ronda, y es el mismo dato en otro idioma de modalidad.
   */
  descansoS?: number | null;
}

export type Bloque =
  | (BloqueBase & { modalidad: 'correr'; distanciaM: number | null })
  | (BloqueBase & { modalidad: 'ergometro'; maquina: 'remo' | 'ski' | 'bici'; distanciaM: number | null })
  | (BloqueBase & { modalidad: 'fuerza'; grupos: GrupoFuerza[] | null })
  | (BloqueBase & { modalidad: 'funcional'; reps: number | null; metros: number | null });

/** Ritmo por km, DERIVADO — nunca se guarda un `pace` (misma regla que `lectura-carrera`). */
export function ritmoDeCorrer(b: Extract<Bloque, { modalidad: 'correr' }>): number | null {
  if (b.distanciaM == null || b.distanciaM <= 0 || b.duracionS == null) return null;
  return b.duracionS / (b.distanciaM / 1000);
}

/** Ritmo por 500 m de un ergómetro — mismo principio, otra unidad de pista. */
export function ritmoDeErgometro(b: Extract<Bloque, { modalidad: 'ergometro' }>): number | null {
  if (b.distanciaM == null || b.distanciaM <= 0 || b.duracionS == null) return null;
  return b.duracionS / (b.distanciaM / 500);
}

/** Un tramo del desglose: sus bloques y, si TODOS traen ronda, cuál. */
export interface GrupoDesglose {
  /** Nulo = la sesión no se prescribió en rondas: se lee como lista plana. */
  ronda: number | null;
  bloques: Bloque[];
}

/**
 * AGRUPAR POR RONDA — y solo si el DATO lo trae, nunca por una rama del
 * escenario. Cuatro rondas de correr + estación se leen como cuatro rondas,
 * no como una lista plana donde «Correr» se repite sin decir a qué cierra.
 *
 * Bloques consecutivos con la misma `ronda` (o sin ronda, los dos) se
 * pliegan en el mismo grupo: una sesión sin rondas —fuerza y trineos, fuerza
 * pura— produce UN solo grupo con `ronda: null`, que el desglose pinta sin
 * cabecera y queda exactamente como una lista plana.
 */
export function agruparPorRonda(bloques: Bloque[]): GrupoDesglose[] {
  const grupos: GrupoDesglose[] = [];
  for (const b of bloques) {
    const ronda = b.ronda ?? null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.ronda === ronda) {
      ultimo.bloques.push(b);
    } else {
      grupos.push({ ronda, bloques: [b] });
    }
  }
  return grupos;
}

// ---------------------------------------------------------------------------
// El formato — de dónde sale el sujeto
// ---------------------------------------------------------------------------

export type Formato =
  | { clase: 'for-time' }
  | { clase: 'amrap'; rondas: number; repsExtra: number }
  | { clase: 'emom'; rondasCompletadas: number; rondasPrescritas: number }
  | { clase: 'fuerza' }
  | { clase: 'libre' };

export type Completitud = { completa: true } | { completa: false; nota: string };

export interface DichoAtleta {
  rpe?: number;
  dificultad?: 'too_easy' | 'as_expected' | 'too_hard';
  molestia?: { area: string; nota?: string };
}

export interface Sesion {
  titulo: string;
  /** «Hoy» · «Ayer» · «Martes 20 de agosto». */
  cuando: string;
  completitud: Completitud;
  formato: Formato;
  /** El total de la sesión — dato de servidor, independiente de la suma de los
   *  bloques (misma regla que `zonas.ts`: la base es la duración, no la suma
   *  de sus partes, porque las partes casi nunca cubren el 100%). */
  duracionTotalS: number;
  bloques: Bloque[];
  /** Ausente = no contestó nada, y entonces la capa 4 no existe. */
  dicho?: DichoAtleta;
  /** De dónde salen los números de esta escena. El doble no finge producción. */
  procedencia: string;
}

// ---------------------------------------------------------------------------
// El sujeto — uno por sesión, elegido por el formato y nunca por casualidad
// ---------------------------------------------------------------------------

export type Sujeto =
  | { clase: 'for-time'; duracionS: number }
  | { clase: 'amrap'; rondas: number; repsExtra: number }
  | { clase: 'emom'; rondasCompletadas: number; rondasPrescritas: number }
  | { clase: 'fuerza'; volumenKg: number; serieMasPesada: { etiqueta: string; kg: number; reps: number } | null }
  | { clase: 'libre'; duracionS: number };

/**
 * EL VOLUMEN — solo lo que llevó una carga medida en kilos.
 *
 * Una serie a peso corporal (las dominadas de la fuerza pura) cuenta reps, no
 * kilos: sin el peso del atleta pesado de verdad, sumarlas al tonelaje sería
 * inventar el dato que falta (§7). Se enseñan aparte, en el desglose, con sus
 * repeticiones — el tonelaje no las esconde, simplemente no las mide.
 */
interface VolumenFuerza {
  volumenKg: number;
  serieMasPesada: { etiqueta: string; kg: number; reps: number } | null;
}

function volumenDeFuerza(bloques: Bloque[]): VolumenFuerza {
  let volumenKg = 0;
  let masPesada: VolumenFuerza['serieMasPesada'] = null;
  for (const b of bloques) {
    if (b.modalidad !== 'fuerza' || !b.grupos) continue;
    for (const g of b.grupos) {
      if (g.kg == null) continue;
      volumenKg += g.sets * g.reps * g.kg;
      if (!masPesada || g.kg > masPesada.kg) masPesada = { etiqueta: b.etiqueta, kg: g.kg, reps: g.reps };
    }
  }
  return { volumenKg, serieMasPesada: masPesada };
}

/**
 * QUIÉN GANA EL NÚMERO GRANDE. No es una lista de casos: es el formato el que
 * decide, y el formato es un HECHO de la sesión (cómo se prescribió), no algo
 * que se adivine mirando los bloques. Una sesión de fuerza con trineos de
 * cierre sigue siendo `fuerza`; una que no tuvo estructura de reloj ni de
 * tanda es `libre`, y su sujeto es el tiempo, sin más pretensión.
 */
export function sujetoDeSesion(s: Sesion): Sujeto {
  switch (s.formato.clase) {
    case 'for-time':
      return { clase: 'for-time', duracionS: s.duracionTotalS };
    case 'amrap':
      return { clase: 'amrap', rondas: s.formato.rondas, repsExtra: s.formato.repsExtra };
    case 'emom':
      return {
        clase: 'emom',
        rondasCompletadas: s.formato.rondasCompletadas,
        rondasPrescritas: s.formato.rondasPrescritas,
      };
    case 'fuerza':
      return { clase: 'fuerza', ...volumenDeFuerza(s.bloques) };
    case 'libre':
      return { clase: 'libre', duracionS: s.duracionTotalS };
  }
}

// ---------------------------------------------------------------------------
// Las zonas — entre el desglose y lo que dijo el atleta, y solo si las hay
// ---------------------------------------------------------------------------

/**
 * El reparto de pulso de la sesión entera, agregado bloque a bloque.
 *
 * Un bloque solo aporta a su zona si tiene DURACIÓN Y pulso — sin duración no
 * hay segundos que atribuir, y `distribucionZonas` ya sabe convertir lo que
 * falta hasta el total en la banda «Sin pulso» (§7, cero componentes propios).
 */
/**
 * El pulso medio de LA SESIÓN, ponderado por duración entre los bloques que
 * tienen las dos cosas. Es lo que decide el tinte de `Ambiente` (§10.1): sin
 * un solo bloque con pulso Y duración —la fuerza pura, sin pulsómetro— no hay
 * ancla y el lienzo queda neutro. No se inventa una media con lo que falta.
 */
export function pulsoMedioDeSesion(s: Sesion): number | null {
  let ponderado = 0;
  let segundos = 0;
  for (const b of s.bloques) {
    if (b.fcMediaPpm == null || b.duracionS == null) continue;
    ponderado += b.fcMediaPpm * b.duracionS;
    segundos += b.duracionS;
  }
  return segundos > 0 ? ponderado / segundos : null;
}

export function zonasDeSesion(s: Sesion): SegmentoZona[] {
  const zonasS: Partial<Record<'z1' | 'z2' | 'z3' | 'z4' | 'z5', number>> = {};
  for (const b of s.bloques) {
    if (b.fcMediaPpm == null || b.duracionS == null) continue;
    const zona = hrZone(b.fcMediaPpm, UMBRAL.ppm);
    const clave = `z${zona}` as const;
    zonasS[clave] = (zonasS[clave] ?? 0) + b.duracionS;
  }
  return distribucionZonas({ duracionS: s.duracionTotalS, zonasS });
}
