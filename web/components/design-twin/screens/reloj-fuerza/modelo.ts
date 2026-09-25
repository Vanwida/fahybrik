// LA SERIE DE FUERZA — el paso del kit con su ficha (P11, M1).
//
// Un paso de fuerza es un `PasoBase` del kit (medida en reps o en tiempo,
// posición «serie k/K» y «A1/A2», cierre del atleta) más su FICHA: los DOS
// ejes de la dosis —la carga (kg, %RM resuelto con la RM del atleta, peso
// corporal o «la pones tú») y el esfuerzo (RIR o RPE)—, si es por lado, si
// es de aproximación y el paso de carga del implemento. Ningún campo es texto
// libre: el cue del coach (M8) sigue siendo el único coaching escrito.
//
// Lo que es DATO y no constante (HARD RULE Nº0):
//   · `pasoKg` — cuánto sube la carga un clic de corona (barra 2,5 kg,
//     mancuernas 2 kg…): es del gimnasio y del atleta.
//   · `rmKg`, `ultimaKg` — son del atleta, no del plan.
//   · `COLOCATE_S_DEFECTO` (en planes.ts) — el tiempo para colocarse antes de
//     una isometría que no viene de un descanso.

import { fmtDuracion, num, type PasoBase, type PlanSesion } from '../../kit-reloj';

// ---------------------------------------------------------------------------
// La ficha
// ---------------------------------------------------------------------------

/** El eje de la CARGA. Uno por serie; el esfuerzo es el otro eje. */
export type CargaFuerza =
  /** Kilos directos del coach: «155 kg», «150–160 kg». */
  | { tipo: 'kg'; min: number; max: number }
  /** %RM del coach, resuelto en kg con la RM del atleta (`null` = no la tiene). */
  | { tipo: 'rm'; pctMin: number; pctMax: number; rmKg: number | null }
  /** Peso corporal: no hay carga que anotar. */
  | { tipo: 'corporal' }
  /**
   * El coach no pone carga (manda el RIR o el RPE): la pone el atleta. Se
   * propone la de la última vez, que no cuenta como declarada. Con `lastre`,
   * lo que se anota es el lastre (dominada lastrada).
   */
  | { tipo: 'tuya'; ultimaKg: number | null; lastre?: boolean };

/** El eje del ESFUERZO: RIR o RPE, valor o rango. */
export interface EsfuerzoFuerza {
  eje: 'rir' | 'rpe';
  min: number;
  max: number;
}

export interface FichaFuerza {
  /** Clave del ejercicio en la sesión: agrupa sus series y aproximaciones. */
  ejercicio: string;
  carga: CargaFuerza;
  esfuerzo: EsfuerzoFuerza | null;
  /** «10 por pierna» es dato, no nota. */
  porLado?: 'pierna' | 'brazo' | 'lado';
  /** Serie de aproximación: se marca, no es de trabajo y no se anota. */
  aproximacion?: boolean;
  /** Lo que mueve la carga un clic de corona, en kg. */
  pasoKg: number;
}

export type PasoFuerza = PasoBase & { fuerza: FichaFuerza };

export function esFuerza(p: PasoBase | null | undefined): p is PasoFuerza {
  return !!p && 'fuerza' in p;
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

/** 127.5 → «127,5 kg» (espacio fino que no parte). */
export const fmtKg = (n: number) => `${num(n)} kg`;

/** 4280 → «4.280»: miles con punto, como se escriben en España. */
export function fmtMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function rango(min: number, max: number, f: (n: number) => string): string {
  return min === max ? f(min) : `${f(min)}–${f(max)}`;
}

/** La RM resuelta en kg, redondeada al kilo como la enseña el plan: 65–70 % de 186,5 → 121–131. */
export function kgDelPlan(c: CargaFuerza): [number, number] | null {
  if (c.tipo === 'kg') return [c.min, c.max];
  if (c.tipo === 'rm' && c.rmKg) return [Math.round((c.rmKg * c.pctMin) / 100), Math.round((c.rmKg * c.pctMax) / 100)];
  return null;
}

/** «121–131 kg», «156 kg»; null si el plan no da kilos. */
export function textoKgPlan(c: CargaFuerza): string | null {
  const r = kgDelPlan(c);
  return r ? `${rango(r[0], r[1], num)} kg` : null;
}

/** «65–70 % RM». */
export function textoPct(c: CargaFuerza): string | null {
  return c.tipo === 'rm' ? `${rango(c.pctMin, c.pctMax, num)} % RM` : null;
}

/** «RIR 3», «RPE 7,5», «RIR 2–3». */
export function textoEsfuerzo(e: EsfuerzoFuerza): string {
  return `${e.eje === 'rir' ? 'RIR' : 'RPE'} ${rango(e.min, e.max, num)}`;
}

/** 3-1-1-0 → «3-1-1»; la pausa arriba solo si la hay. */
export function textoTempo(t: NonNullable<PasoBase['tempo']>): string {
  const base = `${t.excentrica}-${t.pausaAbajo}-${t.concentrica}`;
  return t.pausaArriba > 0 ? `${base}-${t.pausaArriba}` : base;
}

/** Lo que se hace en UNA serie, sin la carga: «8», «20″». */
function cantidad(p: PasoBase): string {
  const pr = p.medida.prescrito ?? 0;
  return p.medida.tipo === 'tiempo' ? fmtDuracion(pr) : String(pr);
}

/**
 * La carga de la línea de la serie. Con carga arrastrada (la que declaró el
 * atleta en la serie anterior del mismo ejercicio), esa: es la que está en la
 * barra. Si no, la del plan; si el plan no la da, «carga tuya».
 */
export function textoCarga(f: FichaFuerza, arrastrada: number | null): string | null {
  if (f.carga.tipo === 'corporal') return null;
  if (arrastrada != null) return f.carga.tipo === 'tuya' && f.carga.lastre ? `+${fmtKg(arrastrada)}` : fmtKg(arrastrada);
  if (f.carga.tipo === 'tuya') {
    const que = f.carga.lastre ? 'lastre tuyo' : 'carga tuya';
    return f.carga.ultimaKg != null ? `${que} · última ${fmtKg(f.carga.ultimaKg)}` : que;
  }
  return textoKgPlan(f.carga) ?? textoPct(f.carga);
}

/** Una serie en corto, para «Viene:» y «Luego ·»: «8 × 125 kg», «6 reps», «20″». */
export function dosisSerie(p: PasoFuerza, arrastrada: number | null): string {
  if (p.medida.tipo === 'tiempo') return cantidad(p);
  const c = p.fuerza.carga;
  const kg = arrastrada != null ? fmtKg(arrastrada) : c.tipo === 'tuya' || c.tipo === 'corporal' ? null : textoKgPlan(c);
  return kg ? `${cantidad(p)} × ${kg}` : `${cantidad(p)} reps`;
}

/** El ejercicio entero en corto: «4 × 8 · RIR 3», «4 × 8 · 65–70 % RM», «3 × 20″». */
export function dosisEjercicio(p: PasoFuerza, series: number): string {
  const f = p.fuerza;
  const eje = f.esfuerzo ? textoEsfuerzo(f.esfuerzo) : (textoPct(f.carga) ?? textoKgPlan(f.carga));
  return [`${series} × ${cantidad(p)}`, eje].filter(Boolean).join(' · ');
}

/** «A1 · serie 3 hecha» — el aviso de deshacer, corto para que quepa entero. */
export function avisoSerie(p: PasoBase): string {
  const s = p.posicion?.serie;
  const f = esFuerza(p) ? p.fuerza : null;
  const que = f?.aproximacion ? 'aproximación' : 'serie';
  const n = s ? ` ${s.n}` : '';
  const texto = `${que}${n} hecha`;
  return p.posicion?.slot ? `${p.posicion.slot} · ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---------------------------------------------------------------------------
// La sesión como ejercicios (página «Ejercicios», «Viene:», «Luego ·»)
// ---------------------------------------------------------------------------

export interface Ejercicio {
  clave: string;
  nombre: string;
  slot?: string;
  bloque: number;
  /** Índices de los pasos de trabajo del ejercicio, aproximaciones incluidas. */
  pasos: number[];
  /** Series de trabajo (sin aproximaciones). */
  series: number;
}

function claveDe(p: PasoBase): string | null {
  if (esFuerza(p)) return p.fuerza.ejercicio;
  if (p.rol !== 'trabajo') return null;
  return `${p.bloque ?? 0}-${p.nombre ?? p.clase}`;
}

/** Los ejercicios de la sesión, en el orden de la hoja del coach. */
export function ejerciciosDe(plan: PlanSesion): Ejercicio[] {
  const out: Ejercicio[] = [];
  plan.pasos.forEach((p, i) => {
    const clave = claveDe(p);
    if (!clave) return;
    let e = out.find((x) => x.clave === clave);
    if (!e) {
      e = { clave, nombre: p.nombre ?? 'Movilidad', slot: p.posicion?.slot, bloque: p.bloque ?? 0, pasos: [], series: 0 };
      out.push(e);
    }
    e.pasos.push(i);
    if (!(esFuerza(p) && p.fuerza.aproximacion)) e.series += 1;
  });
  return out;
}

/** El ejercicio al que pertenece el paso `i`, si es de trabajo. */
export function ejercicioDe(plan: PlanSesion, i: number): Ejercicio | null {
  const clave = claveDe(plan.pasos[i]!);
  return clave ? (ejerciciosDe(plan).find((e) => e.clave === clave) ?? null) : null;
}

/** El siguiente paso de trabajo a partir de `desde` (incluido), saltando descansos y «colócate». */
export function siguienteTrabajo(plan: PlanSesion, desde: number): number | null {
  for (let j = desde; j < plan.pasos.length; j++) if (plan.pasos[j]!.rol === 'trabajo') return j;
  return null;
}

/** El último paso de trabajo antes de `i`. */
export function anteriorTrabajo(plan: PlanSesion, i: number): number | null {
  for (let j = i - 1; j >= 0; j--) if (plan.pasos[j]!.rol === 'trabajo') return j;
  return null;
}

/** ¿Es `j` la primera serie de trabajo de su ejercicio (lo que abre un ejercicio nuevo)? */
export function abreEjercicio(plan: PlanSesion, j: number): boolean {
  const p = plan.pasos[j]!;
  const clave = claveDe(p);
  if (!clave) return false;
  for (let k = j - 1; k >= 0; k--) if (claveDe(plan.pasos[k]!) === clave) return false;
  return true;
}
