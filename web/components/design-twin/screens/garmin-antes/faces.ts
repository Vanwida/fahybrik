// LAS CARAS DE «ANTES» — glance, lista del día, día libre, sin plan, sin detalle. PURAS.
//
// Cada una es una función de datos a una `Disposicion` sobre el círculo (la
// vista solo la pinta y los tests la miden), con el vocabulario del kit:
//
//   G01 disponerGlance     la tarjeta de UNA línea del bucle de glances de Garmin:
//                          «Hoy» y, debajo, «6 × 1000 m · 55′». Un glance corre con
//                          32–64 KB: no carga el plan, lee una línea ya precalculada
//                          (título y duración) que la sincronización dejó guardada.
//   G03 disponerLista      varias sesiones el mismo día: mañana y tarde, la enfocada
//                          en el centro con su marco naranja (la acción del momento).
//   G04 disponerNoToca     hoy no toca: «Descanso», lo de mañana y el entreno libre.
//   G05 disponerSinPlan    el reloj no tiene plan: «acerca el móvil», y entreno libre.
//       disponerSinDetalle el reloj sabe QUE hay sesión pero no tiene sus pasos:
//                          sin detalle NO hay Empezar (DECISIONS 2026-09-28).
//
// El glance NO es el «esfera» ni el «Smart Stack» de la muñeca de Apple: esos son
// una complicación y un widget de watchOS. En Garmin lo que se ve fuera de la app
// es el glance, y lo dibuja la app, pero UP/DOWN pasan al glance vecino y los
// lleva el sistema.
//
// Qué NO hacer: pintar aquí nada del plan que no esté ya en la línea del glance;
// escribir un ritmo o un nombre de clase (salen de `hoyDe`); poner «Empezar» donde
// no hay detalle.

import { colocar, type Disposicion, type LineaG } from '../../kit-garmin/disponer';
import { lineasContexto } from '../../kit-garmin/caras';
import { REJILLA, anchoUtilFila, caja } from '../../kit-garmin/geometria';
import { ajustarPartes, anchoPiezas, type Glifo, type Pieza } from '../../kit-garmin/medir';
import { AIRE, TG, cuerpoPx } from '../../kit-garmin/tokens';
import { hoyDe, type PasoBase } from '../../kit-reloj';
import {
  TIPOS_LIBRES,
  textoEdadPlan,
  tituloDe,
  vistaDeHoy,
  type FrescuraPlan,
  type Franja,
  type Hoy,
  type SesionDelDia,
} from './estado';
import { ALTO_NOTA, finDe, lineaAccion, textoEn, unaLinea } from './filas';
import { altoLinea } from '../../kit-garmin/disponer';

export const TEXTO_HOY = 'Hoy';
export const TEXTO_FRANJA: Record<Franja, string> = { manana: 'Mañana', tarde: 'Tarde' };
export const TEXTO_ENTRENO_LIBRE = 'START · Entreno libre';
/** «Mañana» en el sentido de mañana-día (el del día libre), no el de la franja. */
export const TEXTO_MANANA_DIA = 'Mañana';

// ---------------------------------------------------------------------------
// G01 · el glance
// ---------------------------------------------------------------------------

/** Lo que dice la tarjeta: la etiqueta («Hoy · 55′»), la línea del título y, si hace falta, una nota. */
export interface DatosGlance {
  etiqueta: string[];
  linea: string[];
  nota: string | null;
}

/** Lo que guarda el glance (una línea precalculada) a partir de lo que toca hoy. */
export function glanceDe(hoy: Hoy): DatosGlance {
  const v = vistaDeHoy(hoy);
  const de = (s: SesionDelDia) => hoyDe(s.sesion.plan.pasos);
  switch (v) {
    case 'sin-plan':
      return { etiqueta: [TEXTO_HOY], linea: ['Sin plan'], nota: 'acerca el móvil' };
    case 'no-toca':
      return { etiqueta: [TEXTO_HOY], linea: ['Descanso'], nota: hoy.manana ? `${TEXTO_MANANA_DIA} · ${hoyDe(hoy.manana).titulo}` : null };
    case 'varias': {
      // Lo que importa es la que toca ahora: su franja y su título; cuántas hay, en la etiqueta.
      const siguiente = hoy.sesiones.find((s) => !s.hecha);
      const linea = siguiente ? [siguiente.franja ? TEXTO_FRANJA[siguiente.franja] : null, tituloDe(siguiente.sesion)].filter((x): x is string => x != null) : ['Hechas'];
      return { etiqueta: [TEXTO_HOY, `${hoy.sesiones.length} sesiones`], linea, nota: null };
    }
    case 'sin-detalle':
      return { etiqueta: [TEXTO_HOY, de(hoy.sesiones[0]!).dur], linea: [de(hoy.sesiones[0]!).titulo], nota: 'Falta la sesión' };
    case 'una':
      return { etiqueta: [TEXTO_HOY, de(hoy.sesiones[0]!).dur], linea: [de(hoy.sesiones[0]!).titulo], nota: notaDePlan(hoy.plan) };
  }
}

const notaDePlan = (f: FrescuraPlan): string | null => (f.tipo === 'viejo' ? textoEdadPlan(f.dias) : null);

/** El aire, en fracción de D, entre el texto y el filo del marco: a los lados y arriba y abajo. */
const RELLENO_MARCO = { x: AIRE.piezas, y: AIRE.piezas } as const;
/** Lo que se le quita de ancho a las líneas de una tarjeta de varias líneas: el marco es una píldora y sus extremos se curvan. */
const MARGEN_TARJETA = 0.2;

/**
 * El marco de la acción del momento alrededor de `lineas`: naranja, en forma de
 * píldora (su radio es la mitad de su alto, lo pinta el kit). Como los extremos se
 * curvan, una línea de arriba o de abajo no puede llegar al filo de la píldora: el
 * ancho sale de la línea que más lo pide, con la curva medida, y nunca pasa de la
 * cuerda del círculo a su altura.
 */
export function marcoDe(lineas: LineaG[], D: number): NonNullable<Disposicion['marco']> {
  const arriba = Math.min(...lineas.map((l) => l.y)) - RELLENO_MARCO.y * D;
  const abajo = Math.max(...lineas.map((l) => l.y + l.alto)) + RELLENO_MARCO.y * D;
  const alto = abajo - arriba;
  const centro = (arriba + abajo) / 2;
  const r = alto / 2;
  // Semi-ancho que pide cada línea: su mitad, más el relleno, menos lo que la curva le regala (a su borde más lejano del centro).
  const semi = Math.max(
    ...lineas.map((l) => {
      const dy = Math.max(Math.abs(l.y - centro), Math.abs(l.y + l.alto - centro));
      const curva = Math.sqrt(Math.max(0, r * r - Math.min(dy, r) ** 2));
      return l.ancho / 2 + RELLENO_MARCO.x * D + r - curva;
    }),
  );
  const cuerda = Math.floor(anchoUtilFila(arriba / D, alto / D) * D);
  return { y: arriba, alto, ancho: Math.min(cuerda, 2 * semi) };
}

/**
 * G01 · LA TARJETA: «Hoy · 55′», el título y, si el plan está viejo o falta algo,
 * una nota. Va enfocada (marco naranja): START la abre.
 */
export function disponerGlance(g: DatosGlance, D: number): Disposicion {
  const altoLineaPpal = altoLinea(TG.tercero, 'texto');
  const total = ALTO_NOTA + AIRE.lineas + altoLineaPpal + (g.nota ? AIRE.lineas + ALTO_NOTA : 0);
  const y0 = 0.5 - total / 2;
  const margen = MARGEN_TARJETA;
  const etiqueta = unaLinea('etiqueta', g.etiqueta, TG.nota, 'tinta2', y0, D, 'texto', margen);
  const yLinea = y0 + ALTO_NOTA + AIRE.lineas;
  const ppal = unaLinea('glance', g.linea, TG.tercero, 'tinta', yLinea, D, 'texto', margen);
  const lineas: LineaG[] = [etiqueta.linea, ppal.linea];
  if (g.nota) lineas.push(...textoEn('nota', g.nota, yLinea + altoLineaPpal + AIRE.lineas, D, { tono: 'tinta2', margen }).lineas);
  return { D, lineas, heroe: null, pista: null, marco: marcoDe(lineas, D) };
}

// ---------------------------------------------------------------------------
// G03 · varias sesiones el mismo día
// ---------------------------------------------------------------------------

export interface FilaDeLista {
  franja: Franja | null;
  titulo: string;
  dur: string;
  hecha: boolean;
}

export function filasDeLista(hoy: Hoy): FilaDeLista[] {
  return hoy.sesiones.map((s) => ({ franja: s.franja, titulo: hoyDe(s.sesion.plan.pasos).titulo, dur: hoyDe(s.sesion.plan.pasos).dur, hecha: s.hecha }));
}

/** Cuántas sesiones se ven a cada lado de la enfocada. */
const VECINAS_LISTA = 2;

/**
 * G03 · LA LISTA DEL DÍA: la enfocada en el centro (el sitio más ancho) con su
 * marco, las demás arriba y abajo en tinta2. Cada fila: si está hecha o por
 * hacer (el punto del kit), y qué es. UP/DOWN mueven el foco; START abre.
 */
export function disponerLista(filas: FilaDeLista[], foco: number, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([TEXTO_HOY, `${filas.length} sesiones`], D, 'tinta2')];
  const altoFoco = altoLinea(TG.tercero, 'texto') * 1.3;
  const yFoco = 0.5 - altoFoco / 2;
  let marco: Disposicion['marco'] = null;
  filas.forEach((f, k) => {
    const d = k - foco;
    if (Math.abs(d) > VECINAS_LISTA) return;
    const enfocada = d === 0;
    const y = enfocada ? yFoco : d < 0 ? yFoco + d * (ALTO_NOTA + AIRE.lineas * 3) : yFoco + altoFoco + AIRE.lineas + (d - 1) * (ALTO_NOTA + AIRE.lineas * 3);
    const c = enfocada ? caja(yFoco, altoFoco) : caja(y, ALTO_NOTA);
    const frac = enfocada ? TG.tercero : TG.nota;
    const glifo: Glifo = f.hecha ? 'hecho' : 'pendiente';
    const punto: Pieza = { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: enfocada ? 'tinta' : 'tinta2', glifo };
    const partes = [f.franja ? TEXTO_FRANJA[f.franja] : null, f.titulo, f.dur].filter((x): x is string => x != null);
    const a = ajustarPartes(partes, 'texto', frac, D, Math.floor(c.ancho * D) - anchoPiezas([punto]) - AIRE.piezas * D * (enfocada ? 4 : 1));
    const linea = colocar(
      `sesion:${k}`,
      [punto, { texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono: enfocada ? 'tinta' : 'tinta2', antes: AIRE.piezas * D }],
      c,
      D,
      'centro',
      a.cabe,
    );
    lineas.push(linea);
    if (enfocada) marco = marcoDe([linea], D);
  });
  return { D, lineas, heroe: null, pista: null, marco };
}

// ---------------------------------------------------------------------------
// G04 · hoy no toca · G05 · sin plan · sin detalle
// ---------------------------------------------------------------------------

/** Dónde empieza el contenido bajo el contexto (fracción de D). */
const Y_CUERPO = REJILLA.heroe[0] + AIRE.piezas;

/** G04 · HOY NO TOCA: «Descanso», lo de mañana y la salida al entreno libre. */
export function disponerNoToca(manana: PasoBase[] | null, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([TEXTO_HOY], D, 'tinta2')];
  const titulo = textoEn('titulo', 'Descanso', Y_CUERPO, D, { frac: TG.segundo });
  lineas.push(...titulo.lineas);
  let y = titulo.fin;
  if (manana) {
    const h = hoyDe(manana);
    const m = textoEn('manana', `${TEXTO_MANANA_DIA} · ${h.titulo} · ${h.dur}`, y, D, { tono: 'tinta2' });
    lineas.push(...m.lineas);
    y = m.fin;
  }
  lineas.push(lineaAccion(TEXTO_ENTRENO_LIBRE, Math.max(y + AIRE.piezas, REJILLA.banda[0]), D));
  return { D, lineas, heroe: null, pista: null };
}

/** G05 · SIN PLAN: el reloj no ha traído nada. Se dice cómo arreglarlo; el entreno libre sigue ahí. */
export function disponerSinPlan(D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([TEXTO_HOY], D, 'tinta2')];
  const titulo = textoEn('titulo', 'Sin plan', Y_CUERPO, D, { frac: TG.segundo });
  const como = textoEn('como', 'Acerca el móvil', titulo.fin, D, { tono: 'tinta' });
  const para = textoEn('para', 'para traer tu plan', como.fin, D, { tono: 'tinta2' });
  lineas.push(...titulo.lineas, ...como.lineas, ...para.lineas, lineaAccion(TEXTO_ENTRENO_LIBRE, Math.max(para.fin + AIRE.piezas, REJILLA.banda[0]), D));
  return { D, lineas, heroe: null, pista: null };
}

/**
 * G05 · SIN DETALLE: se sabe que hay sesión (el glance trae su título) pero el
 * reloj no tiene los pasos. No hay Empezar: ni contra la asignación ni con un
 * sustituto (DECISIONS 2026-09-28). El reloj la pide al móvil solo.
 */
export function disponerSinDetalle(titulo: string[], D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto([TEXTO_HOY], D, 'tinta2')];
  const ppal = unaLinea('titulo', titulo, TG.tercero, 'tinta', Y_CUERPO, D);
  lineas.push(ppal.linea);
  const falta = textoEn('falta', 'Falta la sesión en el reloj', finDe([ppal.linea], D, Y_CUERPO) + AIRE.piezas, D, { tono: 'tinta' });
  const como = textoEn('como', 'acerca el móvil', falta.fin, D, { tono: 'tinta2' });
  lineas.push(...falta.lineas, ...como.lineas);
  return { D, lineas, heroe: null, pista: null };
}

/** Los tipos de entreno libre, como opciones de menú. */
export const OPCIONES_LIBRES = TIPOS_LIBRES.map((t) => ({ id: t.id, texto: t.texto }));
