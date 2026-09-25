// LA ESTRUCTURA EN LÍNEAS DE DATO — funciones PURAS (P13; el Swift las espeja).
//
// La estructura REAL del coach sale de los pasos, no de un título: «6 × 1000 m
// a 3:45–3:55 · r 90″ trote», nunca «N bloques». La misma sesión se lee igual
// en la esfera, en el Smart Stack, en el brief y en la página Estructura del
// vivo: los cuatro tiran de `filasDePasos`, y el objetivo se escribe siempre
// con `textoObjetivo` (reglas.ts), la única notación.
//
//   filasDePasos  los pasos planos, agrupados como los escribió el coach.
//   estructuraDe  las filas de la página Estructura desde esos grupos.
//   lineaBrief    un grupo en líneas de dato (el brief).
//   hoyDe         lo de hoy en dos líneas (complicación y Smart Stack).
//   duracionEstimada / duracionHumana  cuánto dura, para el aro y para «Hoy · 55′».
//   paginar       reparte filas de alto conocido en páginas de la corona.

import {
  NOMBRE_CLASE_DEFECTO,
  type FilaEstructura,
  type PasoBase,
} from './paso';
import { fmtDuracion, fmtObjetivo, fmtPrescrito, num, principal, textoObjetivo } from './reglas';

// ---------------------------------------------------------------------------
// Cuánto dura un paso (solo para dibujar y para «Hoy · 55′»)
// ---------------------------------------------------------------------------

/** Ritmo neutro para repartir el perímetro cuando un paso de correr no trae ritmo. Solo dibuja. */
const RITMO_DIBUJO_S_KM = 300;
/** /500 neutro de un ergómetro sin objetivo de /500. Solo dibuja. */
const SPLIT_DIBUJO_S = 120;
/** Lo que se dibuja de un paso que nadie cronometra ni mide a ritmo (reps, un trineo). */
const PASO_NEUTRO_S = 60;

/**
 * Cuánto dura un paso, estimado, para darle su parte del perímetro. Un paso
 * por metros solo se estima a ritmo de carrera si SE CORRE (GPS o cinta): un
 * trineo de 50 m a 5:00/km se dibujaría de 15 s. Un ergómetro, a su /500.
 */
export function duracionEstimada(p: PasoBase): number {
  const pr = p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return pr;
  if (p.medida.tipo !== 'distancia') return PASO_NEUTRO_S;
  const o = principal(p);
  if (p.medida.mide === 'gps' || p.medida.mide === 'cinta') {
    const ritmo = o?.eje === 'ritmo' && o.min != null && o.max != null ? (o.min + o.max) / 2 : RITMO_DIBUJO_S_KM;
    return (pr / 1000) * ritmo;
  }
  if (p.medida.mide === 'ergo') {
    const split = o?.eje === 'split500' && o.min != null && o.max != null ? (o.min + o.max) / 2 : SPLIT_DIBUJO_S;
    return (pr / 500) * split;
  }
  return PASO_NEUTRO_S;
}

/** Duración estimada, como la diría un corredor: al minuto hasta media hora; de 5 en 5 por encima. */
export function duracionHumana(pasos: PasoBase[]): string {
  const min = pasos.reduce((a, p) => a + duracionEstimada(p), 0) / 60;
  const m = min >= 30 ? Math.round(min / 5) * 5 : Math.max(1, Math.round(min));
  return `${m}′`;
}

// ---------------------------------------------------------------------------
// Los grupos
// ---------------------------------------------------------------------------

/** Un grupo de la estructura: N veces el mismo paso, con lo que se hace entre medias. */
export interface Grupo {
  paso: PasoBase;
  /** Cuántas veces sale el paso en toda la sesión. */
  veces: number;
  /** Lo que se hace entre repetición y repetición (recuperación o descanso). */
  entre: PasoBase | null;
  /** Series anidadas (M4): N tandas de `porTanda`, con su descanso entre tandas. Sin aplanar. */
  tandas: { veces: number; porTanda: number; descanso: PasoBase | null } | null;
  /** Índices del primer y del último paso del grupo (con su recuperación), para saber dónde estás. */
  desde: number;
  hasta: number;
}

const clave = (p: PasoBase) =>
  [p.posicion?.tanda ? 'tandas' : p.bloque, p.posicion?.slot, p.nombre ?? p.clase, p.medida.tipo, p.medida.prescrito, JSON.stringify(p.objetivos), p.carga?.kg].join('|');

/**
 * Los pasos planos, agrupados como los escribió el coach: «6 × 800 m / r 2′30″»,
 * «2 × (4 × 2′ / 2′) / 5′ entre tandas», la superserie A1/A2 con su descanso
 * tras la A2. El orden es el de aparición.
 */
export function filasDePasos(pasos: PasoBase[]): Grupo[] {
  const grupos: Grupo[] = [];
  const porClave = new Map<string, Grupo>();
  let ultimo: Grupo | null = null;
  pasos.forEach((p, j) => {
    if (p.rol !== 'trabajo') {
      // El descanso entre tandas es del grupo que acaba de terminar la tanda.
      if (p.clase === 'descanso-tandas' && ultimo?.tandas) {
        ultimo.tandas.descanso ??= p;
        ultimo.hasta = Math.max(ultimo.hasta, j);
      }
      return;
    }
    const k = clave(p);
    const sig = pasos[j + 1];
    const entre = sig && sig.rol !== 'trabajo' && sig.clase !== 'descanso-tandas' ? sig : null;
    const hasta = sig && sig.rol !== 'trabajo' ? j + 1 : j;
    const g = porClave.get(k);
    if (g) {
      g.veces += 1;
      g.hasta = Math.max(g.hasta, hasta);
      if (!g.entre && entre && p.fase === 'principal') g.entre = entre;
      ultimo = g;
      return;
    }
    const t = p.posicion?.tanda;
    const nuevo: Grupo = {
      paso: p,
      veces: 1,
      entre: p.fase === 'principal' ? entre : null,
      tandas: t ? { veces: t.de, porTanda: p.posicion?.serie?.de ?? 1, descanso: null } : null,
      desde: j,
      hasta,
    };
    porClave.set(k, nuevo);
    grupos.push(nuevo);
    ultimo = nuevo;
  });
  return grupos;
}

/** Las filas de la página Estructura del vivo, desde los mismos grupos que el brief. */
export function estructuraDe(pasos: PasoBase[]): (i: number) => FilaEstructura[] {
  const grupos = filasDePasos(pasos);
  return (i) =>
    grupos.map((g) => ({
      fase: g.paso.fase,
      veces: g.tandas ? g.tandas.porTanda : g.veces > 1 ? g.veces : undefined,
      trabajo: g.paso,
      recupera: g.veces > 1 && g.entre ? g.entre : undefined,
      tandas: g.tandas?.descanso ? { veces: g.tandas.veces, descanso: g.tandas.descanso } : undefined,
      estado: i > g.hasta ? 'hecho' : i >= g.desde ? 'ahora' : 'pendiente',
    }));
}

/** El grupo que da nombre a la sesión: el primero de la parte principal con repeticiones; si no, el primero principal. */
export function grupoPrincipal(grupos: Grupo[]): Grupo {
  return grupos.find((g) => g.paso.fase === 'principal' && g.veces > 1) ?? grupos.find((g) => g.paso.fase === 'principal') ?? grupos[0]!;
}

// ---------------------------------------------------------------------------
// El brief y lo de hoy
// ---------------------------------------------------------------------------

export interface LineaBrief {
  linea: string;
  detalle: string | null;
  cue: string | null;
  principal: boolean;
}

const MODO = { trote: 'trote', andar: 'caminando', parado: 'parado' } as const;

/** Lo prescrito sin su unidad cuando la unidad ya se sobreentiende: «4 × 8» (reps). */
function dosis(p: PasoBase): string {
  return p.medida.tipo === 'reps' ? String(p.medida.prescrito ?? '') : fmtPrescrito(p.medida);
}

/** « a Z2», « RPE 8» o nada: el objetivo detrás de lo prescrito. */
const conObjetivo = (o: ReturnType<typeof principal>) => (o ? ` ${textoObjetivo(o)}` : '');

/** El segundo objetivo (M1): la inclinación de la cinta, un techo de pulso. */
function segundoObjetivo(p: PasoBase): string | null {
  const o = p.objetivos.find((x) => x.papel !== 'principal' && x.eje !== 'kg');
  return o ? textoObjetivo(o) : null;
}

/** «r 2′ trote a Z2»: la recuperación con su modo (M2) y su objetivo, si lo tiene. */
function recuperacion(e: PasoBase | null): string | null {
  if (e?.medida.prescrito == null) return null;
  const modo = e.rol === 'recuperacion' ? ` ${MODO[e.modoRecupera ?? 'trote']}` : '';
  return `r ${fmtDuracion(e.medida.prescrito)}${modo}${conObjetivo(principal(e))}`;
}

/** La carga que se pone en la barra: kg del implemento o el rango resuelto (M7); si no, el esfuerzo. */
function cargaCorta(p: PasoBase): string | null {
  if (p.carga) return `${p.carga.implementos ? `${p.carga.implementos} × ` : ''}${num(p.carga.kg)} kg`;
  const kg = p.objetivos.find((o) => o.eje === 'kg');
  if (kg) return fmtObjetivo(kg);
  const esfuerzo = p.objetivos.find((o) => o.eje === 'rir' || o.eje === 'rpe');
  return esfuerzo ? textoObjetivo(esfuerzo) : null;
}

export function lineaBrief(g: Grupo): LineaBrief {
  const p = g.paso;
  const o = principal(p);
  const cue = p.cue ?? null;
  const principalFase = p.fase === 'principal';
  if (g.veces === 1) {
    const nombre = p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase];
    return { linea: `${nombre} ${fmtPrescrito(p.medida)}${conObjetivo(o)}`, detalle: segundoObjetivo(p), cue, principal: principalFase };
  }
  if (p.nombre) {
    const quien = p.posicion?.slot ? `${p.posicion.slot} ${p.nombre}` : p.nombre;
    const r = g.entre?.medida.prescrito != null ? `r ${fmtDuracion(g.entre.medida.prescrito)}` : null;
    const detalle = [`${g.veces} × ${dosis(p)}`, cargaCorta(p), r].filter(Boolean).join(' · ');
    return { linea: quien, detalle, cue, principal: principalFase };
  }
  const serie = `${fmtPrescrito(p.medida)}${conObjetivo(o)}`;
  const t = g.tandas;
  const d = t?.descanso;
  const entreTandas = d?.medida.prescrito != null ? `${fmtDuracion(d.medida.prescrito)}${conObjetivo(principal(d))} entre tandas` : null;
  return {
    linea: t ? `${t.veces} × (${t.porTanda} × ${serie})` : `${g.veces} × ${serie}`,
    detalle: [segundoObjetivo(p), recuperacion(g.entre), entreTandas].filter(Boolean).join(' · ') || null,
    cue,
    principal: principalFase,
  };
}

/**
 * Lo de hoy en dos líneas, para la complicación y el Smart Stack: el bloque
 * que da nombre a la sesión («6 × 1000 m») y contra qué («a 3:45–3:55 · r 90″»).
 */
export function hoyDe(pasos: PasoBase[]): { titulo: string; sub: string | null; dur: string } {
  const g = grupoPrincipal(filasDePasos(pasos));
  const p = g.paso;
  const o = principal(p);
  const r = g.entre?.medida.prescrito != null ? `r ${fmtDuracion(g.entre.medida.prescrito)}` : null;
  const veces = g.tandas ? `${g.tandas.veces} × (${g.tandas.porTanda} × ${fmtPrescrito(p.medida)})` : null;
  const titulo = veces ?? (g.veces > 1 ? `${g.veces} × ${p.nombre ? `${dosis(p)} ${p.nombre}` : fmtPrescrito(p.medida)}` : `${p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase]} ${fmtPrescrito(p.medida)}`);
  const sub = [o ? textoObjetivo(o) : null, r].filter(Boolean).join(' · ');
  return { titulo, sub: sub || null, dur: duracionHumana(pasos) };
}

// ---------------------------------------------------------------------------
// Paginar para la corona
// ---------------------------------------------------------------------------

/** Reparte filas de alto conocido en páginas de `alto` pt (con `hueco` entre filas). Ninguna fila se parte. */
export function paginar(altos: number[], alto: number, hueco: number): number[][] {
  const paginas: number[][] = [[]];
  let usado = 0;
  altos.forEach((h, i) => {
    const actual = paginas[paginas.length - 1]!;
    const extra = actual.length > 0 ? hueco + h : h;
    if (actual.length > 0 && usado + extra > alto) {
      paginas.push([i]);
      usado = h;
    } else {
      actual.push(i);
      usado += extra;
    }
  });
  return paginas;
}
