// LA VOZ DEL CIRCUITO — lo que el reloj dice a los auriculares al cambiar de
// paso (P5, Alex 25-09), sacado del dato del paso y nunca de un texto a mano.
// Convención del kit: los metros en letra, los tiempos y las reps en cifra.
//
//   Tramo:     «Ronda 3 de 5. Run, mil metros a RPE 8.» · «Run 4 de 8. Mil metros.»
//   Estación:  «Entras a Sled Push. Cincuenta metros con 152 kilos.»
//   Roxzone:   «Roxzone. Entras a Wall Balls.»
//   Resultado: «Run 3: 4:41.» — el tramo de carrera es el km, y esta es su voz.

import { enLetras, fmtReloj, num, principal, type PasoBase } from '../../kit-reloj';
import { sentidoRoxzone, type Circuito } from './planes';
import type { Parcial } from './motor';

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

/** Al entrar a la Roxzone de entrada: a qué estación vas. La de salida no habla (vibra el toque). */
export function vozRoxzone(p: PasoBase, siguiente: PasoBase | null): string | undefined {
  if (sentidoRoxzone(p) !== 'entrada' || !siguiente) return undefined;
  return `Roxzone. Entras a ${siguiente.nombre}.`;
}

/**
 * Al cerrar un paso de trabajo: su resultado. En el tramo de carrera es la voz
 * de «cada km» dentro del circuito («Run 3: 4:41.»); en la estación, su tiempo;
 * en el AMRAP, sus reps. Sin háptico propio: ya vibra lo que empieza.
 */
export function vozResultado(p: PasoBase, x: Parcial): string | null {
  if (p.clase === 'carrera') {
    const n = p.posicion?.ronda?.n;
    return `${n ? `Run ${n}` : 'Run'}: ${fmtReloj(x.segundos)}.`;
  }
  if (p.clase === 'amrap') return x.reps != null ? `${p.nombre}: ${x.reps} reps.` : null;
  if (p.clase === 'estacion') return `${p.nombre}: ${fmtReloj(x.segundos)}.`;
  return null;
}
