// QUÉ ES EL SUJETO DE «CARRERAS» AHORA, y las pocas derivaciones que la pestaña
// necesita. Puras sobre la `LecturaCarreras`: la pantalla pinta lo que decidan,
// no decide nada por su cuenta. Lo fija `tests/design-twin/carreras-decide.test.ts`
// sobre los veinte casos.
//
// La tesis (la misma que «Hoy · El día»): la pestaña de carreras no enseña el
// mismo panel siempre, enseña LA CARRERA QUE IMPORTA AHORA, y eso cambia a lo
// largo de la temporada. Precedencia OBJETIVA (cada paso tapa a los de debajo
// porque sin él los de debajo no se pueden leer o no se pueden hacer):
//   1. cargando       → esqueleto (aún no sabemos cuál de los demás toca)
//   2. error de carga → «No pudimos cargar tus carreras» con «Reintentar»
//   3. postcarrera    → corriste hace poco y falta tu resultado: es lo único que
//                        puedes hacer ahora con esa carrera (importarlo)
//   4. objetivo       → el principal; si no hay, la más próxima que haya
//   5. última         → sin nada por delante, la última carrera con resultado
//   6. vacío          → ni carreras por delante ni por detrás: la invitación
//
// El «postcarrera» va por delante del objetivo porque es lo más perecedero: el
// objetivo sigue dentro de 39 días, pedirle el resultado de ayer no.

import type { CarreraPasada, EstacionVsReferencia, LecturaCarreras, Prediccion, ProximaCarrera } from './contrato';
import { diasEntre, esPrincipal, estacionesTotalS, INDICES_ESTACION, puestoTexto } from './formato';

/**
 * Cuántos días después de correr una carrera SIN resultado sigue siendo lo primero
 * que se le pide al atleta. Pasado ese plazo la carrera baja al historial con su
 * «resultado pendiente» y su salida, y el objetivo vuelve a mandar. No es método
 * de un entrenador (nadie decide cuándo se importa un resultado): es una
 * decisión de producto, con nombre para que no viva como un 14 suelto.
 */
export const DIAS_POSTCARRERA = 14;

/** Cuántas carreras entran en la gráfica de evolución (la app usa las últimas cuatro). */
export const PUNTOS_EVOLUCION = 4;

export type Sujeto =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'postcarrera'; carrera: CarreraPasada; dias: number }
  /** `principal` falso = no hay principal y se enseña la más próxima (con su salida: hacerla principal). */
  | { tipo: 'objetivo'; carrera: ProximaCarrera; principal: boolean }
  | { tipo: 'ultima'; carrera: CarreraPasada }
  | { tipo: 'vacio' };

export type TipoSujeto = Sujeto['tipo'];

// ── Ordenar y elegir ──────────────────────────────────────────────────────────

/**
 * La más próxima primero; sin fecha, al final; a igual día manda el principal y
 * después el nombre (un orden total, así que dos carreras el mismo día no se
 * intercambian entre pintadas). No se fía del orden del cable.
 */
export function ordenarProximas(lista: readonly ProximaCarrera[]): ProximaCarrera[] {
  return [...lista].sort((a, b) => {
    const fa = a.fecha ?? '9999-12-31';
    const fb = b.fecha ?? '9999-12-31';
    if (fa !== fb) return fa < fb ? -1 : 1;
    if (esPrincipal(a) !== esPrincipal(b)) return esPrincipal(a) ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es') || a.raceId - b.raceId;
  });
}

/** El objetivo principal: el primero (el más próximo) cuya prioridad es `target`. */
export function principalDe(lista: readonly ProximaCarrera[]): ProximaCarrera | null {
  return ordenarProximas(lista).find(esPrincipal) ?? null;
}

const porFechaDesc = (a: CarreraPasada, b: CarreraPasada) => {
  const fa = a.fecha ?? '0000-01-01';
  const fb = b.fecha ?? '0000-01-01';
  return fa === fb ? b.raceId - a.raceId : fa < fb ? 1 : -1;
};

/** Pasadas, la más reciente primero (sin fecha, al fondo). */
export const ordenarPasadas = (lista: readonly CarreraPasada[]): CarreraPasada[] => [...lista].sort(porFechaDesc);

/** La carrera más reciente con resultado, sea del formato que sea. */
export function ultimaConResultado(pasadas: readonly CarreraPasada[]): CarreraPasada | null {
  return ordenarPasadas(pasadas).find((p) => p.resultadoS != null) ?? null;
}

/** La carrera corrida hace poco cuyo resultado aún no está importado, si la hay. */
export function pendienteReciente(l: Pick<LecturaCarreras, 'hoy' | 'pasadas'>, plazo = DIAS_POSTCARRERA): { carrera: CarreraPasada; dias: number } | null {
  let mejor: { carrera: CarreraPasada; dias: number } | null = null;
  for (const p of l.pasadas) {
    if (p.resultadoS != null || p.fecha == null) continue;
    const dias = diasEntre(p.fecha, l.hoy);
    if (dias < 0 || dias > plazo) continue;
    if (!mejor || dias < mejor.dias) mejor = { carrera: p, dias };
  }
  return mejor;
}

// ── El sujeto ─────────────────────────────────────────────────────────────────

export function sujeto(l: LecturaCarreras, plazo = DIAS_POSTCARRERA): Sujeto {
  if (l.carga.hub === 'fria') return { tipo: 'cargando' };
  if (l.carga.hub === 'error') return { tipo: 'error' };

  const pendiente = pendienteReciente(l, plazo);
  if (pendiente) return { tipo: 'postcarrera', ...pendiente };

  const proximas = ordenarProximas(l.proximas);
  const principal = proximas.find(esPrincipal);
  if (principal) return { tipo: 'objetivo', carrera: principal, principal: true };
  if (proximas.length > 0) return { tipo: 'objetivo', carrera: proximas[0], principal: false };

  const ultima = ultimaConResultado(l.pasadas);
  if (ultima) return { tipo: 'ultima', carrera: ultima };
  return { tipo: 'vacio' };
}

/**
 * Las próximas que NO son el sujeto, en orden. Si el sujeto es una carrera de
 * ahí, sale de la lista (no se enseña dos veces); si el sujeto es otra cosa
 * (una carrera recién corrida, la última), entran todas, el principal el primero.
 */
export function proximasRestantes(l: LecturaCarreras, s: Sujeto): ProximaCarrera[] {
  const todas = ordenarProximas(l.proximas);
  return s.tipo === 'objetivo' ? todas.filter((c) => c.raceId !== s.carrera.raceId) : todas;
}

// ── La acción del póster del objetivo ─────────────────────────────────────────

export type AccionObjetivo =
  /** Abre el detalle: predicho hoy + camino al objetivo. */
  | { tipo: 'ver-camino'; etiqueta: string }
  /** Abre la hoja del tiempo objetivo (el hueco que el atleta llena con un acto). */
  | { tipo: 'fijar-meta'; etiqueta: string }
  | { tipo: 'hacer-principal'; etiqueta: string }
  | { tipo: 'conectar-pareja'; etiqueta: string };

/**
 * UNA acción por momento (§10.5), y es la salida del hueco más importante que
 * tenga el póster, no siempre «ver el detalle»: sin tiempo objetivo la salida es
 * fijarlo; sin ser el principal, hacerlo; sin pareja, conectarla.
 */
export function accionObjetivo(s: Extract<Sujeto, { tipo: 'objetivo' }>, prediccion: Prediccion): AccionObjetivo {
  if (!s.principal) return { tipo: 'hacer-principal', etiqueta: 'Hacer objetivo principal' };
  if (prediccion.tipo === 'sin-meta' || (prediccion.tipo === 'no-aplica' && s.carrera.metaS == null)) {
    return { tipo: 'fijar-meta', etiqueta: 'Fijar tiempo objetivo' };
  }
  if (prediccion.tipo === 'no-aplica') return { tipo: 'fijar-meta', etiqueta: 'Cambiar tiempo objetivo' };
  if (prediccion.tipo === 'sin-pareja') return { tipo: 'conectar-pareja', etiqueta: 'Conecta a tu pareja' };
  return { tipo: 'ver-camino', etiqueta: 'Ver mi camino' };
}

// ── El resumen de una carrera pasada ──────────────────────────────────────────

export interface ResumenCarrera {
  totalS: number | null;
  correrS: number | null;
  /** Solo si están las ocho estaciones. */
  estacionesS: number | null;
  roxzoneS: number | null;
  puesto: string | null;
  /** Esta carrera − la individual anterior con resultado (negativo = más rápido). Solo en individual. */
  deltaAnteriorS: number | null;
}

/** La individual con resultado inmediatamente anterior a `carrera`. */
function anteriorIndividual(carrera: CarreraPasada, pasadas: readonly CarreraPasada[]): CarreraPasada | null {
  if (carrera.fecha == null) return null;
  const antes = ordenarPasadas(pasadas).filter(
    (p) => p.raceId !== carrera.raceId && p.formato === 'singles' && p.resultadoS != null && p.fecha != null && p.fecha < carrera.fecha!,
  );
  return antes[0] ?? null;
}

export function resumenDe(carrera: CarreraPasada, pasadas: readonly CarreraPasada[]): ResumenCarrera {
  const previa = carrera.formato === 'singles' ? anteriorIndividual(carrera, pasadas) : null;
  return {
    totalS: carrera.resultadoS,
    correrS: carrera.correrS,
    estacionesS: estacionesTotalS(carrera),
    roxzoneS: carrera.roxzoneS,
    puesto: puestoTexto(carrera.puesto, carrera.campo),
    deltaAnteriorS: carrera.resultadoS != null && previa?.resultadoS != null ? carrera.resultadoS - previa.resultadoS : null,
  };
}

// ── Evolución ─────────────────────────────────────────────────────────────────

export interface PuntoEvolucion {
  raceId: number;
  fecha: string;
  totalS: number;
  /** Respecto a la más lenta de la ventana (más alta = más lenta). */
  fraccion: number;
  ultimo: boolean;
}

/**
 * Los totales de las últimas individuales con resultado y fecha, de la más
 * antigua a la más reciente. Menos de dos no es una evolución: no se dibuja. Una
 * de dobles no entra (el tiempo es del equipo).
 */
export function evolucion(pasadas: readonly CarreraPasada[], n = PUNTOS_EVOLUCION): PuntoEvolucion[] | null {
  const ventana = pasadas
    .filter((p) => p.formato === 'singles' && p.resultadoS != null && p.fecha != null)
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : a.fecha! > b.fecha! ? 1 : a.raceId - b.raceId))
    .slice(-n);
  if (ventana.length < 2) return null;
  const maximo = Math.max(...ventana.map((p) => p.resultadoS!));
  return ventana.map((p, i) => ({
    raceId: p.raceId,
    fecha: p.fecha!,
    totalS: p.resultadoS!,
    fraccion: p.resultadoS! / maximo,
    ultimo: i === ventana.length - 1,
  }));
}

/** ¿No hay NI UN puesto por estación? Entonces la sección lo dice: comparar sin campo es inventar. */
export function estacionesSinPuesto(estaciones: readonly EstacionVsReferencia[]): boolean {
  return estaciones.length > 0 && estaciones.every((e) => e.fraccion == null);
}

/** ¿Hay carreras del historial y NINGUNA es individual? El análisis no puede existir y se dice por qué. */
export function soloDeEquipo(pasadas: readonly CarreraPasada[]): boolean {
  return pasadas.some((p) => p.resultadoS != null) && !pasadas.some((p) => p.resultadoS != null && p.formato === 'singles');
}

/** Las que faltan por nombre, con un máximo visible («A, B y 2 más»). */
export function listaCorta(nombres: readonly string[], max = 3): string {
  if (nombres.length <= max) {
    if (nombres.length <= 1) return nombres.join('');
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }
  return `${nombres.slice(0, max - 1).join(', ')} y ${nombres.length - (max - 1)} más`;
}

// ── Coherencia de una lectura ─────────────────────────────────────────────────

/**
 * Las invariantes que el servidor garantiza y la pantalla da por buenas. Un caso
 * que las rompa es un caso mal escrito (o un modelo mal hecho): los tests
 * recorren los veinte.
 */
export function problemasDeLectura(l: LecturaCarreras): string[] {
  const p: string[] = [];
  const raceIds = [...l.proximas.map((c) => c.raceId), ...l.pasadas.map((c) => c.raceId)];
  if (new Set(raceIds).size !== raceIds.length) p.push('raceId repetido entre próximas y pasadas');

  for (const c of l.proximas) {
    if ((c.fecha == null) !== (c.diasHasta == null)) p.push(`${c.nombre}: fecha y diasHasta deben ir juntos`);
    if (c.fecha != null) {
      if (c.fecha < l.hoy) p.push(`${c.nombre}: una próxima con fecha anterior a hoy`);
      else if (c.diasHasta !== diasEntre(l.hoy, c.fecha)) p.push(`${c.nombre}: diasHasta no cuadra con la fecha`);
    }
  }
  for (const c of l.pasadas) {
    if (c.fecha != null && c.fecha > l.hoy) p.push(`${c.nombre}: una pasada con fecha futura`);
    if (c.formato === 'singles' && c.companeros.length > 0) p.push(`${c.nombre}: individual con compañeros`);
    if (c.formato !== 'singles' && c.companeros.length === 0) p.push(`${c.nombre}: de equipo sin compañeros`);
    if (c.vueltas.length > 8) p.push(`${c.nombre}: más de 8 vueltas`);
    if (c.estaciones.some((e) => !INDICES_ESTACION.includes(e.indice as (typeof INDICES_ESTACION)[number]))) p.push(`${c.nombre}: índice de estación no canónico`);
    if (c.puesto != null && c.campo != null && c.puesto > c.campo) p.push(`${c.nombre}: puesto mayor que el campo`);
    // Las cuentas cuadran: el correr son sus vueltas y el total es correr + estaciones + RoxZone.
    const vueltas = c.vueltas.filter((v): v is number => v != null);
    if (c.correrS != null && vueltas.length === 8 && vueltas.reduce((a, b) => a + b, 0) !== c.correrS) p.push(`${c.nombre}: las vueltas no suman el correr`);
    const est = estacionesTotalS(c);
    if (c.resultadoS != null && c.correrS != null && c.roxzoneS != null && est != null && c.correrS + c.roxzoneS + est !== c.resultadoS) {
      p.push(`${c.nombre}: correr + estaciones + RoxZone no suma el total`);
    }
  }

  const principal = principalDe(l.proximas);
  if (l.carga.hub === 'lista') {
    if (!principal && l.prediccion.tipo !== 'no-aplica') p.push('sin principal, el predicho solo puede ser «no-aplica»');
    if (principal && principal.tipoEvento !== 'hyrox' && !['no-aplica', 'sin-meta'].includes(l.prediccion.tipo)) p.push('una carrera que no es HYROX no tiene predicho');
    if (l.prediccion.tipo === 'parcial') {
      if (l.prediccion.medidos >= l.prediccion.de) p.push('parcial con todos los tramos');
      if (l.prediccion.faltan.length !== l.prediccion.de - l.prediccion.medidos) p.push('parcial: faltan no cuadra con medidos');
    }
    if (l.prediccion.tipo === 'sin-meta' && principal?.metaS != null) p.push('sin-meta con meta fijada');
  }

  if (!l.conCoach) {
    if (l.noLeidosChat !== 0) p.push('sin coach no hay chat');
    if (l.analisis?.informe) p.push('sin coach no hay informe de la IA del método');
  }
  if (l.analisis) {
    const base = l.pasadas.find((c) => c.raceId === l.analisis!.deCarrera.raceId);
    if (!base) p.push('el análisis apunta a una carrera que no está en el historial');
    else if (base.formato !== 'singles' || base.resultadoS == null) p.push('el análisis solo sale de una individual con resultado');
    if (l.analisis.estaciones.length > 8) p.push('más de 8 estaciones');
    if (l.analisis.ritmoPorKm.length > 8) p.push('más de 8 kilómetros');
  }
  return p;
}
