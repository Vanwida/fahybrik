// LA VOZ DEL CIRCUITO — lo que el reloj dice a los auriculares al cambiar de
// paso (P5, Alex 25-09), sacado del dato del paso y nunca de un texto a mano.
// Convención del kit: los metros en letra, los tiempos y las reps en cifra.
//
//   Tramo:     «Ronda 3 de 5. Run, mil metros a RPE 8.» · «Run 4 de 8. Mil metros.»
//   Estación:  «Entras a Sled Push. Cincuenta metros con 152 kilos.»
//   Roxzone y campana: las del kit («Roxzone. Entras a Wall Balls.», «Tiempo. ¿Cuántas Walking Lunge?»).
//   Resultado: «Run 3: 4:41.» — el tramo de carrera es el km, y esta es su voz.
//
// Es un `Traductor` del kit: recibe la transición entera y devuelve lo que se
// emite. En la carrera todo cambio de paso a trabajo es `.start×2` (también
// la Roxzone); el descanso y la campana, `.stop` (el vocabulario del §4, sin uno nuevo).

import { enLetras, fmtReloj, num, principal, type Emitido, type Parcial, type PasoBase, type Traductor } from '../../kit-reloj';
import type { Circuito } from './planes';

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dosisDicha(p: PasoBase): string {
  const pr = p.medida.prescrito;
  if (pr == null) return '';
  switch (p.medida.tipo) {
    case 'distancia':
      return `${enLetras(pr)} metros`;
    case 'reps':
      return `${pr} repeticiones`;
    case 'cal':
      return `${pr} calorías`;
    case 'tiempo':
      return pr % 60 === 0 ? `${pr / 60} minutos` : `${pr} segundos`;
    default:
      return '';
  }
}

function cargaDicha(p: PasoBase): string {
  const c = p.carga;
  if (!c) return '';
  return c.implementos && c.implementos > 1 ? `con ${enLetras(c.implementos)} de ${num(c.kg)} kilos` : `con ${num(c.kg)} kilos`;
}

function objetivoDicho(p: PasoBase): string {
  const o = principal(p);
  if (!o || o.eje !== 'rpe') return '';
  return `a RPE ${num(o.min ?? o.max ?? 0)}`;
}

/**
 * Al entrar a un paso de trabajo: el tramo con su posición, la estación con su
 * dosis y su carga. Tras la Roxzone de entrada el «Entras a» ya se dijo.
 */
export function vozEntrada(p: PasoBase, c: Circuito, trasRoxzone = false): string {
  const ronda = p.posicion?.ronda;
  if (p.clase === 'carrera') {
    const cuerpo = [dosisDicha(p), objetivoDicho(p)].filter(Boolean).join(' ');
    if (c.formato === 'hyrox' && ronda) return `Run ${ronda.n} de ${ronda.de}. ${mayus(cuerpo)}.`;
    return `${ronda ? `Ronda ${ronda.n} de ${ronda.de}. ` : ''}Run, ${cuerpo}.`;
  }
  const entras = trasRoxzone ? `${p.nombre}.` : `Entras a ${p.nombre}.`;
  if (p.clase === 'amrap') return `${entras} AMRAP de ${dosisDicha(p)}.`;
  if (p.clase === 'estacion') {
    const cuerpo = [dosisDicha(p), cargaDicha(p), objetivoDicho(p)].filter(Boolean).join(' ');
    return `${entras} ${mayus(cuerpo)}.`;
  }
  return `${p.nombre ?? 'Calentamiento'}.`;
}

/**
 * Al cerrar un paso: su resultado. En el tramo de carrera es la voz de «cada
 * km» dentro del circuito («Run 3: 4:41.»); en la estación, su tiempo; en la
 * campana del AMRAP, las reps que se dijeron. Sin háptico propio: ya vibra lo
 * que empieza.
 */
export function vozResultado(p: PasoBase, x: Parcial, reps: number | null): string | null {
  if (p.clase === 'carrera') {
    const n = p.posicion?.ronda?.n;
    return `${n ? `Run ${n}` : 'Run'}: ${fmtReloj(x.segundos)}.`;
  }
  if (p.wod?.formato === 'puntuacion') return reps != null ? `${p.nombre}: ${reps} reps.` : null;
  if (p.clase === 'estacion') return `${p.nombre}: ${fmtReloj(x.segundos)}.`;
  return null;
}

/**
 * EL TRADUCTOR DEL CIRCUITO. En cada cambio de paso: el resultado del que se
 * cierra (su parcial, del motor) y la entrada al nuevo dicha en circuito. Los
 * demás eventos (acción, bloque, sesión, preaviso, avisos) pasan tal cual.
 * `reps(i)`: las reps dichas en la campana del paso `i`, si las hay.
 */
export function traductorCircuito(c: Circuito, reps: (i: number) => number | null): Traductor {
  return ({ antes, despues, eventos }) => {
    if (despues.i === antes.i && !despues.terminado) return eventos;
    const viejo = c.plan.pasos[antes.i]!;
    const parcial = despues.parciales.at(-1);
    const salida: Emitido[] = eventos.filter((x) => x.evento !== 'go' && x.evento !== 'recupera');
    const resultado = parcial ? vozResultado(viejo, parcial, reps(antes.i)) : null;
    if (resultado) salida.push({ evento: 'fin-serie', voz: resultado });
    if (despues.terminado) return salida;
    const nuevo = c.plan.pasos[despues.i]!;
    // El descanso, la Roxzone y la campana los dice el kit; la entrada a un paso de trabajo, el circuito.
    const delKit = eventos.find((x) => x.evento === 'go' || x.evento === 'recupera');
    if (nuevo.rol !== 'trabajo' && delKit) salida.push(delKit);
    else salida.push({ evento: 'go', voz: vozEntrada(nuevo, c, viejo.roxzone === 'entrada') });
    return salida;
  };
}
