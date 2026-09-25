// LO QUE SE DICE — «Luego ·», «Viene:», la pista de la corona y la voz de
// fuerza, sacados del dato del paso (nunca un texto escrito a mano).
//
// La voz del kit (`vozInicio`) es de correr: «Serie 2 de 4. 8 repeticiones.»
// no dice QUÉ ejercicio ni con cuánta carga. En fuerza la frase del GO lleva
// el nombre, la serie, las reps, la carga en cifra y el esfuerzo:
// «A1, Back Squat. Serie 2 de 4: 8 repeticiones con 125 kilos.»

import { fmtDuracion, fmtPrescrito, num, type PasoBase, type PlanSesion } from '../../kit-reloj';
import { cargaArrastrada, type Campo, type Registro } from './anotar';
import {
  abreEjercicio,
  anteriorTrabajo,
  dosisEjercicio,
  dosisSerie,
  ejercicioDe,
  esFuerza,
  kgDelPlan,
  siguienteTrabajo,
  textoEsfuerzo,
  type PasoFuerza,
} from './modelo';

/** «A2 · Box Jump» — el hueco de la superserie delante del nombre. */
export function conSlot(p: PasoBase): string {
  return p.posicion?.slot ? `${p.posicion.slot} · ${p.nombre ?? ''}` : (p.nombre ?? '');
}

/** «A2 Box Jump»: para «Luego ·», en la fila de abajo. */
const corto = (p: PasoBase) => [p.posicion?.slot, p.nombre].filter(Boolean).join(' ');

/** «Serie 2/4» o «Aproximación 1/2». */
export function quienSerie(p: PasoFuerza): string {
  const s = p.posicion?.serie;
  const que = p.fuerza.aproximacion ? 'Aproximación' : 'Serie';
  return s ? `${que} ${s.n}/${s.de}` : que;
}

/** Un paso que no es de fuerza, en corto: «Sled Push · 6 × 15 m». */
function cortoOtro(plan: PlanSesion, j: number): string {
  const q = plan.pasos[j]!;
  const e = ejercicioDe(plan, j);
  const pr = fmtPrescrito(q.medida);
  const dosis = e && e.series > 1 ? `${e.series} × ${pr}` : pr;
  return [q.nombre, dosis].filter(Boolean).join(' · ');
}

/**
 * «Luego ·» en la cara de la serie: el compañero de superserie si va sin
 * descanso; el ejercicio nuevo si esta es su última serie; si no, el descanso.
 */
export function textoLuego(plan: PlanSesion, i: number): string | null {
  let k = i + 1;
  if (plan.pasos[k]?.rol === 'transicion') k += 1;
  const q = plan.pasos[k];
  if (!q) return null;
  // La última fila es la más estrecha (esquinas): el nombre sin la dosis, que ya dice el descanso.
  if (q.rol === 'trabajo') return esFuerza(q) ? corto(q) : cortoOtro(plan, k);
  const j = siguienteTrabajo(plan, k + 1);
  if (j != null && abreEjercicio(plan, j)) return esFuerza(plan.pasos[j]) ? corto(plan.pasos[j]!) : (plan.pasos[j]!.nombre ?? cortoOtro(plan, j));
  return `descanso ${fmtDuracion(q.medida.prescrito ?? 0)}`;
}

/** Lo que viene, en dos partes: qué («B1 · Deadlift», «Serie 3/4») y su dosis. */
export interface Viene {
  que: string;
  dosis: string | null;
}

/**
 * «Viene:» en el descanso `i`. Un ejercicio nuevo se anuncia entero
 * («B1 · Deadlift» + «4 × 8 · RIR 3»); la serie siguiente del mismo, con su
 * carga (la arrastrada si el atleta declaró otra).
 */
export function textoViene(plan: PlanSesion, i: number, registro: Registro): Viene | null {
  const j = siguienteTrabajo(plan, i + 1);
  if (j == null) return null;
  const q = plan.pasos[j]!;
  if (!esFuerza(q)) {
    const e = ejercicioDe(plan, j);
    const pr = fmtPrescrito(q.medida);
    return { que: q.nombre ?? pr, dosis: q.nombre ? (e && e.series > 1 ? `${e.series} × ${pr}` : pr) : null };
  }
  const e = ejercicioDe(plan, j)!;
  if (abreEjercicio(plan, j)) return { que: conSlot(q), dosis: dosisEjercicio(q, e.series) };
  const dosis = dosisSerie(q, cargaArrastrada(plan, j, registro));
  const a = anteriorTrabajo(plan, i);
  const antes = a != null ? plan.pasos[a] : null;
  const mismo = esFuerza(antes) && antes.fuerza.ejercicio === q.fuerza.ejercicio;
  if (!mismo) return { que: conSlot(q), dosis };
  // Tras la aproximación, el eje del esfuerzo sale por primera vez: se dice.
  const conEsfuerzo = antes.fuerza.aproximacion && q.fuerza.esfuerzo ? ` · ${textoEsfuerzo(q.fuerza.esfuerzo)}` : '';
  return { que: quienSerie(q), dosis: `${dosis}${conEsfuerzo}` };
}

/** Con la corona en un dato: qué gira y, en la carga, a qué series llega la cascada. */
export function textoPistaCorona(plan: PlanSesion, j: number, campo: Campo, registro: Registro): string {
  const p = plan.pasos[j];
  if (campo !== 'kg' || !esFuerza(p)) {
    const nombre = campo === 'reps' ? 'reps' : p && esFuerza(p) && p.fuerza.esfuerzo?.eje === 'rpe' ? 'RPE' : 'RIR';
    return `gira la corona · ${nombre}`;
  }
  const siguen: number[] = [];
  for (let k = j + 1; k < plan.pasos.length; k++) {
    const q = plan.pasos[k];
    if (!esFuerza(q) || q.fuerza.ejercicio !== p.fuerza.ejercicio || q.fuerza.aproximacion) continue;
    if (registro[q.id]?.kg != null) break;
    if (q.posicion?.serie) siguen.push(q.posicion.serie.n);
  }
  if (siguen.length === 0) return 'gira la corona · kg';
  if (siguen.length === 1) return `también en la serie ${siguen[0]}`;
  return `también en las series ${siguen[0]}–${siguen[siguen.length - 1]}`;
}

// ---------------------------------------------------------------------------
// La voz (a los auriculares, en español; los kilos y los tiempos en cifra)
// ---------------------------------------------------------------------------

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function tiempoDicho(s: number): string {
  if (s < 60 || s % 60 !== 0) return `${s} segundos`;
  return s === 60 ? 'un minuto' : `${s / 60} minutos`;
}

/** La carga dicha: la arrastrada, la del plan (valor o rango) o nada. */
function cargaDicha(plan: PlanSesion, j: number, registro: Registro): string | null {
  const p = plan.pasos[j];
  if (!esFuerza(p)) return null;
  const arr = cargaArrastrada(plan, j, registro);
  if (arr != null) return `${num(arr)} kilos`;
  const r = kgDelPlan(p.fuerza.carga);
  if (!r) return null;
  return r[0] === r[1] ? `${num(r[0])} kilos` : `${num(r[0])} a ${num(r[1])} kilos`;
}

/** Al empezar una serie (GO): «A1, Back Squat. Serie 2 de 4: 8 repeticiones con 125 kilos.» */
export function vozSerie(plan: PlanSesion, j: number, registro: Registro): string | null {
  const p = plan.pasos[j];
  if (!esFuerza(p)) return null;
  const f = p.fuerza;
  const s = p.posicion?.serie;
  const quien = [p.posicion?.slot, p.nombre].filter(Boolean).join(', ');
  const cabeza = `${quien}. ${f.aproximacion ? 'Aproximación' : 'Serie'}${s ? ` ${s.n} de ${s.de}` : ''}`;
  if (p.medida.tipo === 'tiempo') return `${cabeza}: ${tiempoDicho(p.medida.prescrito ?? 0)}.`;
  const kg = cargaDicha(plan, j, registro);
  const lado = f.porLado ? ` por ${f.porLado}` : '';
  const esfuerzo = f.esfuerzo ? `, ${textoEsfuerzo(f.esfuerzo)}` : '';
  return `${cabeza}: ${p.medida.prescrito} repeticiones${lado}${kg ? ` con ${kg}` : ''}${esfuerzo}.`;
}

/** Al empezar el descanso `i`: «Descanso, 2 minutos.» y, si abre ejercicio, «Luego Deadlift.» */
export function vozDescanso(plan: PlanSesion, i: number): string {
  const p = plan.pasos[i]!;
  const base = `Descanso, ${tiempoDicho(p.medida.prescrito ?? 0)}.`;
  const j = siguienteTrabajo(plan, i + 1);
  return j != null && abreEjercicio(plan, j) && plan.pasos[j]!.nombre ? `${base} Luego ${plan.pasos[j]!.nombre}.` : base;
}

/** Al entrar en «Colócate»: «Colócate: isometría en puente de glúteo.» */
export function vozColocate(plan: PlanSesion, i: number): string {
  const sig = plan.pasos[i + 1];
  return sig?.nombre ? `Colócate: ${sig.nombre.charAt(0).toLowerCase()}${sig.nombre.slice(1)}.` : 'Colócate.';
}

/** La frase de un evento del motor, reescrita con el paso YA avanzado (`i`). */
export function vozDe(evento: string, voz: string | undefined, plan: PlanSesion, i: number, registro: Registro): string | undefined {
  const p = plan.pasos[i];
  if (!p) return voz;
  if (evento === 'go' && esFuerza(p)) return vozSerie(plan, i, registro) ?? voz;
  if (evento === 'recupera' && p.rol === 'transicion') return vozColocate(plan, i);
  if (evento === 'recupera' && p.rol === 'descanso') return vozDescanso(plan, i);
  return voz ? mayus(voz) : voz;
}
