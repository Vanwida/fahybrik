// LAS PÁGINAS DEL CIRCUITO EN EL RELOJ GARMIN — UP/DOWN: Paso → Datos →
// Vueltas → Estructura (§5), con lo que un circuito pide en cada una. PURAS.
//
//   Datos        la sesión entera: el crono total (la puntuación) y lo que falta
//                para el cap, los km CORRIDOS y su ritmo medio (solo los tramos
//                de carrera: mezclados con las estaciones salía 9:30/km cuando
//                se corrió a 4:50), la Roxzone sumada y el pulso.
//   Vueltas      cada estación y cada tramo es su propia vuelta (P10): lo de
//                ahora encima de todo y lo último hecho debajo, con su parcial.
//   Estructura   el circuito por rondas (M4: la ronda 5 de 492 ya no lleva
//                Farmers): lo hecho, lo de ahora y lo que viene, en dos líneas.
//
// Las dos primeras usan las disposiciones del kit (`disponerDatos`,
// `disponerEstructura`); Vueltas es propia porque un nombre de estación
// («Burpee Broad Jump») no cabe en la fila de una vuelta numerada.
//
// Qué NO hacer: pintar aquí el coste de la carrera comprometida (va al
// resumen, P10: sin validar); mezclar los km de las estaciones con los corridos.

import type { FilaDatoVista, FilaLista } from '../../kit-reloj/listas';
import type { Lecturas, PasoBase } from '../../kit-reloj/paso';
import { nombreEnRuta, roxzoneDe, rutaDe, type FilaPasoRuta } from '../../kit-reloj/ruta';
import { fmtDistancia, fmtDuracion, fmtPrescrito, fmtReloj, fmtRitmo } from '../../kit-reloj/reglas';
import type { EstadoSecuencia } from '../../kit-reloj/secuencia';
import {
  AIRE,
  REJILLA,
  TG,
  ajustarPartes,
  altoLinea,
  anchoPiezas,
  caja,
  chica,
  colocar,
  cuerpoPx,
  cuerpoQueCabe,
  lineasContexto,
  repartir,
  type Disposicion,
  type LineaG,
  type Pieza,
} from '../../kit-garmin';
import { dosisCompleta } from '../reloj-circuito/texto';
import { rondasDe } from './plan';
import type { Circuito } from '../reloj-circuito/planes';

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/** Cuántas filas caben en la página Datos sin apretar (las que pasan, por prioridad). */
const FILAS_DATOS = 5;

/**
 * Las filas de Datos. Siempre el total, el ritmo al correr y el pulso; y, si
 * caben, lo que falta para el cap, la Roxzone y los km corridos. Sin dato, «—».
 */
export function filasDatosC(c: Circuito, e: EstadoSecuencia, lecturas: Lecturas, total: number | null): FilaDatoVista[] {
  // Solo los tramos de carrera: ni el calentamiento ni las estaciones ni la Roxzone.
  const esTramo = (i: number) => i >= c.inicio && c.plan.pasos[i]?.clase === 'carrera';
  const corridos = e.parciales.filter((x) => esTramo(x.i) && x.metros != null);
  const enCurso = esTramo(e.i) && e.midio ? { m: e.metros, s: e.t } : { m: 0, s: 0 };
  const m = corridos.reduce((a, x) => a + (x.metros ?? 0), 0) + enCurso.m;
  const s = corridos.reduce((a, x) => a + x.segundos, 0) + enCurso.s;
  const d = m > 0 ? fmtDistancia(m) : null;
  const rox = c.roxzone ? roxzoneDe(c.plan.pasos, e) : null;
  const ppm = lecturas.viejos?.includes('ppm') ? null : lecturas.ppm;
  const t = total ?? e.sesionT;

  const total_: FilaDatoVista = { valor: fmtReloj(t), unidad: 'total' };
  const cap: FilaDatoVista | null = c.cap != null ? { valor: fmtReloj(Math.max(0, c.cap - t)), unidad: `para el cap · ${fmtDuracion(c.cap)}` } : null;
  const km: FilaDatoVista = { valor: d ? d.valor : '—', unidad: `${d ? d.unidad : 'km'} corridos` };
  const ritmo: FilaDatoVista = { valor: m > 50 ? fmtRitmo(s / (m / 1000)) : '—', unidad: '/km al correr' };
  const roxzone: FilaDatoVista | null = rox != null ? { valor: fmtReloj(rox), unidad: 'Roxzone' } : null;
  const pulso: FilaDatoVista = { valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm', ppm, glifo: 'pulso' };

  // Las tres de siempre y, por prioridad, lo que quepa: lo que falta para el cap, la Roxzone, los km.
  const caben = [cap, roxzone, km].filter((f): f is FilaDatoVista => f != null).slice(0, FILAS_DATOS - 3);
  const si = (f: FilaDatoVista | null) => (f && caben.includes(f) ? f : null);
  return [total_, si(cap), si(km), ritmo, si(roxzone), pulso].filter((f): f is FilaDatoVista => f != null);
}

// ---------------------------------------------------------------------------
// Vueltas — la ruta de un circuito
// ---------------------------------------------------------------------------

export interface FilaVuelta {
  nombre: string;
  /** El parcial (o el crono de lo de ahora), ya dicho: «4:41». */
  valor: string;
  detalle: string | null;
  estado: 'hecho' | 'ahora';
}

/** Cuántas vueltas caben (dos líneas cada una): lo de ahora y las dos últimas hechas. */
export const VUELTAS_CIRCUITO = 3;

/** Las reps dichas en la campana del paso `i` (la del AMRAP `i - 1`), si las hay. */
export type RepsDe = (i: number) => number | null;

/** Lo que dice una vuelta además de su tiempo: el ritmo de un tramo que no es un km justo, las reps de un AMRAP. */
function detalleDe(p: PasoBase, f: FilaPasoRuta, segundos: number, reps: RepsDe): string | null {
  if (p.clase === 'amrap' && f.parcial) {
    const dichas = reps(f.i + 1);
    return dichas != null ? `${dichas} reps` : null;
  }
  const m = f.parcial?.metros;
  if (p.clase === 'carrera' && m != null && m > 50 && p.medida.prescrito !== 1000) return `${fmtRitmo(segundos / (m / 1000))} /km`;
  return null;
}

/**
 * La ruta como vueltas: lo de ahora, con su crono, y lo último hecho, con su
 * parcial (el que deja el motor al cerrar cada paso). El título dice la
 * Roxzone sumada si el coach la activó, y si no, cuántos van.
 */
export function filasVueltasC(c: Circuito, e: EstadoSecuencia, reps: RepsDe): { titulo: string[]; filas: FilaVuelta[] } {
  const ruta = rutaDe(c.plan.pasos, e, { desde: c.inicio, cabecerasDeRonda: false, sueltas: 'pasadas' });
  const pasos = ruta.filter((f): f is FilaPasoRuta => f.tipo === 'paso');
  const vueltas: FilaVuelta[] = pasos
    .filter((f) => f.estado !== 'pendiente')
    .map((f): FilaVuelta => {
      const segundos = f.parcial?.segundos ?? e.t;
      return {
        nombre: nombreEnRuta(f.paso, true),
        valor: fmtReloj(segundos),
        detalle: detalleDe(f.paso, f, segundos, reps),
        estado: f.estado === 'ahora' ? 'ahora' : 'hecho',
      };
    })
    .reverse();
  const listados = pasos.filter((f) => !f.suelta);
  const hechos = listados.filter((f) => f.estado === 'hecho').length;
  const rox = c.roxzone ? roxzoneDe(c.plan.pasos, e) : null;
  return { titulo: ['Vueltas', rox != null ? `Roxzone ${fmtReloj(rox)}` : `${hechos}/${listados.length}`], filas: vueltas.slice(0, VUELTAS_CIRCUITO) };
}

/** Lo que pesa una vuelta: el nombre (con su punto de estado) y debajo su tiempo y su detalle. */
function piezasVuelta(f: FilaVuelta, D: number, cuerpoTiempo: number): { nombre: Pieza[]; dato: Pieza[] } {
  const ahora = f.estado === 'ahora';
  const dato: Pieza[] = [{ texto: f.valor, cara: 'cifras', cuerpo: cuerpoTiempo, tono: ahora ? 'tinta2' : 'tinta' }];
  if (f.detalle) dato.push(chica(f.detalle, D, 'tinta2', AIRE.piezas * D));
  const punto: Pieza = { texto: '', cara: 'nota', cuerpo: cuerpoPx(TG.nota, D), tono: 'tinta', glifo: ahora ? 'ahora' : 'hecho' };
  return { nombre: [punto], dato };
}

/**
 * LAS VUELTAS DE UN CIRCUITO: tres vueltas de dos líneas, la de ahora arriba.
 * Cada una, su nombre de catálogo entero (nunca cortado) y debajo el tiempo con
 * su detalle. Sin vueltas, «Aún ninguna» (nunca una fila vacía).
 */
export function disponerVueltasC(titulo: string[], filas: FilaVuelta[], D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(titulo, D, 'tinta2')];
  if (filas.length === 0) {
    const c = caja(0.5 - altoLinea(TG.nota, 'nota') / 2, altoLinea(TG.nota, 'nota'));
    lineas.push(colocar('vacia', [chica('Aún ninguna', D)], c, D));
    return { D, lineas, heroe: null, pista: null };
  }
  const altoNombre = altoLinea(TG.contexto, 'texto');
  const altoDato = altoLinea(TG.tercero, 'cifras');
  const cajas = repartir(filas.length, altoNombre + altoDato, [REJILLA.heroe[0], REJILLA.pie[0]]);
  filas.forEach((f, k) => {
    const y = cajas[k]!.y;
    const arriba = caja(y, altoNombre);
    const abajo = caja(y + altoNombre, altoDato);
    const { nombre: punto } = piezasVuelta(f, D, 0);
    const anchoNombre = Math.floor(arriba.ancho * D) - anchoPiezas(punto) - AIRE.piezas * D;
    const a = ajustarPartes([f.nombre], 'texto', TG.contexto, D, anchoNombre);
    const ahora = f.estado === 'ahora';
    lineas.push(
      colocar('vuelta', [...punto, { texto: a.texto, cara: 'texto', cuerpo: a.cuerpo, tono: ahora ? 'tinta' : 'tinta2', antes: AIRE.piezas * D }], arriba, D, 'centro', a.cabe),
    );
    const r = cuerpoQueCabe((cu) => piezasVuelta(f, D, cu).dato, TG.tercero, D, Math.floor(abajo.ancho * D));
    lineas.push(colocar('parcial', r.piezas, abajo, D, 'centro', r.cabe));
  });
  return { D, lineas, heroe: null, pista: null };
}

// ---------------------------------------------------------------------------
// Estructura — por rondas
// ---------------------------------------------------------------------------

/** «Ronda 3» (o «Estación 3» en HYROX, donde el atleta cuenta estaciones). */
const nombreDeRonda = (c: Circuito, n: number) => `${c.formato === 'hyrox' ? 'Estación' : 'Ronda'} ${n}`;

/**
 * La estructura del circuito, una fila por ronda: qué estaciones (con la
 * ronda delante, para que no se pierda si hay que quitar por el final) y
 * debajo el tramo y las dosis con su carga. Sale de los pasos, no de un título.
 */
export function filasEstructuraC(c: Circuito, i: number): FilaLista[] {
  return rondasDe(c.plan.pasos).map((r) => {
    const carreras = r.trabajo.filter((p) => p.clase === 'carrera').map((p) => `Run ${fmtPrescrito(p.medida)}`);
    const otras = r.trabajo.filter((p) => p.clase !== 'carrera');
    const nombres = [...new Set(otras.map((p) => p.nombre).filter((x): x is string => !!x))];
    const dosis = otras.flatMap((p) => (p.medida.prescrito != null ? dosisCompleta(p) : []));
    return {
      linea: [nombreDeRonda(c, r.n), ...nombres].join(' · '),
      detalle: [...carreras, ...dosis].join(' · ') || null,
      estado: i > r.hasta ? 'hecho' : i >= r.desde ? 'ahora' : 'pendiente',
    };
  });
}
