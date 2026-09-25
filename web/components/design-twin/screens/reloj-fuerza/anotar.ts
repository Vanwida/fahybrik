// ANOTAR LA SERIE — lo que se declara en el propio descanso (P11), puro.
//
// La regla de honestidad: lo que la muñeca propone (reps, carga y esfuerzo
// prescritos, o la carga arrastrada de la serie anterior) NO cuenta como
// declarado hasta que el atleta lo confirma o lo toca. Tres estados por dato:
//
//   propuesto  sale del plan (o de la serie anterior): gris, «sin confirmar»
//   medido     lo midió el reloj (reps del sensor, segundos de una isometría)
//   declarado  lo dijo el atleta: confirmó o giró la corona
//
// Solo lo declarado se GUARDA (`Registro`); lo demás se deriva, así que no
// hay nada que limpiar si el atleta deshace un cierre. La carga va en
// CASCADA: la última carga declarada de un ejercicio es la propuesta de sus
// series siguientes, hasta que el atleta declare otra.

import {
  FICHA_FUERZA_DEFECTO,
  esFuerza,
  fmtKg,
  kgDelPlan,
  type EstadoSecuencia,
  type FichaFuerza,
  type PasoFuerza,
  type PlanSesion,
  type Simulador,
} from '../../kit-reloj';

export type EstadoDato = 'propuesto' | 'medido' | 'declarado';
export type Campo = 'reps' | 'kg' | 'esfuerzo';

export interface Dato {
  valor: number | null;
  estado: EstadoDato;
}

export interface Anotacion {
  reps: Dato;
  /** null = no hay carga que anotar (peso corporal). */
  kg: Dato | null;
  /** null = el coach no prescribió esfuerzo en esta serie. */
  esfuerzo: Dato | null;
}

/** Lo declarado, por id de paso. Lo único que se guarda. */
export type Registro = Record<string, Partial<Record<Campo, number>>>;

/** Lo que el reloj midió de una serie cerrada: reps del sensor o segundos. */
export interface Medida {
  segundos: number;
  reps: number | null;
}

// ---------------------------------------------------------------------------
// Lo propuesto
// ---------------------------------------------------------------------------

const alPaso = (n: number, paso: number) => Math.round(n / paso) * paso;

/** La carga que propone el PLAN: el centro de lo prescrito, cargable en la barra; o la de la última vez. */
export function cargaDelPlan(f: FichaFuerza): number | null {
  const r = kgDelPlan(f.carga);
  if (r) return alPaso((r[0] + r[1]) / 2, f.pasoKg);
  if (f.carga.tipo === 'rm' && f.carga.rmKg) return alPaso((f.carga.rmKg * (f.carga.pctMin + f.carga.pctMax)) / 200, f.pasoKg);
  if (f.carga.tipo === 'tuya') return f.carga.ultimaKg;
  return null;
}

/** La carga ARRASTRADA: la última declarada en una serie anterior del mismo ejercicio. */
export function cargaArrastrada(plan: PlanSesion, j: number, registro: Registro): number | null {
  const p = plan.pasos[j];
  if (!esFuerza(p)) return null;
  for (let k = j - 1; k >= 0; k--) {
    const q = plan.pasos[k];
    if (!esFuerza(q) || q.fuerza.ejercicio !== p.fuerza.ejercicio || q.fuerza.aproximacion) continue;
    const kg = registro[q.id]?.kg;
    if (kg != null) return kg;
  }
  return null;
}

function centroEsfuerzo(f: FichaFuerza): number | null {
  if (!f.esfuerzo) return null;
  const paso = f.esfuerzo.eje === 'rpe' ? 0.5 : 1;
  return alPaso((f.esfuerzo.min + f.esfuerzo.max) / 2, paso);
}

/** La anotación de la serie `j`: lo declarado, lo medido o lo propuesto, campo a campo. */
export function anotacionDe(plan: PlanSesion, j: number, registro: Registro, medida: Medida | null): Anotacion | null {
  const p = plan.pasos[j];
  if (!esFuerza(p)) return null;
  const f = p.fuerza;
  const r = registro[p.id] ?? {};
  const reps: Dato =
    r.reps != null
      ? { valor: r.reps, estado: 'declarado' }
      : medida?.reps != null
        ? { valor: medida.reps, estado: 'medido' }
        : { valor: p.medida.prescrito, estado: 'propuesto' };
  const kg: Dato | null =
    f.carga.tipo === 'corporal'
      ? null
      : r.kg != null
        ? { valor: r.kg, estado: 'declarado' }
        : { valor: cargaArrastrada(plan, j, registro) ?? cargaDelPlan(f), estado: 'propuesto' };
  const esfuerzo: Dato | null = !f.esfuerzo
    ? null
    : r.esfuerzo != null
      ? { valor: r.esfuerzo, estado: 'declarado' }
      : { valor: centroEsfuerzo(f), estado: 'propuesto' };
  return { reps, kg, esfuerzo };
}

export function pendiente(a: Anotacion): boolean {
  return camposPendientes(a).length > 0;
}

/** Los datos que siguen propuestos (sin confirmar). */
export function camposPendientes(a: Anotacion): Campo[] {
  const out: Campo[] = [];
  if (a.reps.estado === 'propuesto') out.push('reps');
  if (a.kg?.estado === 'propuesto') out.push('kg');
  if (a.esfuerzo?.estado === 'propuesto') out.push('esfuerzo');
  return out;
}

/** Confirmar = escribir lo que se ve (propuesto o medido) como declarado. */
export function confirmar(registro: Registro, id: string, a: Anotacion): Registro {
  const r = { ...(registro[id] ?? {}) };
  if (a.reps.valor != null) r.reps = a.reps.valor;
  if (a.kg?.valor != null) r.kg = a.kg.valor;
  if (a.esfuerzo?.valor != null) r.esfuerzo = a.esfuerzo.valor;
  return { ...registro, [id]: r };
}

// ---------------------------------------------------------------------------
// La corona
// ---------------------------------------------------------------------------

/**
 * Hasta dónde llega la corona al anotar. MÉTODO, dato con defecto (HARD RULE
 * Nº0): otro coach anota el RPE desde 1, o el RIR hasta 10.
 */
export const RANGO_ANOTAR_DEFECTO = {
  /** Reps por encima de lo prescrito que la corona deja subir. */
  repsDeMas: 10,
  rpe: { min: 5, max: 10, paso: 0.5 },
  rir: { min: 0, max: 6, paso: 1 },
  kgMax: 500,
} as const;

/**
 * Paso, suelo y techo de la corona en cada campo. De «—» se arranca en la
 * barra vacía (dato del implemento: `vaciaKg`); con lastre, en un clic.
 */
export function girar(p: PasoFuerza, campo: Campo, actual: number | null, dir: 1 | -1, rango = RANGO_ANOTAR_DEFECTO): number {
  const f = p.fuerza;
  if (campo === 'reps') {
    const techo = (p.medida.prescrito ?? 10) + rango.repsDeMas;
    return Math.min(techo, Math.max(0, (actual ?? p.medida.prescrito ?? 0) + dir));
  }
  if (campo === 'kg') {
    if (actual == null) return f.carga.tipo === 'tuya' && f.carga.lastre ? f.pasoKg : (f.vaciaKg ?? FICHA_FUERZA_DEFECTO.vaciaKg);
    return Math.min(rango.kgMax, Math.max(0, alPaso(actual + dir * f.pasoKg, f.pasoKg / 2)));
  }
  const escala = f.esfuerzo?.eje === 'rpe' ? rango.rpe : rango.rir;
  const base = actual ?? centroEsfuerzo(f) ?? (f.esfuerzo?.eje === 'rpe' ? 7 : 2);
  return Math.min(escala.max, Math.max(escala.min, base + dir * escala.paso));
}

// ---------------------------------------------------------------------------
// Qué se anota en un descanso, y lo que midió el reloj
// ---------------------------------------------------------------------------

/**
 * Las series que se anotan en el descanso `i`: las de trabajo desde el
 * descanso anterior (la ronda entera en una superserie), sin aproximaciones
 * y sin isometrías (esas las mide el reloj). Un «colócate» no corta la ronda.
 */
export function seriesDelDescanso(plan: PlanSesion, i: number): number[] {
  const out: number[] = [];
  for (let j = i - 1; j >= 0; j--) {
    const p = plan.pasos[j]!;
    if (p.rol === 'transicion') continue;
    if (p.rol !== 'trabajo') break;
    if (esFuerza(p) && !p.fuerza.aproximacion && p.medida.tipo === 'reps') out.unshift(j);
  }
  return out;
}

/** Los pasos que el motor cuenta como series (y de los que guarda su vuelta al cerrarlos). */
function cuentaVuelta(plan: PlanSesion, j: number): boolean {
  const p = plan.pasos[j]!;
  return p.rol === 'trabajo' && p.fase === 'principal' && !!(p.posicion?.serie ?? p.posicion?.tramo);
}

/**
 * Lo que el reloj midió de la serie `j` ya cerrada: sus segundos (la vuelta
 * que deja el motor al cerrarla) y, si las contaba el sensor, sus reps.
 */
export function medidaDe(plan: PlanSesion, e: EstadoSecuencia, j: number, sim: Simulador): Medida | null {
  if (j >= e.i || !cuentaVuelta(plan, j)) return null;
  let k = 0;
  for (let x = 0; x < j; x++) if (cuentaVuelta(plan, x)) k += 1;
  const v = e.vueltas[k];
  if (!v) return null;
  const p = plan.pasos[j]!;
  const reps = p.medida.mide === 'sensor' ? (sim(p, j, v.segundos, 0).hecho ?? null) : null;
  return { segundos: v.segundos, reps };
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** «8 × 125 kg · RIR 3», «6 reps», «8 × — kg». */
export function textoAnotacion(a: Anotacion, f: FichaFuerza, conEsfuerzo = true): string {
  const reps = a.reps.valor == null ? '—' : String(a.reps.valor);
  const partes = [a.kg ? `${reps} × ${a.kg.valor == null ? '— kg' : fmtKg(a.kg.valor)}` : `${reps} reps`];
  if (conEsfuerzo && a.esfuerzo && f.esfuerzo) partes.push(`${f.esfuerzo.eje === 'rir' ? 'RIR' : 'RPE'} ${fmtValor(a.esfuerzo.valor)}`);
  return partes.join(' · ');
}

/** 6.5 → «6,5»; null → «—». */
export function fmtValor(n: number | null): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/** El volumen de lo hecho (reps × kg), y cuántas series siguen sin confirmar. */
export function volumen(plan: PlanSesion, e: EstadoSecuencia, registro: Registro, sim: Simulador): { kg: number; sinConfirmar: number; hechas: number; total: number } {
  let kg = 0;
  let sinConfirmar = 0;
  let hechas = 0;
  let total = 0;
  plan.pasos.forEach((p, j) => {
    if (p.rol !== 'trabajo' || p.fase !== 'principal' || !(p.posicion?.serie ?? p.posicion?.tramo)) return;
    total += 1;
    if (j >= e.i) return;
    hechas += 1;
    const a = anotacionDe(plan, j, registro, medidaDe(plan, e, j, sim));
    if (!a || !esFuerza(p) || p.medida.tipo !== 'reps') return;
    if (pendiente(a)) sinConfirmar += 1;
    if (a.kg?.valor != null && a.reps.valor != null) kg += a.kg.valor * a.reps.valor;
  });
  return { kg, sinConfirmar, hechas, total };
}
