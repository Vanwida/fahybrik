// EL CÁLCULO DE ANTES Y DESPUÉS — funciones PURAS, sin vista (el Swift las espeja).
//
//   · filasDePasos / lineaBrief: la estructura REAL del coach en líneas de dato
//     (P13: «6 × 1000 m @3:45–3:55 · r 90″ trote», nunca «N bloques»). Sale de
//     los pasos, no de un título: la misma sesión se lee igual en la esfera, en
//     el Smart Stack y en el brief.
//   · completitud: completa / parcial (con su motivo) / libre, decidida por lo
//     HECHO — la auditoría encontró `.partial` cableado en dos sitios (P0-2).
//   · costeTrasEstacion: el coste de la carrera comprometida, SOLO con pares
//     suficientes (dato del coach, 4 por defecto); si no, se dice por qué no.
//   · paginar: reparte filas de alto conocido en páginas de la corona sin que
//     ninguna se salga del reloj.
//
// Lo que es MÉTODO (cuántos pares pide el coach, desde qué fracción una serie
// cortada cuenta como hecha) va en `MetodoResumen`, dato con defecto.

import {
  NOMBRE_CLASE_DEFECTO,
  type FilaEstructura,
  duracionEstimada,
  fmtDuracion,
  fmtObjetivo,
  fmtPrescrito,
  num,
  principal,
  type Objetivo,
  type PasoBase,
  type Vuelta,
  type ZonasCoach,
} from '../../kit-reloj';

// ---------------------------------------------------------------------------
// Método del coach (HARD RULE Nº0) — dato con defecto
// ---------------------------------------------------------------------------

export interface MetodoResumen {
  /** Pares (km tras estación ↔ km fresco a la misma banda) que hacen falta para dar el coste. */
  paresMinimos: number;
  /** Fracción de lo prescrito a partir de la cual una serie cortada a mano cuenta como hecha. */
  umbralHecho: number;
}

export const METODO_RESUMEN_DEFECTO: MetodoResumen = { paresMinimos: 4, umbralHecho: 0.9 };

// ---------------------------------------------------------------------------
// El resultado de una sesión — lo que la muñeca sella al guardar
// ---------------------------------------------------------------------------

/**
 * El estado de guardado, con el mismo lenguaje que el móvil (DECISIONS
 * 25-09, acuses del reloj): el sobre sigue en el reloj hasta que el móvil
 * acusa `held` (en su cola, sin cobertura), `saved` (el servidor dijo 2xx) o
 * `rejected` (4xx: «Guardado en tu móvil»). Nunca «Guardado en el iPhone»
 * mientras solo esté en cola.
 */
export type EstadoGuardado = 'en-reloj' | 'en-cola' | 'guardado' | 'en-movil';

/** Una serie o tramo de carrera cerrado, con el paso al que pertenece. */
export interface SerieHecha extends Vuelta {
  pasoId: string;
}

/** Un km de la vuelta automática, con su desnivel (+ sube, − baja). */
export interface KmHecho extends Vuelta {
  /** `null` = sin barómetro en esa vuelta (no se inventa un cero). */
  desnivel: number | null;
}

/** Una serie de fuerza tal como quedó: lo prescrito por defecto no cuenta como declarado hasta confirmarlo (P11). */
export interface SerieFuerza {
  reps: number | null;
  /** kg por implemento: 2 mancuernas de 20 → kg 20, implementos 2. */
  kg: number | null;
  implementos?: number;
  rir: number | null;
  confirmada: boolean;
  /** Series por tiempo (el trineo): lo que tardó. */
  segundos?: number;
}

export interface EjercicioHecho {
  /** El paso prescrito (el de la primera serie): nombre, slot, dosis, objetivos, carga. */
  paso: PasoBase;
  series: SerieFuerza[];
}

/** Un tramo del circuito: cada carrera y cada estación es su propia vuelta (P10). */
export interface TramoHecho {
  paso: PasoBase;
  ronda: number;
  segundos: number;
  metros: number | null;
  /** La estación que acaba de hacer antes de esta carrera; `null` = llega fresco. */
  tras: string | null;
}

export interface Resultado {
  pasos: PasoBase[];
  zonas: ZonasCoach;
  /** El último paso al que llegó. */
  i: number;
  /** Final natural (el motor cerró el último paso) o el atleta terminó antes. */
  final: 'natural' | 'atleta';
  t: number;
  metros: number | null;
  ppmMedio: number | null;
  ppmMax: number | null;
  desnivel: number | null;
  /** Segundos en cada zona del coach, de Z1 a ZN. */
  zonasS: number[];
  series: SerieHecha[];
  km: KmHecho[];
  fuerza: EjercicioHecho[];
  circuito: TramoHecho[];
  /** Total de Roxzone; `null` = el coach no la activó en esta sesión. */
  roxzoneS: number | null;
  rpe: number | null;
  guardado: EstadoGuardado;
  /** Enfriamiento libre grabado tras «Seguir», en s. */
  libreS: number;
}

// ---------------------------------------------------------------------------
// Completitud — la decide lo hecho, nunca la pantalla
// ---------------------------------------------------------------------------

export interface Completitud {
  estado: 'completa' | 'parcial' | 'libre';
  /** «6 de 6 series», «5 de 5 rondas», «22 de 22 series»: la cuenta del bloque que manda. */
  cuenta: string | null;
  /** Por qué es parcial: «Terminaste en la serie 5 de 6», «La serie 3 se cortó en 620 m». */
  motivo: string | null;
}

const ARTICULO: Record<string, string> = { serie: 'la', tramo: 'el', stride: 'el', cuesta: 'la', ronda: 'la', estación: 'la' };

function nombrePosicion(p: PasoBase): { nombre: string; n: number; de: number } | null {
  const pos = p.posicion;
  if (pos?.ronda) return { nombre: 'ronda', n: pos.ronda.n, de: pos.ronda.de };
  const c = pos?.serie ?? pos?.tramo;
  if (!c) return null;
  const nombre = pos?.tramo ? 'tramo' : p.clase === 'fuerza' || p.clase === 'estacion' ? 'serie' : NOMBRE_CLASE_DEFECTO[p.clase].toLowerCase();
  return { nombre, n: c.n, de: c.de };
}

function conArticulo(nombre: string): string {
  return `${ARTICULO[nombre] ?? 'el'} ${nombre}`;
}

type Estado = 'hecho' | 'cortado' | 'sin-llegar';

function estadoPaso(r: Resultado, j: number, metodo: MetodoResumen): { estado: Estado; serie?: SerieHecha } {
  const p = r.pasos[j]!;
  if (j > r.i) return { estado: 'sin-llegar' };
  if (j === r.i && r.final === 'atleta') return { estado: 'sin-llegar' };
  const serie = r.series.find((s) => s.pasoId === p.id);
  const pr = p.medida.prescrito;
  if (serie && pr != null && pr > 0) {
    const hecho = p.medida.tipo === 'distancia' ? serie.metros : p.medida.tipo === 'tiempo' ? serie.segundos : null;
    if (hecho != null && hecho < pr * metodo.umbralHecho) return { estado: 'cortado', serie };
  }
  return { estado: 'hecho', serie };
}

/**
 * ¿Completa? Toda pieza de trabajo de la parte principal hecha (una serie
 * cortada a mano cuenta si llega al umbral del coach). Sin nada prescrito que
 * cumplir (correr libre), no es ni completa ni parcial: es libre.
 */
export function completitud(r: Resultado, metodo: MetodoResumen = METODO_RESUMEN_DEFECTO): Completitud {
  const principales = r.pasos
    .map((p, j) => ({ p, j }))
    .filter((x) => x.p.rol === 'trabajo' && x.p.fase === 'principal' && x.p.medida.tipo !== 'abierta');
  if (principales.length === 0) return { estado: 'libre', cuenta: null, motivo: null };

  const estados = principales.map((x) => ({ ...x, ...estadoPaso(r, x.j, metodo) }));
  const primero = estados.find((e) => e.estado !== 'hecho');

  // La cuenta: por rondas si el circuito las tiene; si no, las series del
  // bloque donde se rompió (o del primero con series, si todo va bien).
  let cuenta: string | null = null;
  const conRonda = estados.filter((e) => e.p.posicion?.ronda);
  if (conRonda.length > 0) {
    const rondas = new Map<number, boolean>();
    conRonda.forEach((e) => rondas.set(e.p.posicion!.ronda!.n, (rondas.get(e.p.posicion!.ronda!.n) ?? true) && e.estado === 'hecho'));
    const hechas = [...rondas.values()].filter(Boolean).length;
    cuenta = `${hechas} de ${rondas.size} rondas`;
  } else {
    // Una sesión de fuerza cuenta todas sus series; una de correr, las del
    // bloque donde se rompió (o el primero con series): «4 de 6 series».
    const fuerza = estados.every((e) => e.p.clase === 'fuerza' || e.p.clase === 'estacion');
    const bloque = (primero ?? estados.find((e) => nombrePosicion(e.p)))?.p.bloque;
    const del = estados.filter((e) => nombrePosicion(e.p) && (fuerza || e.p.bloque === bloque));
    if (del.length > 0) cuenta = `${del.filter((e) => e.estado === 'hecho').length} de ${del.length} series`;
  }

  if (!primero) return { estado: 'completa', cuenta, motivo: null };

  const pos = nombrePosicion(primero.p);
  const quien = pos ? `${conArticulo(pos.nombre)} ${pos.n} de ${pos.de}` : null;
  let motivo: string;
  if (primero.estado === 'cortado' && primero.serie) {
    const s = primero.serie;
    const hasta = primero.p.medida.tipo === 'distancia' && s.metros != null ? `en ${s.metros} m` : `a los ${fmtDuracion(s.segundos)}`;
    motivo = `${quien ? mayus(quien) : 'Un paso'} se cortó ${hasta}`;
  } else {
    motivo = quien ? `Terminaste en ${quien}` : `Terminaste en ${NOMBRE_CLASE_DEFECTO[primero.p.clase].toLowerCase()}`;
  }
  return { estado: 'parcial', cuenta, motivo };
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// La carrera comprometida — el coste, solo con pares suficientes
// ---------------------------------------------------------------------------

export type Coste =
  | { estado: 'hay'; seg: number; fresco: number; tras: number; pares: number }
  | { estado: 'faltan'; pares: number; minimo: number }
  | { estado: 'sin-fresco'; pares: number };

const ritmoDe = (t: TramoHecho) => (t.metros ? t.segundos / (t.metros / 1000) : null);
const mismaBanda = (a: Objetivo | null, b: Objetivo | null) =>
  !!a && !!b && a.eje === b.eje && a.min === b.min && a.max === b.max;

/**
 * «Tus km tras estación: +14 s/km sobre tu fresco.» Un par = un tramo de
 * carrera justo tras una estación y un tramo fresco a la MISMA banda del coach.
 * El cálculo sigue sin validar (Alex, 25-09): por eso va al resumen y no al
 * vivo, y por eso no se da con menos pares de los que pide el coach.
 */
export function costeTrasEstacion(tramos: TramoHecho[], metodo: MetodoResumen = METODO_RESUMEN_DEFECTO): Coste {
  const carreras = tramos.filter((t) => t.paso.clase === 'carrera' && ritmoDe(t) != null);
  const frescos = carreras.filter((t) => t.tras == null);
  const tras = carreras.filter((t) => t.tras != null && frescos.some((f) => mismaBanda(principal(f.paso), principal(t.paso))));
  const pares = tras.length;
  if (frescos.length === 0) return { estado: 'sin-fresco', pares: carreras.filter((t) => t.tras != null).length };
  if (pares < metodo.paresMinimos) return { estado: 'faltan', pares, minimo: metodo.paresMinimos };
  const media = (xs: TramoHecho[]) => xs.reduce((a, t) => a + ritmoDe(t)!, 0) / xs.length;
  const fresco = media(frescos);
  const comprometido = media(tras);
  return { estado: 'hay', seg: Math.round(comprometido - fresco), fresco, tras: comprometido, pares };
}

// ---------------------------------------------------------------------------
// Fuerza
// ---------------------------------------------------------------------------

/** kg por serie contando implementos (2 × 20 kg = 40). */
export function kgSerie(e: EjercicioHecho, s: SerieFuerza): number | null {
  return s.kg == null ? null : s.kg * (s.implementos ?? e.paso.carga?.implementos ?? 1);
}

/** Volumen de un ejercicio: Σ reps × kg (lo que no lleva carga no suma; el trineo, tampoco: es por metros). */
export function volumen(e: EjercicioHecho): number {
  if (e.paso.medida.tipo !== 'reps') return 0;
  return e.series.reduce((a, s) => a + (s.reps ?? 0) * (kgSerie(e, s) ?? 0), 0);
}

/** La serie más pesada: la de más kg; a igual kg, la de más reps. */
export function masPesada(e: EjercicioHecho): SerieFuerza | null {
  return e.series.reduce<SerieFuerza | null>((m, s) => {
    if (s.kg == null) return m;
    if (!m || s.kg > (m.kg ?? 0) || (s.kg === m.kg && (s.reps ?? 0) > (m.reps ?? 0))) return s;
    return m;
  }, null);
}

/** «9 872» — miles con espacio fino, como en el móvil. */
export function miles(n: number): string {
  return Math.round(n).toLocaleString('es-ES').replace(/\./g, ' ');
}

// ---------------------------------------------------------------------------
// La estructura en líneas de dato (brief, esfera, Smart Stack)
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

function objetivoCorto(o: Objetivo | null): string | null {
  if (!o) return null;
  if (o.eje === 'inclinacion') return `al ${fmtObjetivo(o)}`;
  return o.eje === 'rpe' ? `RPE ${num(o.min ?? o.max ?? 0)}` : fmtObjetivo(o);
}

/** El segundo objetivo (M1): la inclinación de la cinta, un techo de pulso. */
function segundoObjetivo(p: PasoBase): string | null {
  return objetivoCorto(p.objetivos.find((o) => o.papel !== 'principal' && o.eje !== 'kg') ?? null);
}

/** «r 2′ trote Z2»: la recuperación con su modo (M2) y su objetivo, si lo tiene. */
function recuperacion(e: PasoBase | null): string | null {
  if (e?.medida.prescrito == null) return null;
  const modo = e.rol === 'recuperacion' ? ` ${MODO[e.modoRecupera ?? 'trote']}` : '';
  const obj = objetivoCorto(principal(e));
  return `r ${fmtDuracion(e.medida.prescrito)}${modo}${obj ? ` ${obj}` : ''}`;
}

/** La carga que se pone en la barra: kg del implemento o el rango resuelto (M7); si no, el RIR. */
function cargaCorta(p: PasoBase): string | null {
  if (p.carga) return `${p.carga.implementos ? `${p.carga.implementos} × ` : ''}${num(p.carga.kg)}\u00A0kg`;
  const kg = p.objetivos.find((o) => o.eje === 'kg');
  if (kg) return fmtObjetivo(kg);
  const rir = p.objetivos.find((o) => o.eje === 'rir' || o.eje === 'rpe');
  return rir ? objetivoCorto(rir) : null;
}

export function lineaBrief(g: Grupo): LineaBrief {
  const p = g.paso;
  const o = principal(p);
  const cue = p.cue ?? null;
  const principalFase = p.fase === 'principal';
  const obj = objetivoCorto(o);
  if (g.veces === 1) {
    const nombre = p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase];
    return { linea: `${nombre} ${fmtPrescrito(p.medida)}${obj ? ` · ${obj}` : ''}`, detalle: segundoObjetivo(p), cue, principal: principalFase };
  }
  if (p.nombre) {
    const quien = p.posicion?.slot ? `${p.posicion.slot} ${p.nombre}` : p.nombre;
    const r = g.entre?.medida.prescrito != null ? `r ${fmtDuracion(g.entre.medida.prescrito)}` : null;
    const detalle = [`${g.veces} × ${dosis(p)}`, cargaCorta(p), r].filter(Boolean).join(' · ');
    return { linea: quien, detalle, cue, principal: principalFase };
  }
  const serie = `${fmtPrescrito(p.medida)}${obj ? ` @${obj}` : ''}`;
  const t = g.tandas;
  const entreTandas = t?.descanso?.medida.prescrito != null ? `${fmtDuracion(t.descanso.medida.prescrito)}${objetivoCorto(principal(t.descanso)) ? ` ${objetivoCorto(principal(t.descanso))}` : ''} entre tandas` : null;
  return {
    linea: t ? `${t.veces} × (${t.porTanda} × ${serie})` : `${g.veces} × ${serie}`,
    detalle: [segundoObjetivo(p), recuperacion(g.entre), entreTandas].filter(Boolean).join(' · ') || null,
    cue,
    principal: principalFase,
  };
}

/** El grupo que da nombre a la sesión: el primero de la parte principal con repeticiones; si no, el primero principal. */
export function grupoPrincipal(grupos: Grupo[]): Grupo {
  return grupos.find((g) => g.paso.fase === 'principal' && g.veces > 1) ?? grupos.find((g) => g.paso.fase === 'principal') ?? grupos[0]!;
}

/**
 * Lo de hoy en dos líneas, para la complicación y el Smart Stack: el bloque
 * que da nombre a la sesión («6 × 1000 m») y contra qué («@3:45–3:55 · r 90″»).
 */
export function hoyDe(pasos: PasoBase[]): { titulo: string; sub: string | null; dur: string } {
  const g = grupoPrincipal(filasDePasos(pasos));
  const p = g.paso;
  const obj = objetivoCorto(principal(p));
  const r = g.entre?.medida.prescrito != null ? `r ${fmtDuracion(g.entre.medida.prescrito)}` : null;
  const veces = g.tandas ? `${g.tandas.veces} × (${g.tandas.porTanda} × ${fmtPrescrito(p.medida)})` : null;
  const titulo = veces ?? (g.veces > 1 ? `${g.veces} × ${p.nombre ? `${dosis(p)} ${p.nombre}` : fmtPrescrito(p.medida)}` : `${p.nombre ?? NOMBRE_CLASE_DEFECTO[p.clase]} ${fmtPrescrito(p.medida)}`);
  const sub = [obj ? `@${obj}` : null, r].filter(Boolean).join(' · ');
  return { titulo, sub: sub || null, dur: duracionHumana(pasos) };
}

/** Duración estimada, como la diría un corredor: al minuto hasta media hora; de 5 en 5 por encima. */
export function duracionHumana(pasos: PasoBase[]): string {
  const min = pasos.reduce((a, p) => a + duracionEstimada(p), 0) / 60;
  const m = min >= 30 ? Math.round(min / 5) * 5 : Math.max(1, Math.round(min));
  return `${m}′`;
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
