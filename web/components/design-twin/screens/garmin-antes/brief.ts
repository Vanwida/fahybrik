// EL BRIEF DEL DÍA (G02) Y LA ESPERA DEL GPS — las caras de «antes de empezar». PURAS.
//
// G02: lo que se ve al abrir lo de hoy, con las manos ocupadas, de un vistazo:
//
//   arriba      «Hoy · 55′»: qué día y cuánto dura (`duracionHumana`, UNA sola vez en
//               todo el brief: si la sesión no cabe entera, la duración baja a la línea
//               de los bloques y arriba queda «Hoy»).
//   en medio    la estructura REAL del coach (`estructura.ts`): «6 × 1000 m a
//               3:45–3:55 · r 90″ trote», no «N bloques»; y si no cabe entera, el bloque
//               titular grande y «4 bloques · 45′ ↓» (DOWN abre la Estructura completa).
//   abajo       lo que decide si se puede salir, de arriba abajo: dónde se corre y el
//               GPS («↑↓ Calle · GPS listo»), lo que hay que saber del reloj («Plan de
//               hace 3 días · acerca el móvil», «Se graba sin móvil»), la acción
//               («START · Empezar», en naranja, con su tecla) y el pulso al pie.
//
// Se apila DE ABAJO ARRIBA: el pie y la acción no se mueven; la estructura se
// aprieta hasta que cabe (`disponerEstructuraEntera` o `disponerEstructuraResumen`).
// UP cambia el entorno cuando la prescripción no lo fija (`entornoElegible`); si lo
// fija («Cinta al 1 %», 535), UP no hace nada y no se pinta la flecha. DOWN abre la
// Estructura completa (§5, fila «Brief»).
//
// Sin GPS que esperar (fuerza, cinta) no hay fila de GPS: en fuerza dice solo si
// el pulso está fijado (lo único que se espera); en cinta, «sin GPS». Nunca se pinta
// un GPS que no hace falta ni un pulso a cero.
//
// La ESPERA (`disponerEspera`) es lo que sigue a «Empezar» si el GPS aún no fija: la
// sesión arranca SOLA al fijar (suena «GPS listo») y START = «Empezar sin GPS».
//
// Qué NO hacer: escribir aquí el nombre de una clase o un ritmo (salen de kit-reloj);
// pintar el GPS «listo» sin que lo esté; dar «Empezar» a una sesión sin detalle (eso es
// `disponerSinDetalle`, en faces.ts).

import { colocar, type Disposicion, type LineaG } from '../../kit-garmin/disponer';
import { lineasContexto } from '../../kit-garmin/caras';
import { REJILLA, caja } from '../../kit-garmin/geometria';
import { anchoPiezas, ESPACIO_EM, type Pieza, type Tono } from '../../kit-garmin/medir';
import { AIRE, TG, cuerpoPx } from '../../kit-garmin/tokens';
import type { Entorno } from '../../kit-reloj';
import type { Sesion } from '../reloj-antes-despues/sesiones';
import {
  NOMBRE_ENTORNO,
  necesitaGps,
  ppmDe,
  seCorre,
  textoEdadPlan,
  type FrescuraPlan,
  type Pulso,
  type Sistema,
} from './estado';
import { bloquesDelBrief, disponerEstructuraEntera, disponerEstructuraResumen, duracionDelBrief, type EstructuraPuesta } from './estructura';
import { ALTO_NOTA, HASTA_PIE, finDe, lineaAccion, lineaPulso, textoEn, textoHasta } from './filas';

// ---------------------------------------------------------------------------
// Los textos de lo que se lee antes de salir
// ---------------------------------------------------------------------------

export const TEXTO_GPS = { buscando: 'Buscando GPS', listo: 'GPS listo' } as const;
export const TEXTO_PULSO: Record<Pulso['tipo'], string> = { fijando: 'Fijando pulso', ok: 'Listo', ausente: 'Sin pulso' };
export const TEXTO_SIN_GPS = 'sin GPS';
/** Corto a propósito: una línea de nota que en un 218 tiene que caber entera, y se graba igual sin móvil. */
export const TEXTO_SIN_MOVIL = 'Se graba sin móvil';
export const TEXTO_ACERCA_MOVIL = 'acerca el móvil';
/** La tecla y lo que hace, como se lee en la muñeca: el naranja de la acción. */
export const TEXTO_EMPEZAR = 'START · Empezar';

const pieza = (texto: string, D: number, tono: Tono, antes = 0): Pieza => ({ texto, cara: 'texto', cuerpo: cuerpoPx(TG.nota, D), tono, antes });

/** El aire entre dos piezas de una línea de estado, en px. */
const separacion = (D: number) => cuerpoPx(TG.nota, D) * ESPACIO_EM;

/**
 * La fila de estado: dónde se corre y el GPS; en fuerza, el pulso. Se prueba de
 * lo más completo a lo más corto y se queda con lo primero que cabe: primero
 * se va la flecha de «UP/DOWN cambian esto», después nunca el GPS.
 */
function lineaEstado(rol: string, s: Sesion, entorno: Entorno | null, elegible: boolean, sistema: Sistema, y: number, D: number): LineaG {
  const c = caja(y, ALTO_NOTA);
  const sep = separacion(D);
  const punto = (texto: string, tono: Tono) => pieza(texto, D, tono, sep);
  let opciones: Pieza[][];
  if (!seCorre(s.familia)) {
    // Fuerza: no hay GPS. Lo único que se espera es el pulso.
    opciones = [[pieza(TEXTO_PULSO[sistema.pulso.tipo], D, sistema.pulso.tipo === 'ok' ? 'tinta' : 'tinta2')]];
  } else {
    const nombre = NOMBRE_ENTORNO[entorno ?? 'calle'];
    const gps = necesitaGps(s, entorno)
      ? [punto('·', 'tinta2'), punto(TEXTO_GPS[sistema.gps], sistema.gps === 'listo' ? 'tinta' : 'tinta2')]
      : [punto('·', 'tinta2'), punto(TEXTO_SIN_GPS, 'tinta2')];
    const flecha = pieza('↑', D, 'tinta2');
    const base = [pieza(nombre, D, 'tinta'), ...gps];
    opciones = elegible ? [[flecha, { ...base[0]!, antes: sep }, ...base.slice(1)], base] : [base];
  }
  const ancho = Math.floor(c.ancho * D);
  const cabe = opciones.find((o) => anchoPiezas(o) <= ancho);
  return colocar(rol, cabe ?? opciones[opciones.length - 1]!, c, D, 'centro', cabe != null);
}

/**
 * Lo que el reloj tiene que decir de sí mismo bajo el estado: el plan viejo (pide
 * atención: en tinta) o el móvil ausente (solo informa: en tinta2). `null` = nada.
 */
export function avisoDelBrief(frescura: FrescuraPlan, movil: boolean): { texto: string; tono: Tono } | null {
  if (frescura.tipo === 'viejo') return { texto: `${textoEdadPlan(frescura.dias)} · ${TEXTO_ACERCA_MOVIL}`, tono: 'tinta' };
  return movil ? null : { texto: TEXTO_SIN_MOVIL, tono: 'tinta2' };
}

// ---------------------------------------------------------------------------
// G02 · el brief
// ---------------------------------------------------------------------------

export interface DatosBrief {
  sesion: Sesion;
  /** «Hoy», «Tarde»: qué día o franja (la duración la pone `disponerBrief`, de la sesión). */
  dia: string;
  /** El entorno con el que se sale; `null` en fuerza. */
  entorno: Entorno | null;
  /** ¿Cambia UP el entorno? Solo si la prescripción no lo fija. */
  elegible: boolean;
  sistema: Sistema;
  frescura: FrescuraPlan;
}

export interface BriefPuesto {
  disposicion: Disposicion;
  estructura: EstructuraPuesta;
}

export function disponerBrief(d: DatosBrief, D: number): BriefPuesto {
  const duracion = duracionDelBrief(d.sesion.plan.pasos);
  const bloques = bloquesDelBrief(d.sesion.plan.pasos);

  // De abajo arriba: el pulso al pie, la acción sobre él, el aviso, el estado.
  const yAccion = HASTA_PIE - ALTO_NOTA;
  const accion = lineaAccion(TEXTO_EMPEZAR, yAccion, D);
  let techo = yAccion - AIRE.lineas;
  const dicho = avisoDelBrief(d.frescura, d.sistema.movil);
  const aviso = dicho ? textoHasta('aviso', dicho.texto, techo, D, { tono: dicho.tono }) : null;
  if (aviso) techo = aviso.inicio - AIRE.lineas;
  const yEstado = techo - ALTO_NOTA;
  const estado = lineaEstado('estado', d.sesion, d.entorno, d.elegible, d.sistema, yEstado, D);

  // En medio, la estructura: desde debajo del contexto hasta el estado. Primero entera, con la duración arriba;
  // si no cabe, el resumen, con la duración en su línea y solo el día arriba.
  const arriba = (partes: string[]) => {
    const contexto = lineasContexto(partes, D, 'tinta2');
    return { contexto, y0: Math.max(REJILLA.heroe[0] - AIRE.lineas * 2, finDe(contexto, D, REJILLA.contexto[1])) };
  };
  const hasta = yEstado - AIRE.lineas * 2;
  let cabecera = arriba([d.dia, duracion]);
  let estructura = disponerEstructuraEntera(bloques, cabecera.y0, hasta, D);
  if (!estructura) {
    cabecera = arriba([d.dia]);
    estructura = disponerEstructuraResumen(bloques, duracion, cabecera.y0, hasta, D);
  }

  const lineas: LineaG[] = [...cabecera.contexto, ...estructura.lineas, estado, ...(aviso?.lineas ?? []), accion, lineaPulso(ppmDe(d.sistema.pulso), D)];
  return { disposicion: { D, lineas, heroe: null, pista: null }, estructura };
}

// ---------------------------------------------------------------------------
// La espera del GPS
// ---------------------------------------------------------------------------

export interface DatosEspera {
  entorno: Entorno;
  gps: Sistema['gps'];
  pulso: Pulso;
}

export const TEXTO_ESPERA = { buscando: 'Sale solo al fijar', listo: 'Empezamos' } as const;

/**
 * Tras «Empezar» con el GPS sin fijar: se espera aquí y la sesión arranca sola
 * al fijar (suena «GPS listo»). START = «Empezar sin GPS»: el ritmo será «—»
 * hasta que fije, nunca un cero (G7).
 */
export function disponerEspera(d: DatosEspera, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([NOMBRE_ENTORNO[d.entorno]], D, 'tinta2')];
  const yTitulo = REJILLA.heroe[0] + 0.08;
  const titulo = textoEn('titulo', TEXTO_GPS[d.gps === 'listo' ? 'listo' : 'buscando'], yTitulo, D, { frac: TG.segundo });
  const nota = textoEn('nota', TEXTO_ESPERA[d.gps === 'listo' ? 'listo' : 'buscando'], titulo.fin, D, { tono: 'tinta2' });
  lineas.push(...titulo.lineas, ...nota.lineas);
  if (d.gps === 'buscando') {
    // Dos líneas de acción: «START · Empezar» y, debajo, «sin GPS».
    const yUltima = HASTA_PIE - ALTO_NOTA;
    lineas.push(lineaAccion(TEXTO_EMPEZAR, yUltima - ALTO_NOTA - AIRE.lineas, D), lineaAccion(TEXTO_SIN_GPS, yUltima, D));
  }
  lineas.push(lineaPulso(ppmDe(d.pulso), D));
  return { D, lineas, heroe: null, pista: null };
}
