// LAS REGLAS DEL PINTOR — funciones PURAS de (paso, lecturas) → qué se pinta.
//
// Aquí vive la decisión que la auditoría encontró repartida por las vistas:
// qué número manda (P3), contra qué banda se juzga, en qué dirección y con qué
// palabra, qué falta, qué se dice en el contexto. Una vista del kit NO decide
// nada de esto: llama a `laminaDelPaso` y pinta lo que le devuelve. Es el
// patrón de `RodajeLamina` (decisor único + proyecciones), que la auditoría
// mandó conservar, extendido a todas las familias. El Swift lo espeja función
// por función.

import {
  NOMBRE_CLASE_DEFECTO,
  type EjeObjetivo,
  type Lecturas,
  type Medida,
  type Objetivo,
  type PasoBase,
  type ReglasAviso,
  type Veredicto,
  type ZonasCoach,
} from './paso';
import { RPE_PALABRA_DEFECTO, colorZona } from './tokens';

// ---------------------------------------------------------------------------
// Formatos — un formateador por concepto, coma española
// ---------------------------------------------------------------------------

const dos = (n: number) => String(n).padStart(2, '0');

/** 14 → «0:14»; 2246 → «37:26»; 3725 → «1:02:05». */
export function fmtReloj(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${dos(m)}:${dos(sec)}` : `${m}:${dos(sec)}`;
}

/** Techo de honestidad: por encima de 20:00/km un ritmo describe un GPS fijando, no un esfuerzo. */
export const RITMO_TECHO_S = 20 * 60;

/** s/km → «3:52». Sin dato o fuera de lo creíble → «—». */
export function fmtRitmo(sKm: number | null | undefined): string {
  if (sKm == null || !Number.isFinite(sKm) || sKm <= 0 || sKm > RITMO_TECHO_S) return '—';
  return fmtReloj(sKm);
}

/** Decimal con coma: 8.5 → «8,5». */
export function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
}

/** Distancia medida: metros enteros por debajo del km, km con dos decimales encima. */
export function fmtDistancia(m: number): { valor: string; unidad: 'm' | 'km' } {
  if (m < 1000) return { valor: String(Math.max(0, Math.ceil(m))), unidad: 'm' };
  return { valor: (m / 1000).toFixed(2).replace('.', ','), unidad: 'km' };
}

/** Duración prescrita en notación de pista: «20″», «90″», «1′», «2′30″», «50′». */
export function fmtDuracion(s: number): string {
  if (s < 60 || (s <= 90 && s % 60 !== 0)) return `${s}″`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}′` : `${m}′${dos(r)}″`;
}

/** Lo prescrito de una medida, para el contexto y el «Luego»: «1000 m», «1′», «12 reps». */
export function fmtPrescrito(m: Medida): string {
  const p = m.prescrito;
  if (p == null || m.tipo === 'abierta') return '';
  switch (m.tipo) {
    case 'distancia':
      return p >= 5000 && p % 1000 === 0 ? `${p / 1000}\u00A0km` : `${p}\u00A0m`;
    case 'tiempo':
      return fmtDuracion(p);
    case 'reps':
      return `${p}\u00A0reps`;
    case 'cal':
      return `${p}\u00A0cal`;
  }
}

function rango(min: number | null, max: number | null, f: (n: number) => string): string {
  if (min != null && max != null) return min === max ? f(min) : `${f(min)}–${f(max)}`;
  if (max != null) return `máx ${f(max)}`;
  if (min != null) return `mín ${f(min)}`;
  return '';
}

/** Un objetivo en palabras cortas: «3:45–3:55», «Z2», «RPE 7», «máx 142 ppm». */
export function fmtObjetivo(o: Objetivo): string {
  switch (o.eje) {
    case 'ritmo':
      return rango(o.min, o.max, (n) => fmtRitmo(n));
    case 'split500':
      return `${rango(o.min, o.max, (n) => fmtRitmo(n))} /500`;
    case 'zona':
      if (o.papel === 'techo' && o.max != null) return `máx Z${o.max}`;
      return rango(o.min, o.max, (n) => `Z${n}`);
    case 'ppm':
      return `${rango(o.min, o.max, num)}\u00A0ppm`;
    case 'rpe':
      return `RPE ${rango(o.min, o.max, num)}`;
    case 'potencia':
      return `${rango(o.min, o.max, num)}\u00A0W`;
    case 'pctRM':
      return `${rango(o.min, o.max, num)}\u00A0%\u00A0RM`;
    case 'kg':
      return `${rango(o.min, o.max, num)}\u00A0kg`;
    case 'rir':
      return `RIR ${rango(o.min, o.max, num)}`;
    case 'cadencia':
      return `${rango(o.min, o.max, num)} pasos/min`;
    case 'inclinacion':
      return `${rango(o.min, o.max, num)}\u00A0%`;
  }
}

/**
 * EL OBJETIVO EN UNA NOTA — la única notación del objetivo detrás de lo
 * prescrito, en el brief, la esfera, el Smart Stack y la página Estructura:
 * «a 3:45–3:55», «a Z2», «RPE 7», «RIR 3», «máx 142 ppm», «al 1 %». Sin «@».
 * Cambiar la notación es cambiar esto (subjetivo de Alex, un solo sitio).
 */
export function textoObjetivo(o: Objetivo): string {
  if (o.eje === 'inclinacion') return `al ${fmtObjetivo(o)}`;
  if (o.papel === 'techo' || o.eje === 'rpe' || o.eje === 'rir' || o.eje === 'kg' || o.eje === 'pctRM') return fmtObjetivo(o);
  return `a ${fmtObjetivo(o)}`;
}

/** M7 · La carga del implemento: «180 kg», «2 × 32 kg» (el peso de CADA uno, nunca multiplicado). */
export function textoCargaImplemento(c: PasoBase['carga']): string | null {
  if (!c) return null;
  return c.implementos && c.implementos > 1 ? `${c.implementos} × ${num(c.kg)}\u00A0kg` : `${num(c.kg)}\u00A0kg`;
}

/** La palabra de un RPE: la del coach si la trae, si no la del defecto. */
export function palabraRpe(o: Objetivo): string {
  if (o.palabra) return o.palabra;
  const n = Math.round(o.max ?? o.min ?? 0);
  return RPE_PALABRA_DEFECTO[n] ?? '';
}

// ---------------------------------------------------------------------------
// El paso: objetivo principal, lo que falta, el contexto
// ---------------------------------------------------------------------------

export function principal(p: PasoBase): Objetivo | null {
  return p.objetivos.find((o) => o.papel === 'principal') ?? null;
}

export function objetivoDe(p: PasoBase, papel: Objetivo['papel']): Objetivo | null {
  return p.objetivos.find((o) => o.papel === papel) ?? null;
}

const CLASES_CORRER: ReadonlySet<PasoBase['clase']> = new Set([
  'calentamiento',
  'vuelta-calma',
  'rodaje',
  'tirada',
  'tempo',
  'series',
  'progresivo',
  'fartlek',
  'cuestas',
  'strides',
  'carrera',
  'test',
]);

/** ¿Es un paso de correr (hay un ritmo y un GPS o una cinta que importan)? */
export function esCarrera(p: PasoBase): boolean {
  return CLASES_CORRER.has(p.clase) || p.medida.mide === 'gps' || p.medida.mide === 'cinta' || p.entorno != null;
}

/** Lo que falta del paso, en la unidad de su medida. `null` = nadie lo sabe. */
export function faltaDe(p: PasoBase, l: Lecturas): number | null {
  const pr = p.medida.prescrito;
  if (pr == null || p.medida.tipo === 'abierta') return null;
  if (p.medida.tipo === 'tiempo') return Math.max(0, pr - l.t);
  if (l.hecho == null || l.viejos?.includes('hecho')) return null;
  return Math.max(0, pr - l.hecho);
}

/** «Serie 3/6 · 1000 m» → las PARTES por prioridad; `ContextoLinea` quita por el final si no cabe. */
export function contextoDe(p: PasoBase): string[] {
  const nombre = NOMBRE_CLASE_DEFECTO[p.clase];
  const o = principal(p);
  const pos = p.posicion;
  if (p.rol === 'recuperacion') {
    const modo = p.modoRecupera === 'andar' ? 'caminando' : p.modoRecupera === 'parado' ? 'parado' : 'trote';
    return ['Recupera', modo];
  }
  if (p.rol === 'descanso') return [nombre];
  const partes: string[] = [];
  if (pos?.slot && p.nombre) partes.push(`${pos.slot} · ${p.nombre}`);
  if (pos?.ronda) partes.push(`Ronda ${pos.ronda.n}/${pos.ronda.de}`);
  if (pos?.estacion) partes.push(`Estación ${pos.estacion.n}/${pos.estacion.de}`);
  if (pos?.tanda) partes.push(`Tanda ${pos.tanda.n}/${pos.tanda.de}`);
  if (pos?.serie) partes.push(`${nombre} ${pos.serie.n}/${pos.serie.de}`);
  if (pos?.tramo) {
    partes.push(nombre, `tramo ${pos.tramo.n}/${pos.tramo.de}`);
    return partes;
  }
  if (partes.length === 0) partes.push(nombre);
  // Continuo (rodaje, tirada, tempo): la zona dice de qué va; lo prescrito, detrás.
  if (!pos?.serie && o && (o.eje === 'zona' || o.eje === 'rpe')) partes.push(fmtObjetivo(o));
  const pr = fmtPrescrito(p.medida);
  if (pr) partes.push(pr);
  return partes;
}

/**
 * El paso en una línea corta, para «Luego · …» y «Viene: …»: «1000 m a
 * 3:45–3:55», «Sled Pull · 25 m · 135 kg». La carga del implemento va
 * detrás (M7): el trineo hay que cargarlo antes de empezar.
 */
export function textoPasoCorto(p: PasoBase): string {
  const o = principal(p);
  const pr = fmtPrescrito(p.medida);
  if (p.rol === 'descanso') return `${NOMBRE_CLASE_DEFECTO[p.clase]} · ${pr}`;
  const quien = p.nombre ? `${p.nombre} · ` : '';
  const carga = textoCargaImplemento(p.carga);
  const conCarga = carga ? ` · ${carga}` : '';
  if (!o) return `${quien}${pr}${conCarga}`;
  const obj = o.eje === 'rpe' ? `RPE ${num(o.min ?? o.max ?? 0)}` : fmtObjetivo(o);
  return `${quien}${pr}${conCarga} a ${obj}`;
}

// ---------------------------------------------------------------------------
// Zonas del coach
// ---------------------------------------------------------------------------

/** La zona (1..N) de un pulso con las zonas del coach. */
export function zonaDe(ppm: number, z: ZonasCoach): number {
  const i = z.techos.findIndex((t) => ppm <= t);
  return i < 0 ? z.techos.length : i + 1;
}

/** Suelo y techo en ppm de la zona k. Z1 recibe un suelo con el ancho de Z2 para poder dibujarse. */
export function limitesZona(k: number, z: ZonasCoach): [number, number] {
  const t = z.techos;
  const hi = t[k - 1]!;
  if (k > 1) return [t[k - 2]! + 1, hi];
  const ancho = t.length > 1 ? t[1]! - t[0]! : 20;
  return [hi - ancho, hi];
}

/** El rango en ppm de un objetivo de pulso (zona o ppm). */
export function rangoPpm(o: Objetivo, z: ZonasCoach | null): [number | null, number | null] {
  if (o.eje === 'ppm') return [o.min, o.max];
  if (o.eje !== 'zona' || !z) return [null, null];
  // Z1 no tiene suelo: por debajo de Z1 no hay zona. El suelo de `limitesZona`
  // es solo para dibujarla; juzgar con él mandaría «aprieta» en un rodaje a Z1.
  const lo = o.min != null && o.min > 1 && o.papel !== 'techo' ? limitesZona(o.min, z)[0] : null;
  const hi = o.max != null ? limitesZona(o.max, z)[1] : null;
  return [lo, hi];
}

// ---------------------------------------------------------------------------
// El veredicto — con dirección, nunca solo color (P3, P6)
// ---------------------------------------------------------------------------

/** Ejes donde MÁS es MENOS intenso (segundos por distancia). */
const INVERSO: ReadonlySet<EjeObjetivo> = new Set(['ritmo', 'split500']);

/**
 * ¿Dentro, por encima o por debajo? Se razona en INTENSIDAD: por encima es más
 * rápido, más pulso, más vatios. `holgura` es la histéresis (dato del coach);
 * para PINTAR se usa 0 — la pantalla dice la verdad; la holgura es del aviso.
 */
export function veredictoDe(
  o: Objetivo,
  valor: number,
  holgura = 0,
  zonas: ZonasCoach | null = null,
): Veredicto {
  const [lo, hi] = o.eje === 'zona' || o.eje === 'ppm' ? rangoPpm(o, zonas) : [o.min, o.max];
  let v: Veredicto = 'dentro';
  if (INVERSO.has(o.eje)) {
    if (lo != null && valor < lo - holgura) v = 'por-encima';
    else if (hi != null && valor > hi + holgura) v = 'por-debajo';
  } else {
    if (hi != null && valor > hi + holgura) v = 'por-encima';
    else if (lo != null && valor < lo - holgura) v = 'por-debajo';
  }
  const avisa = o.papel === 'techo' ? 'solo-arriba' : (o.avisa ?? 'ambos');
  if (avisa === 'solo-arriba' && v === 'por-debajo') return 'dentro';
  if (avisa === 'solo-abajo' && v === 'por-encima') return 'dentro';
  return v;
}

/** La palabra y la marca del veredicto: «▲ rápido», «▼ lento», «▲ alto», «▼ bajo», «dentro». */
export function palabraVeredicto(eje: EjeObjetivo, v: Veredicto): { marca: '▲' | '▼' | null; texto: string } {
  if (v === 'dentro') return { marca: null, texto: 'dentro' };
  const arriba = v === 'por-encima';
  if (INVERSO.has(eje)) return { marca: arriba ? '▲' : '▼', texto: arriba ? 'rápido' : 'lento' };
  if (eje === 'cadencia') return { marca: arriba ? '▲' : '▼', texto: arriba ? 'alta' : 'baja' };
  return { marca: arriba ? '▲' : '▼', texto: arriba ? 'alto' : 'bajo' };
}

/** La holgura (histéresis) del coach para un eje. */
export function holguraDe(eje: EjeObjetivo, r: ReglasAviso): number {
  if (eje === 'ritmo') return r.holgura.ritmo;
  if (eje === 'zona' || eje === 'ppm') return r.holgura.ppm;
  if (eje === 'split500') return r.holgura.split500;
  if (eje === 'potencia') return r.holgura.vatios;
  if (eje === 'cadencia') return r.holgura.cadencia;
  return 0;
}

/** Un objetivo contra su lectura en vivo, con la holgura del coach. `null` = no lo mide nadie ahora. */
function juzgar(o: Objetivo, l: Lecturas, zonas: ZonasCoach | null, reglas: ReglasAviso): Veredicto | null {
  const v = valorDeEje(o.eje, l);
  return v == null ? null : veredictoDe(o, v, holguraDe(o.eje, reglas), zonas);
}

const esPulso = (e: EjeObjetivo) => e === 'zona' || e === 'ppm';
const mismaMagnitud = (a: EjeObjetivo, b: EjeObjetivo) => a === b || (esPulso(a) && esPulso(b));

/**
 * El veredicto del objetivo principal — el que pinta la banda. Si el paso lleva
 * un techo en la MISMA magnitud («Z1, máx 142 ppm»), el borde alto lo pone el
 * techo: el coach ya dijo hasta dónde se puede subir, así que 141 no es «alto».
 */
export function veredictoPrincipal(
  p: PasoBase,
  l: Lecturas,
  zonas: ZonasCoach | null,
  reglas: ReglasAviso,
): Veredicto | null {
  const o = principal(p);
  if (!o) return null;
  const vp = juzgar(o, l, zonas, reglas);
  const techo = objetivoDe(p, 'techo');
  if (!techo || !mismaMagnitud(o.eje, techo.eje)) return vp;
  if (juzgar(techo, l, zonas, reglas) === 'por-encima') return 'por-encima';
  return vp === 'por-encima' ? 'dentro' : vp;
}

/**
 * EL veredicto del paso (P1: uno solo, el que vibra). Un techo pasado manda
 * («afloja»), esté en la magnitud que esté: un ritmo con techo de pulso avisa
 * por el pulso aunque el ritmo vaya dentro. Si no, el del principal.
 */
export function veredictoDelPaso(
  p: PasoBase,
  l: Lecturas,
  zonas: ZonasCoach | null,
  reglas: ReglasAviso,
): Veredicto | null {
  const techo = objetivoDe(p, 'techo');
  if (techo && juzgar(techo, l, zonas, reglas) === 'por-encima') return 'por-encima';
  return veredictoPrincipal(p, l, zonas, reglas);
}

/** ¿El techo del paso está pasado ahora? (la línea del pulso lo dice: «▲ alto»). */
export function techoPasado(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null, reglas: ReglasAviso): boolean {
  const techo = objetivoDe(p, 'techo');
  return !!techo && juzgar(techo, l, zonas, reglas) === 'por-encima';
}

/** El valor en vivo que se juzga contra un objetivo, o `null` si no lo mide nadie ahora. */
export function valorDeEje(eje: EjeObjetivo, l: Lecturas): number | null {
  const viejo = (c: NonNullable<Lecturas['viejos']>[number]) => l.viejos?.includes(c) ?? false;
  switch (eje) {
    case 'ritmo':
      return viejo('ritmo') ? null : l.ritmo;
    case 'zona':
    case 'ppm':
      return viejo('ppm') ? null : l.ppm;
    case 'split500':
      return viejo('split500') ? null : (l.split500 ?? null);
    case 'potencia':
      return viejo('vatios') ? null : (l.vatios ?? null);
    case 'cadencia':
      return viejo('cadencia') ? null : (l.cadencia ?? null);
    default:
      return null;
  }
}

/**
 * La posición en las zonas, con palabras: «Z2 · a 6 de Z3» (dentro, cuánto
 * falta para el techo), «Z3 · a 5 de Z4» (por debajo, cuánto falta para
 * entrar), «Z4 · 3 sobre Z3» (por encima del techo), «Z5 · dentro».
 */
export function posicionZona(ppm: number, o: Objetivo, z: ZonasCoach): string {
  const actual = zonaDe(ppm, z);
  const [lo, hi] = rangoPpm(o, z);
  const zMax = o.max ?? actual;
  if (hi != null && ppm > hi) return `Z${actual} · ${ppm - hi} sobre Z${zMax}`;
  if (lo != null && ppm < lo) return `Z${actual} · a ${lo - ppm} de Z${o.min}`;
  if (hi != null && zMax < z.techos.length) return `Z${actual} · a ${hi + 1 - ppm} de Z${zMax + 1}`;
  return `Z${actual} · dentro`;
}

/** El color de fondo de un paso: SOLO si va a zona y hay pulso y zonas (P6). */
export function tinteDelPaso(p: PasoBase, l: Lecturas, z: ZonasCoach | null): string | null {
  const o = principal(p);
  if (!o || (o.eje !== 'zona' && o.eje !== 'ppm') || !z || p.rol !== 'trabajo') return null;
  const ppm = valorDeEje('ppm', l);
  return ppm == null ? null : colorZona(zonaDe(ppm, z), z.techos.length);
}
