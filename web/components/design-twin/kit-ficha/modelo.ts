// Lo que la ficha DECIDE antes de pintar — funciones puras sobre `LecturaFicha`.
// Las dos propuestas las comparten: así «cuánto dura», «qué lleva el bloque» o
// «cuál es la dosis» no se escribe dos veces ni de dos maneras (CONTRATO-UI §2).

import { SIGNO_POR } from '../datos-reales';
import { fichaDe } from '../screens/sesion-previa/data';
import type { Bloque, LecturaFicha, Movimiento, PerfilTramos, SerieEscrita } from './contrato';

// ---------------------------------------------------------------------------
// La cabecera
// ---------------------------------------------------------------------------

/** Los bloques que se cuentan en la cabecera: el calentamiento y la vuelta a la calma no son «bloques de trabajo». */
export function bloquesDeTrabajo(l: LecturaFicha): Bloque[] {
  return l.bloques.filter((b) => b.rol === 'principal');
}

export interface MetaDeSesion {
  /** «55» + «min» cuando el coach la escribió. */
  minutos: number | null;
  /** Por qué no hay número. Solo cuando no hay `minutos`. */
  sinDuracion: string | null;
  bloquesDeTrabajo: number;
}

export function metaDeSesion(l: LecturaFicha): MetaDeSesion {
  return {
    minutos: l.minutos ?? null,
    sinDuracion: l.minutos === undefined ? (l.sinDuracion ?? null) : null,
    bloquesDeTrabajo: bloquesDeTrabajo(l).length,
  };
}

/** Una sesión con un solo bloque no tiene «estructura» que enseñar: se lee directa. */
export function esDeUnaPieza(l: LecturaFicha): boolean {
  return l.bloques.length <= 1;
}

// ---------------------------------------------------------------------------
// El bloque
// ---------------------------------------------------------------------------

/** El formato del bloque dicho como se dice en el box. `null` = el título basta. */
export function etiquetaFormato(b: Bloque): string | null {
  const f = b.formato;
  switch (f.tipo) {
    case 'superserie':
      return `Superserie · ${f.rondas} ${f.rondas === 1 ? 'ronda' : 'rondas'}`;
    case 'emom':
      return `EMOM · ${f.minutos} min${f.alterna ? ' · alterna' : ''}`;
    case 'amrap':
      return `AMRAP · ${f.minutos} min`;
    case 'fortime': {
      const partes = ['For Time'];
      if (f.rondas) partes.push(`${f.rondas} rondas`);
      if (f.topeMin) partes.push(`tope ${f.topeMin} min`);
      return partes.join(' · ');
    }
    case 'estaciones':
      return `For Time · ${b.movimientos.length} estaciones`;
    case 'series':
    case 'intervalos':
    case 'continuo':
    case 'marco':
      return null;
  }
}

/** Qué significa el formato, para quien no lo conoce: una frase, la misma siempre. `null` = no hace falta. */
export function explicacionDeFormato(b: Bloque): string | null {
  const f = b.formato;
  switch (f.tipo) {
    case 'emom':
      return f.alterna
        ? 'Cada minuto toca una cosa distinta. Lo que sobra del minuto es descanso.'
        : 'Al empezar cada minuto, haz lo que toca. Lo que sobra del minuto es descanso.';
    case 'amrap':
      return 'Repite la lista tantas veces como puedas, hasta que acabe el tiempo.';
    case 'fortime':
      return f.rondas ? 'Haz todas las rondas lo más rápido que puedas.' : 'Hazlo lo más rápido que puedas.';
    case 'superserie':
      return 'Una detrás de otra, sin descanso entre las dos.';
    default:
      return null;
  }
}

/** Los minutos del bloque SOLO si se saben: los escritos o los que el formato dicta. */
function minutosDelBloque(b: Bloque): number | null {
  if (b.minutos !== undefined) return b.minutos;
  const f = b.formato;
  if (f.tipo === 'emom' || f.tipo === 'amrap') return f.minutos;
  return null;
}

/** «4 ejercicios» / «1 ejercicio». */
function cuantosEjercicios(n: number): string {
  return `${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`;
}

/** La línea corta de un bloque, para la ruta (B) y para el calentamiento plegado (A). */
export function resumenCorto(b: Bloque): string {
  const min = minutosDelBloque(b);
  const f = b.formato;
  if (f.tipo === 'estaciones') return `${b.movimientos.length} estaciones`;
  if (f.tipo === 'intervalos') {
    const p = b.movimientos[0]?.perfil;
    if (p) return `${p.repeticiones} ${SIGNO_POR} ${p.trabajo.medida}`;
  }
  if (f.tipo === 'continuo') {
    const d = b.movimientos[0]?.dosis;
    if (d) return d;
  }
  if (f.tipo === 'fortime') {
    return f.rondas ? `${f.rondas} rondas` : 'For Time';
  }
  if (min !== null) return `${min} min`;
  return cuantosEjercicios(b.movimientos.length);
}

/** Cuántos movimientos del bloque no traen dosis: el coach lo puede arreglar. */
export function sinDosis(b: Bloque): number {
  return b.movimientos.filter((m) => m.dosis === null && !m.perfil).length;
}

// ---------------------------------------------------------------------------
// El movimiento
// ---------------------------------------------------------------------------

/**
 * Lo que va en la columna de la derecha: la dosis y debajo contra qué (kilos, ritmo…).
 * Con un perfil de tramos el titular es «16 × 500 m».
 */
export function dosisDeMovimiento(m: Movimiento): { principal: string | null; contra: string | null } {
  if (m.perfil) {
    return {
      principal: `${m.perfil.repeticiones} ${SIGNO_POR} ${m.perfil.trabajo.medida}`,
      contra: m.perfil.trabajo.zona ? `Z${m.perfil.trabajo.zona}` : (m.perfil.trabajo.objetivo ?? null),
    };
  }
  if (m.reparto) {
    return { principal: m.reparto.tuParte, contra: `de ${m.reparto.total}` };
  }
  // Con el %RM resuelto, lo que se carga son los KILOS: el porcentaje baja a la segunda línea.
  if (m.segunTuRm) return { principal: m.dosis, contra: m.segunTuRm.kg };
  // Una rampa dice de dónde a dónde sube, no una carga que no es.
  if (tieneSeriesDistintas(m)) return { principal: m.dosis, contra: rangoDeCarga(m) ?? m.objetivo ?? null };
  return { principal: m.dosis, contra: m.zona ? `Z${m.zona}` : (m.objetivo ?? null) };
}

/** La segunda línea del nombre: lo que se hace distinto o con cuidado (tempo, descanso). */
export function lineaSecundaria(m: Movimiento): string | null {
  const partes: string[] = [];
  if (m.rol) partes.push(m.rol);
  if (m.segunTuRm && m.objetivo) partes.push(m.objetivo);
  if (m.tempo) partes.push(`tempo ${m.tempo}`);
  if (m.descanso) partes.push(`desc. ${m.descanso}`);
  // Cada parte con espacios duros: «desc. 3:00» no se parte en dos líneas por el medio.
  return partes.length > 0 ? partes.map((t) => t.replace(/ /g, '\u00A0')).join(' · ') : null;
}

/** ¿Las series difieren entre sí (rampa, pirámide)? Solo entonces se enseñan una a una. */
export function tieneSeriesDistintas(m: Movimiento): boolean {
  return (m.series?.length ?? 0) > 1;
}

export function textoSerie(s: SerieEscrita): string {
  return [s.trabajo, s.carga].filter(Boolean).join(' · ');
}

/** El rango de cargas de una rampa: «60 → 80 kg». Nulo si no hay cargas distintas que decir. */
export function rangoDeCarga(m: Movimiento): string | null {
  const kilos = (m.series ?? [])
    .map((s) => (s.carga ? Number.parseFloat(s.carga.replace(',', '.')) : Number.NaN))
    .filter((n) => Number.isFinite(n));
  if (kilos.length < 2) return null;
  const min = Math.min(...kilos);
  const max = Math.max(...kilos);
  if (min === max) return null;
  return `${String(min).replace('.', ',')} → ${String(max).replace('.', ',')} kg`;
}

// ---------------------------------------------------------------------------
// El material
// ---------------------------------------------------------------------------

/**
 * El material de un bloque, sin repetir y en el orden en que aparece. Solo se enseña el de los bloques de TRABAJO:
 * la bici y la esterilla del calentamiento están donde entrenas, y una lista con ellas esconde lo que sí hay que traer.
 */
export function materialDeBloques(bloques: Bloque[]): string[] {
  const visto = new Set<string>();
  for (const b of bloques) {
    for (const m of b.movimientos) {
      for (const cosa of m.material ?? fichaDe(m.nombre).material) visto.add(cosa);
    }
  }
  return [...visto];
}

// ---------------------------------------------------------------------------
// El perfil de tramos — lo que se dibuja de una carrera por series
// ---------------------------------------------------------------------------

export interface BarraDePerfil {
  tipo: 'trabajo' | 'recuperacion';
  /** 0–1 sobre el alto del dibujo. */
  alto: number;
  zona?: number;
}

/**
 * Una barra por tramo: el trabajo alto, la recuperación baja (y activa si se trota).
 * No es un gráfico de datos —no hay ritmos medidos antes de correr—: es la FORMA de
 * lo que el coach dictó, que es lo que un «16 × 500 m» no deja ver.
 */
export function barrasDePerfil(p: PerfilTramos): BarraDePerfil[] {
  const barras: BarraDePerfil[] = [];
  for (let i = 0; i < p.repeticiones; i++) {
    barras.push({ tipo: 'trabajo', alto: altoDeZona(p.trabajo.zona, 'trabajo'), zona: p.trabajo.zona });
    if (p.recuperacion) {
      barras.push({
        tipo: 'recuperacion',
        alto: p.recuperacion.activa ? altoDeZona(p.recuperacion.zona, 'recuperacion') : 0.14,
        zona: p.recuperacion.zona,
      });
    }
  }
  return barras;
}

function altoDeZona(zona: number | undefined, tipo: 'trabajo' | 'recuperacion'): number {
  if (zona) return 0.2 + zona * 0.16;
  return tipo === 'trabajo' ? 0.78 : 0.3;
}

/** Lo que dice un perfil de tramos como pares «etiqueta · valor»: se lee de un vistazo, no como una frase. */
export function datosDePerfil(p: PerfilTramos): Array<{ etiqueta: string; valor: string }> {
  const datos: Array<{ etiqueta: string; valor: string }> = [];
  if (p.trabajo.objetivo) datos.push({ etiqueta: 'Ritmo', valor: p.trabajo.objetivo.replace(/^@\s*/, '') });
  if (p.trabajo.zona) datos.push({ etiqueta: 'Zona', valor: `Z${p.trabajo.zona}` });
  if (p.recuperacion) {
    datos.push({
      etiqueta: p.recuperacion.activa ? 'Recuperas' : 'Descansas',
      valor: p.recuperacion.frase.replace(/^(recuperación|descanso)\s*/i, ''),
    });
  }
  return datos;
}

/** La frase del trabajo y la recuperación, en una línea: «@ 4:10/km · recuperación 1:30 trotando». */
export function fraseDePerfil(p: PerfilTramos): string {
  const partes: string[] = [];
  if (p.trabajo.objetivo) partes.push(p.trabajo.objetivo);
  if (p.recuperacion) partes.push(p.recuperacion.frase);
  return partes.join(' · ');
}
