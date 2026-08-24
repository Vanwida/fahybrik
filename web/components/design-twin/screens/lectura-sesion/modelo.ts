// LA LECTURA DE UNA SESIÓN — qué ve el atleta al terminar algo que NO es una
// carrera sola. `lectura-carrera` contesta «¿la carrera midió lo pedido?»;
// esta contesta la pregunta que viene ANTES — qué hiciste, cuando la sesión
// mezcla fuerza, ergómetro, correr y trabajo funcional en cualquier orden, o
// es puramente una de esas cosas.
//
// DE DÓNDE SALE (card 118, y su REHECHURA en la card 124). La primera versión
// resolvía el desglose bloque a bloque y perdía la FOTO de la sesión entera —
// palabras de Alex viendo la app real: «más cosas que se nos escapan porque
// tratamos todos los ejercicios». La card 124 pide esa foto: los totales de la
// sesión, la gráfica del pulso completo y el mapa cuando hubo GPS, delante del
// desglose y no sustituyéndolo.
//
// EL MODELO ENTERO, siete capas y nada más:
//
//   1. CABECERA      tipo de entreno (icono teñido), título, ventana horaria,
//                     si se hizo entera o a medias.
//   2. LOS TOTALES    tiempo · distancia (nunca mezclando modalidad) · ritmo
//                     medio · FC media · FC máxima · calorías — cada uno solo
//                     si se midió, y el «resultado» propio del FORMATO
//                     (volumen de fuerza, rondas de un AMRAP/EMOM) cuando el
//                     tiempo no lo cuenta ya.
//   3. LA GRÁFICA     el pulso de la sesión entera, con su media y su máxima.
//   4. EL MAPA        solo con GPS — mismo `PuntoRuta` que `lectura-carrera`.
//   5. EL DESGLOSE    bloque a bloque, en el ORDEN en que pasó, cada uno en su
//                     propio idioma (correr / ergómetro / fuerza / funcional).
//   6. LAS ZONAS      el reparto de pulso de la sesión, si se midió alguno.
//   7. LO QUE DIJO EL ATLETA   esfuerzo, cómo fue, la molestia si la hubo.
//
// Y LA REGLA QUE NO SE SALTA (card 124): la distancia de los totales NUNCA
// mezcla modalidades — ni siquiera dos máquinas de ergómetro distintas, que
// miden movimientos tan distintos entre sí como correr y remar. Si la sesión
// midió distancia en más de una, el total no la enseña: vive en el desglose.

import type { TipoEntreno } from '../../kit';
import { hrZone } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import { distribucionZonas } from '../../zonas';
import type { PuntoRuta } from '../lectura-carrera/modelo';
import type { SegmentoZona } from '../post-entreno/piezas';

export type { PuntoRuta };

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
  /** Serie de aproximación: se enseña, no suma al volumen ni a la más pesada. */
  aproximacion?: boolean;
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
// La sesión
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
  /**
   * «07:15» — HH:MM local. La ventana horaria completa (Apple Fitness, Strava,
   * Garmin la enseñan siempre) sale de sumarle `duracionTotalS`. Cuando el
   * origen no registró la hora de inicio, se declara ilustrativa en
   * `procedencia` — nunca se calla la fila entera por eso (§6.2 bis: la
   * ventana horaria es de las que SÍ se puede rellenar con un dato plausible
   * sin fingir una medida, porque no es un valor que el atleta pueda leer como
   * un rendimiento).
   */
  horaInicio: string;
  completitud: Completitud;
  formato: Formato;
  /** El total de la sesión — dato de servidor, independiente de la suma de los
   *  bloques (misma regla que `zonas.ts`: la base es la duración, no la suma
   *  de sus partes, porque las partes casi nunca cubren el 100%). */
  duracionTotalS: number;
  bloques: Bloque[];
  /**
   * FC media y máxima DE LA SESIÓN ENTERA — dato de servidor, no derivado de
   * los bloques: la máxima de una sesión casi siempre supera la media de
   * cualquier bloque (un pico de un segundo no es la media de nada), así que
   * solo puede venir de la traza latido a latido que el dispositivo archivó.
   * Nulo = no se midió pulso en ningún momento (fuerza pura sin pulsómetro).
   */
  fcMediaPpm: number | null;
  fcMaxPpm: number | null;
  /** Nulo = no se midió. Ningún reloj de esta base emite kcal todavía salvo
   *  que el atleta llevara uno que sí las calcula. */
  kcal: number | null;
  /** Vacía sin GPS (interior, o calle sin señal). Mismo tipo que `lectura-carrera`:
   *  el mapa de esa pantalla se reutiliza tal cual, no se redibuja aquí. */
  ruta: PuntoRuta[];
  /** Ausente = no contestó nada, y entonces la capa 7 no existe. */
  dicho?: DichoAtleta;
  /** De dónde salen los números de esta escena. El doble no finge producción. */
  procedencia: string;
}

// ---------------------------------------------------------------------------
// El tipo de entreno — el icono de la cabecera (card 124, punto 2)
// ---------------------------------------------------------------------------

/**
 * QUÉ FUE LA SESIÓN, para el icono teñido de la cabecera. Sale de DOS hechos,
 * nunca de uno: el FORMATO (¿se prescribió como reloj/tanda?) y qué
 * MODALIDADES trae el desglose — mirar solo el formato metería una sesión de
 * fuerza y trineos (`libre`) en el mismo cajón que un rodaje suelto, y mirar
 * solo las modalidades no distinguiría un simulacro estructurado de una
 * sesión mixta sin estructura.
 */
export function tipoDeSesion(s: Sesion): TipoEntreno {
  if (s.formato.clase === 'fuerza') return 'fuerza';

  const modalidades = new Set(s.bloques.map((b) => b.modalidad));
  const estructurada = s.formato.clase === 'for-time' || s.formato.clase === 'amrap' || s.formato.clase === 'emom';
  const tieneCorrer = modalidades.has('correr');
  const tieneOtroCardio = modalidades.has('ergometro') || modalidades.has('funcional');

  // Reloj o tanda + correr + otra máquina/movimiento: la firma de un
  // simulacro HYROX, tenga la forma de reloj que tenga.
  if (estructurada && tieneCorrer && tieneOtroCardio) return 'hyrox';

  if (modalidades.size === 1) {
    if (tieneCorrer) return 'correr';
    if (modalidades.has('fuerza')) return 'fuerza';
    return 'funcional';
  }

  // Varias modalidades sin la estructura de un simulacro: la mezcla libre
  // (fuerza + trineos, fuerza + rodaje corto…) que abrió la card 118.
  return 'mixto';
}

// ---------------------------------------------------------------------------
// Los totales — la foto de la sesión entera (card 124, punto 2)
// ---------------------------------------------------------------------------

/**
 * Las máquinas y modos que cuentan como distancia CUBIERTA — nunca dos se
 * suman entre sí. Ojo: `ergometro` NO es un cajón único. Remar 500 m y
 * esquiar 500 m miden dos movimientos tan distintos como correr y remar; si
 * se sumaran solo por compartir la palabra «ergómetro» se cometería la MISMA
 * mezcla que la regla de la card 124 prohíbe, con la máquina en vez de la
 * modalidad como disfraz.
 */
function cubetaDeDistancia(b: Bloque): string | null {
  if (b.modalidad === 'correr') return 'correr';
  if (b.modalidad === 'ergometro') return `ergometro:${b.maquina}`;
  // La fuerza no cubre distancia. El funcional cuenta metros como DOSIS de un
  // movimiento (40 m de burpee broad jump), no como desplazamiento continuo:
  // mezclarlo con lo que corrió el atleta sería inventar un ritmo que nadie
  // corrió (los wall balls no se «recorren»).
  return null;
}

const NOMBRE_CUBETA: Record<string, string> = {
  correr: 'corriendo',
  'ergometro:remo': 'remando',
  'ergometro:ski': 'en ski erg',
  'ergometro:bici': 'en bici',
};

export interface TotalDistancia {
  metros: number;
  /** «corriendo» · «remando» — se dice SIEMPRE con qué se hizo (card 124). */
  modo: string;
  /** Nulo si algún tramo de esa modalidad no llevaba su propio cronómetro:
   *  un ritmo medio sobre una duración incompleta sería un ritmo inventado. */
  ritmoSkm: number | null;
}

/**
 * La distancia total, y SOLO cuando una única cubeta la midió. Con cero
 * cubetas no hay recuadro (nadie recorrió nada medible); con dos o más el
 * recuadro tampoco existe — la card 124 es explícita: «si la midió en varias,
 * el total NO enseña distancia: vive en el desglose».
 */
export function distanciaTotalDeSesion(s: Sesion): TotalDistancia | null {
  const porCubeta = new Map<string, { metros: number; duracionS: number; completa: boolean }>();
  for (const b of s.bloques) {
    const cubeta = cubetaDeDistancia(b);
    if (cubeta == null) continue;
    const distanciaM = b.modalidad === 'correr' || b.modalidad === 'ergometro' ? b.distanciaM : null;
    if (distanciaM == null) continue;
    const actual = porCubeta.get(cubeta) ?? { metros: 0, duracionS: 0, completa: true };
    actual.metros += distanciaM;
    if (b.duracionS != null) actual.duracionS += b.duracionS;
    else actual.completa = false;
    porCubeta.set(cubeta, actual);
  }
  if (porCubeta.size !== 1) return null;
  const [cubeta, datos] = [...porCubeta.entries()][0]!;
  if (datos.metros <= 0) return null;
  return {
    metros: datos.metros,
    modo: NOMBRE_CUBETA[cubeta] ?? cubeta,
    ritmoSkm: datos.completa ? datos.duracionS / (datos.metros / 1000) : null,
  };
}

/**
 * EL RITMO MEDIO DE CORRER — independiente de si la distancia total se
 * enseña o no. En el simulacro (②) la distancia total se calla porque
 * mezclaría correr con ergómetro, pero «¿a qué ritmo corrí?» sigue siendo una
 * pregunta que SÍ tiene una respuesta sin ambigüedad: solo mira los tramos de
 * correr, y a esos no los mezcla con nada. Solo cuenta lo que trajo su propio
 * cronómetro — nunca un ritmo sobre una duración a medias inventada (§7).
 */
export function ritmoMedioDeCorrer(s: Sesion): number | null {
  let metros = 0;
  let segundos = 0;
  for (const b of s.bloques) {
    if (b.modalidad !== 'correr' || b.distanciaM == null || b.duracionS == null) continue;
    metros += b.distanciaM;
    segundos += b.duracionS;
  }
  if (metros <= 0) return null;
  return segundos / (metros / 1000);
}

/**
 * EL RESULTADO PROPIO DEL FORMATO — solo cuando el tiempo total NO lo cuenta
 * ya. Un for-time o una sesión libre ya tienen su respuesta en «tiempo»
 * (repetirla como un segundo recuadro sería la misma cifra dos veces, el
 * fallo que el §2 del CONTRATO-UI vino a cortar); una sesión de fuerza, un
 * AMRAP o un EMOM tienen un resultado que el tiempo NO dice, y ese es el que
 * gana un recuadro propio en la rejilla de totales.
 */
export type Resultado =
  | { clase: 'fuerza'; volumenKg: number; serieMasPesada: { etiqueta: string; kg: number; reps: number } | null }
  | { clase: 'amrap'; rondas: number; repsExtra: number }
  | { clase: 'emom'; rondasCompletadas: number; rondasPrescritas: number };

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
      if (g.aproximacion || g.kg == null) continue;
      volumenKg += g.sets * g.reps * g.kg;
      if (!masPesada || g.kg > masPesada.kg) masPesada = { etiqueta: b.etiqueta, kg: g.kg, reps: g.reps };
    }
  }
  return { volumenKg, serieMasPesada: masPesada };
}

export function resultadoDeSesion(s: Sesion): Resultado | null {
  switch (s.formato.clase) {
    case 'fuerza':
      return { clase: 'fuerza', ...volumenDeFuerza(s.bloques) };
    case 'amrap':
      return { clase: 'amrap', rondas: s.formato.rondas, repsExtra: s.formato.repsExtra };
    case 'emom':
      return {
        clase: 'emom',
        rondasCompletadas: s.formato.rondasCompletadas,
        rondasPrescritas: s.formato.rondasPrescritas,
      };
    case 'for-time':
    case 'libre':
      // El tiempo total YA es la respuesta: un recuadro «resultado» aquí
      // repetiría el de «tiempo» con otro nombre.
      return null;
  }
}

// ---------------------------------------------------------------------------
// Las zonas — entre el desglose y lo que dijo el atleta, y solo si las hay
// ---------------------------------------------------------------------------

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
