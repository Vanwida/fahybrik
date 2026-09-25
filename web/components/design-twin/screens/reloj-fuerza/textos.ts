// LO QUE SE DICE — «Luego ·», «Viene:», la pista de la corona y la voz de
// fuerza, sacados del dato del paso (nunca un texto escrito a mano).
//
// La voz del GO es la del kit (`vozInicio` sabe de la ficha: «A1, Back Squat.
// Serie 2 de 4: 8 repeticiones con 125 kilos.»); aquí solo se le da la carga
// que está en la barra (la cascada de lo declarado) y se dice el descanso
// con el ejercicio que abre («Descanso, 2 minutos. Luego Deadlift.»).

import {
  conVoz,
  dosisEjercicio,
  dosisSerie,
  esFuerza,
  fmtDuracion,
  fmtPrescrito,
  quienSerie,
  textoEsfuerzo,
  vozInicio,
  type PasoBase,
  type PlanSesion,
  type Traductor,
  type Viene,
} from '../../kit-reloj';
import { cargaArrastrada, type Campo, type Registro } from './anotar';
import { abreEjercicio, anteriorTrabajo, ejercicioDe, siguienteTrabajo } from './modelo';

/** «A2 · Box Jump» — el hueco de la superserie delante del nombre. */
export function conSlot(p: PasoBase): string {
  return p.posicion?.slot ? `${p.posicion.slot} · ${p.nombre ?? ''}` : (p.nombre ?? '');
}

/** «A2 Box Jump»: para «Luego ·», en la fila de abajo. */
const corto = (p: PasoBase) => [p.posicion?.slot, p.nombre].filter(Boolean).join(' ');

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

function tiempoDicho(s: number): string {
  if (s < 60 || s % 60 !== 0) return `${s} segundos`;
  return s === 60 ? 'un minuto' : `${s / 60} minutos`;
}

/** Al empezar el descanso `i`: «Descanso, 2 minutos.» y, si abre ejercicio, «Luego Deadlift.» */
export function vozDescanso(plan: PlanSesion, i: number): string {
  const p = plan.pasos[i]!;
  const base = `Descanso, ${tiempoDicho(p.medida.prescrito ?? 0)}.`;
  const j = siguienteTrabajo(plan, i + 1);
  return j != null && abreEjercicio(plan, j) && plan.pasos[j]!.nombre ? `${base} Luego ${plan.pasos[j]!.nombre}.` : base;
}

/**
 * La voz de fuerza, como traductor del kit: el GO con la carga que el
 * atleta declaró (la que está en la barra) y el descanso con el ejercicio que
 * abre. Lo demás («Colócate», el preaviso, «Sesión completada») es del kit.
 */
export function vozFuerza(plan: PlanSesion, registro: Registro): Traductor {
  return conVoz((evento, _voz, t) => {
    const i = t.despues.i;
    const p = plan.pasos[i];
    if (t.despues.terminado || !p) return undefined;
    if (evento === 'go' && esFuerza(p)) return vozInicio(p, { kg: cargaArrastrada(plan, i, registro) });
    if (evento === 'recupera' && p.rol === 'descanso') return vozDescanso(plan, i);
    return undefined;
  });
}
