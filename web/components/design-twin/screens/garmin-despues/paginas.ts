// LAS PÁGINAS DEL RESUMEN — qué páginas tiene cada familia y en qué orden. PURO.
//
// Se recorren con UP y DOWN (en círculo), como las del vivo (Paso, Datos,
// Vueltas, Estructura); la última es SIEMPRE el estado de envío (G31), para que
// lo último que se ve diga la verdad:
//
//   correr / libre   Resumen · Series (por bloque) · ejercicios sueltos (las
//                    Wall Ball de un híbrido) · Kilómetros · Pulso · Envío
//   fuerza           Resumen · un ejercicio por página · Pulso · Envío
//   circuito         Resumen · Carrera · Estaciones · Tras estación · Pulso · Envío
//
// Una página lista larga se reparte en páginas del mismo tamaño (`lista.ts`).
// El orden es el de la muñeca de Apple; lo que cambia es que en un círculo una
// lista o un ejercicio ocupa su propia página.
//
// Qué NO hacer: poner una página nueva detrás del envío; aplanar dos ejercicios
// en una página para ahorrar páginas (se apretaría el texto hasta el suelo).

import type { Completitud, MetodoResumen } from '../../kit-reloj';
import type { Resultado } from '../reloj-antes-despues/calculo';
import type { Familia } from '../reloj-antes-despues/sesiones';
import type { DisposicionFin } from './comun';
import { TEXTO_ENVIO, disponerEnvio, type EstadoEnvio } from './envio';
import { FILAS_POR_PAGINA, disponerLista, filasDePagina, repartoEnPaginas, tituloDePagina } from './lista';
import { disponerPulso, repartoDePulso } from './pulso';
import { KM_POR_PAGINA, bloquesDeSeries, disponerResumenCorrer, filasDeKm, filasDeSeries, tituloDeKm, tituloDeSeries } from './resumenCorrer';
import { ESTACIONES_POR_PAGINA, costeDe, disponerCoste, disponerResumenCircuito, filasDeCarrera, filasDeEstaciones, tituloDeCarrera, totalEstaciones } from './resumenCircuito';
import { disponerEjercicio, disponerResumenFuerza } from './resumenFuerza';

export interface PaginaFin {
  id: string;
  /** Para la cronología y el lector: «Series 1/2». */
  titulo: string;
  disponer: (D: number) => DisposicionFin;
  /** Es la del envío (la última): la que decide qué hace START y BACK. */
  envio?: boolean;
}

export interface OpcionesPaginas {
  metodo: MetodoResumen;
  /** El estado de envío ahora, y cuántos rechazos lleva. */
  envio: { estado: EstadoEnvio; intentos: number };
}

/** Las páginas del pulso de un resultado: una por cada tanda de zonas (casi siempre una). */
function paginasDePulso(r: Resultado): PaginaFin[] {
  const de = repartoDePulso(r).length || 1;
  return Array.from({ length: de }, (_, k) => ({ id: `pulso-${k}`, titulo: de > 1 ? `Pulso ${k + 1}/${de}` : 'Pulso', disponer: (D: number) => disponerPulso(r, k, D) }));
}

/** La página del envío, la última de todas. */
function paginaDeEnvio(r: Resultado, o: OpcionesPaginas): PaginaFin {
  return { id: 'envio', titulo: TEXTO_ENVIO[o.envio.estado].titulo, envio: true, disponer: (D) => disponerEnvio(o.envio.estado, r.rpe, D, { intentos: o.envio.intentos }) };
}

/** Un ejercicio por página (fuerza, y las Wall Ball de un día de correr). */
function paginasDeEjercicios(r: Resultado): PaginaFin[] {
  return r.fuerza.map((e, k) => ({ id: `ejercicio-${k}`, titulo: e.paso.nombre ?? 'Ejercicio', disponer: (D: number) => disponerEjercicio(e, D) }));
}

function paginasDeCorrer(r: Resultado, c: Completitud, o: OpcionesPaginas): PaginaFin[] {
  const paginas: PaginaFin[] = [{ id: 'resumen', titulo: 'Resumen', disponer: (D) => disponerResumenCorrer(r, c, D) }];
  bloquesDeSeries(r.pasos).forEach((pasos, b) => {
    const filas = filasDeSeries(r, pasos, o.metodo);
    const reparto = repartoEnPaginas(filas.length, FILAS_POR_PAGINA.sola);
    reparto.forEach((_, k) => {
      const titulo = tituloDePagina(tituloDeSeries(pasos), k, reparto.length);
      paginas.push({ id: `series-${b}-${k}`, titulo: titulo.join(' · '), disponer: (D) => disponerLista(titulo, filasDePagina(filas, reparto, k), D) });
    });
  });
  paginas.push(...paginasDeEjercicios(r));
  const km = filasDeKm(r);
  const repartoKm = repartoEnPaginas(km.length, KM_POR_PAGINA);
  repartoKm.forEach((n, k) => {
    const desde = repartoKm.slice(0, k).reduce((a, x) => a + x, 0);
    const titulo = tituloDeKm(r, desde, desde + n);
    paginas.push({ id: `km-${k}`, titulo: titulo.join(' · '), disponer: (D) => disponerLista(titulo, filasDePagina(km, repartoKm, k), D) });
  });
  return [...paginas, ...paginasDePulso(r), paginaDeEnvio(r, o)];
}

function paginasDeFuerza(r: Resultado, c: Completitud, o: OpcionesPaginas): PaginaFin[] {
  return [{ id: 'resumen', titulo: 'Resumen', disponer: (D) => disponerResumenFuerza(r, c, D) }, ...paginasDeEjercicios(r), ...paginasDePulso(r), paginaDeEnvio(r, o)];
}

function paginasDeCircuito(r: Resultado, c: Completitud, o: OpcionesPaginas): PaginaFin[] {
  const coste = costeDe(r, o.metodo);
  const carrera = filasDeCarrera(r, coste);
  const est = filasDeEstaciones(r);
  const reparto = repartoEnPaginas(est.length, ESTACIONES_POR_PAGINA);
  const paginas: PaginaFin[] = [
    { id: 'resumen', titulo: 'Resumen', disponer: (D) => disponerResumenCircuito(r, c, D) },
    { id: 'carrera', titulo: 'Carrera', disponer: (D) => disponerLista(tituloDeCarrera(r), carrera, D) },
  ];
  reparto.forEach((_, k) => {
    const titulo = tituloDePagina(['Estaciones', totalEstaciones(r)], k, reparto.length);
    paginas.push({ id: `estaciones-${k}`, titulo: titulo.join(' · '), disponer: (D) => disponerLista(titulo, filasDePagina(est, reparto, k), D) });
  });
  paginas.push({ id: 'coste', titulo: 'Tras estación', disponer: (D) => disponerCoste(coste, D) });
  return [...paginas, ...paginasDePulso(r), paginaDeEnvio(r, o)];
}

/** Las páginas del resumen de una sesión, según su familia. */
export function paginasDeResumen(r: Resultado, familia: Familia, c: Completitud, o: OpcionesPaginas): PaginaFin[] {
  return familia === 'fuerza' ? paginasDeFuerza(r, c, o) : familia === 'circuito' ? paginasDeCircuito(r, c, o) : paginasDeCorrer(r, c, o);
}
