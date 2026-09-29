// LAS PÁGINAS Y LOS MENÚS, DISPUESTOS — funciones PURAS sobre el círculo.
//
//   disponerDatos       G23  la sesión entera: tiempo, distancia, ritmo medio, pulso.
//   disponerVueltas     G24  la última arriba (y la que se corre, encima de todas).
//   disponerEstructura  G25  la sesión del coach, tres bloques alrededor de «ahora».
//   disponerMenu        G22  Controles (y sus confirmaciones, y el entorno): la
//                            opción enfocada en el centro, en su marco naranja
//                            (es la acción del momento); las vecinas, en tinta2.
//   disponerDescartada       «Sesión descartada»: nada se guarda.
//
// Las filas salen de `kit-reloj` (`filasDeDatos`, `filasDeVueltas`,
// `textoFila`): el mismo dato que la corona de la muñeca, otro lienzo.
//
// Qué NO hacer: meter más filas de las que caben en su altura del círculo
// (se enseña una ventana); truncar (se quitan partes por el final).

import type { LineaVista } from '../kit-reloj/lamina';
import type { FilaDatoVista, FilaLista, FilaSplit } from '../kit-reloj/listas';
import type { ZonasCoach } from '../kit-reloj/paso';
import { zonaDe } from '../kit-reloj/reglas';
import { colorZona } from '../kit-reloj/tokens';
import { lineasContexto } from './caras';
import { altoLinea, altoNota, chica, colocar, lineaDeDato, type Disposicion, type LineaG } from './disponer';
import { REJILLA, caja, repartir } from './geometria';
import { ajustarPartes, anchoPiezas, cuerpoQueCabe, enSubconjunto, type Glifo, type Pieza } from './medir';
import { AIRE, TG, cuerpoPx } from './tokens';

const ALTO_NOTA = altoLinea(TG.nota, 'nota');
/** Donde viven las filas de una página: bajo el contexto y por encima del pie. */
const CUERPO_PAGINA = [REJILLA.heroe[0], REJILLA.pie[0]] as const;

// ---------------------------------------------------------------------------
// G23 · Datos
// ---------------------------------------------------------------------------

/** LA SESIÓN ENTERA — cuatro filas «valor unidad» (el pulso con su zona), como la de la muñeca. */
export function disponerDatos(filas: FilaDatoVista[], zonas: ZonasCoach | null, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(['Sesión'], D, 'tinta2')];
  const cajas = repartir(filas.length, altoLinea(TG.segundo, 'cifras'), [REJILLA.heroe[0], REJILLA.secundaria[1]]);
  filas.forEach((f, k) => {
    const z = f.ppm != null && zonas ? zonaDe(f.ppm, zonas) : null;
    const lv: LineaVista = {
      valor: f.valor,
      unidad: f.unidad,
      glifo: f.glifo,
      zona: z != null && zonas ? { n: z, color: colorZona(z, zonas.techos.length) } : undefined,
    };
    lineas.push(lineaDeDato('dato', lv, TG.segundo, cajas[k]!, D));
  });
  return { D, lineas, heroe: null, pista: null };
}

// ---------------------------------------------------------------------------
// G24 · Vueltas
// ---------------------------------------------------------------------------

/** Cuántas vueltas caben en la página redonda. */
export const VUELTAS_VISIBLES = 4;

function piezasSplit(f: FilaSplit, cuerpo: number, D: number, ahora: boolean, conDetalle: boolean): Pieza[] {
  const aire = AIRE.piezas * D;
  const ps: Pieza[] = [chica(f.n, D, ahora ? 'tinta' : 'tinta2')];
  // «250 m» (una serie por tiempo se lee por sus metros): el número en cifras, la unidad en la sans.
  const [, num, unidad] = /^(\S+) (\S+)$/.exec(f.valor) ?? [];
  const partido = num && unidad && enSubconjunto(num);
  ps.push({ texto: partido ? num! : f.valor, cara: partido || enSubconjunto(f.valor) ? 'cifras' : 'texto', cuerpo, tono: ahora ? 'tinta2' : 'tinta', antes: aire });
  if (partido) ps.push(chica(unidad!, D, 'tinta2', AIRE.unidad * D));
  if (conDetalle && f.detalle) ps.push(chica(f.detalle, D, 'tinta2', aire));
  const juicio = ahora ? { texto: f.detalle ?? 'ahora', fuera: false } : f.juicio;
  if (juicio) ps.push({ texto: juicio.texto, cara: juicio.fuera ? 'texto' : 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: juicio.fuera ? 'tinta' : 'tinta2', antes: aire });
  return ps;
}

/** LAS VUELTAS — la última arriba, contra su objetivo; la que se corre, encima de todas («ahora»). */
export function disponerVueltas(titulo: string[], filas: FilaSplit[], enCurso: { n: string; valor: string } | null, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(titulo, D, 'tinta2')];
  const ultimas = [...filas].reverse().slice(0, enCurso ? VUELTAS_VISIBLES - 1 : VUELTAS_VISIBLES);
  const todas: Array<{ f: FilaSplit; ahora: boolean }> = [...(enCurso ? [{ f: { n: enCurso.n, valor: enCurso.valor }, ahora: true }] : []), ...ultimas.map((f) => ({ f, ahora: false }))];
  if (todas.length === 0) {
    lineas.push(colocar('vacia', [chica('Aún ninguna', D)], caja(0.5 - ALTO_NOTA / 2, ALTO_NOTA), D));
    return { D, lineas, heroe: null, pista: null };
  }
  const cajas = repartir(todas.length, altoLinea(TG.tercero, 'cifras'), CUERPO_PAGINA);
  todas.forEach(({ f, ahora }, k) => {
    const c = cajas[k]!;
    const ancho = Math.floor(c.ancho * D);
    // Primero con el detalle (el ritmo); si no cabe, sin él. El veredicto no se quita.
    let r = cuerpoQueCabe((cu) => piezasSplit(f, cu, D, ahora, true), TG.tercero, D, ancho);
    if (!r.cabe) r = cuerpoQueCabe((cu) => piezasSplit(f, cu, D, ahora, false), TG.tercero, D, ancho);
    lineas.push(colocar(ahora ? 'vuelta-ahora' : 'vuelta', r.piezas, c, D, 'centro', r.cabe));
  });
  return { D, lineas, heroe: null, pista: null };
}

// ---------------------------------------------------------------------------
// G25 · Estructura
// ---------------------------------------------------------------------------

/** Cuántos bloques caben (dos líneas cada uno). */
export const BLOQUES_VISIBLES = 3;

/** LA ESTRUCTURA — lo hecho y lo que viene en tinta2, lo de ahora en tinta; cada bloque, qué y contra qué. */
export function disponerEstructura(filas: FilaLista[], D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(['Estructura'], D, 'tinta2')];
  const ahora = Math.max(0, filas.findIndex((f) => f.estado === 'ahora'));
  const desde = Math.max(0, Math.min(ahora - 1, filas.length - BLOQUES_VISIBLES));
  const ventana = filas.slice(desde, desde + BLOQUES_VISIBLES);
  const altoLineaCtx = altoLinea(TG.contexto, 'texto');
  // Cada bloque mide lo que lleva (con detalle o sin él), y el aire se reparte
  // igual entre ellos. Hasta la secundaria: más abajo la cuerda ya no deja
  // leer un detalle.
  const altos = ventana.map((f) => altoLineaCtx + (f.detalle ? ALTO_NOTA : 0));
  const [desdeF, hastaF] = [REJILLA.heroe[0], REJILLA.secundaria[1]];
  const total = altos.reduce((a, x) => a + x, 0);
  // El aire, igual entre bloques y nunca más que una línea: el grupo se centra, no se desparrama.
  const aire = ventana.length > 1 ? Math.min(altoNota, Math.max(0, (hastaF - desdeF - total) / (ventana.length - 1))) : 0;
  const y0 = desdeF + Math.max(0, hastaF - desdeF - total - aire * (ventana.length - 1)) / 2;
  const ys = altos.reduce<number[]>((acc, a) => [...acc, acc[acc.length - 1]! + a + aire], [y0]);
  ventana.forEach((f, k) => {
    const c = caja(ys[k]!, altos[k]!);
    const enCurso = f.estado === 'ahora';
    const arriba = caja(c.y, altoLineaCtx);
    const glifo: Glifo = f.estado;
    const punto: Pieza = { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta', glifo };
    const anchoTexto = Math.floor(arriba.ancho * D) - anchoPiezas([punto]) - AIRE.piezas * D;
    const a = ajustarPartes(f.linea.split(' · '), 'texto', TG.contexto, D, anchoTexto);
    lineas.push(colocar('bloque', [punto, { texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono: enCurso ? 'tinta' : 'tinta2', antes: AIRE.piezas * D }], arriba, D, 'centro', a.cabe));
    if (f.detalle) {
      const abajo = caja(c.y + altoLineaCtx, ALTO_NOTA);
      const d = ajustarPartes(f.detalle.split(' · '), 'nota', TG.nota, D, Math.floor(abajo.ancho * D));
      lineas.push(colocar('detalle', [{ texto: d.texto, cara: 'nota', cuerpo: d.cuerpo, tono: 'tinta2' }], abajo, D, 'centro', d.cabe));
    }
  });
  return { D, lineas, heroe: null, pista: null };
}

// ---------------------------------------------------------------------------
// G22 · los menús (Controles, confirmar, entorno)
// ---------------------------------------------------------------------------

export interface OpcionMenu {
  id: string;
  texto: string;
}

/** Cuántas vecinas se ven a cada lado de la enfocada. */
export const VECINAS = 2;

/**
 * UN MENÚ — el título arriba, la opción enfocada en el centro (el sitio más
 * ancho del círculo) con su marco de acción, y hasta dos vecinas a cada lado.
 * Con UP/DOWN se mueve el foco; START elige; BACK cierra (§5).
 */
export function disponerMenu(titulo: string[], opciones: OpcionMenu[], foco: number, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(titulo, D, 'tinta2')];
  const altoFoco = altoLinea(TG.tercero, 'texto') * 1.3;
  const yFoco = 0.5 - altoFoco / 2;
  const enfocada = caja(yFoco, altoFoco);
  let marco: Disposicion['marco'] = null;
  opciones.forEach((o, k) => {
    const d = k - foco;
    if (Math.abs(d) > VECINAS) return;
    if (d === 0) {
      const a = ajustarPartes([o.texto], 'texto', TG.tercero, D, Math.floor(enfocada.ancho * D) - 2 * AIRE.piezas * D);
      const l = colocar(`opcion:${o.id}`, [{ texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono: 'tinta' }], enfocada, D, 'centro', a.cabe);
      lineas.push(l);
      marco = { y: l.y, alto: l.alto, ancho: Math.min(l.anchoUtil, l.ancho + 4 * AIRE.piezas * D) };
      return;
    }
    const y = d < 0 ? yFoco + d * (altoNota + AIRE.lineas) : yFoco + altoFoco + AIRE.lineas + (d - 1) * (altoNota + AIRE.lineas);
    const c = caja(y, ALTO_NOTA);
    const a = ajustarPartes([o.texto], 'nota', TG.nota, D, Math.floor(c.ancho * D));
    lineas.push(colocar(`opcion:${o.id}`, [{ texto: a.texto, cara: 'nota', cuerpo: a.cuerpo, tono: 'tinta2' }], c, D, 'centro', a.cabe));
  });
  return { D, lineas, heroe: null, pista: null, marco };
}

/** SESIÓN DESCARTADA: dicho sin adornos. */
export function disponerDescartada(D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(['Sesión descartada'], D)];
  lineas.push(colocar('detalle', [chica('No se ha guardado nada', D)], caja(0.5 - ALTO_NOTA / 2, ALTO_NOTA), D));
  return { D, lineas, heroe: null, pista: null };
}
