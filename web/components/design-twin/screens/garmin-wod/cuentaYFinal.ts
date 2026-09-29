// EL 3-2-1, EL GO Y EL FINAL DEL WOD EN EL RELOJ GARMIN — funciones PURAS.
//
//   disponerCuentaWod  el 3-2-1 y el GO de un paso de WOD, con su tarea y su carga
//   disponerFinalWod   el crono congelado (For Time) o la puntuación (AMRAP)
//
// Van aparte de `caras.ts` (que las re-exporta) para que ningún fichero pase de
// 500 líneas. Las piezas comunes están en `piezas.ts`.
//
// Qué NO hacer: escribir un tamaño, un color o un umbral aquí (TG, CG y el plan).

import {
  AIRE,
  REJILLA,
  SELLO,
  TG,
  altoLinea,
  altoNota,
  caja,
  contextoSinPerder,
  heroeEn,
  lineaDePartes,
  lineaDeTexto,
  lineasContexto,
  type Disposicion,
  type LineaG,
} from '../../kit-garmin';
import {
  cargaTarea,
  fmtDuracion,
  fmtObjetivo,
  fmtReloj,
  posicionDe,
  principal,
  textoTarea,
  wodDe,
  type PasoBase,
} from '../../kit-reloj';
import { dialDe, marcadorDe, textoPuntuacion, type VistaWod } from './estado';

import { ALTO_NOTA, Y_TAREA, bajo, filaTarea } from './piezas';

// ---------------------------------------------------------------------------
// El 3-2-1 y el GO
// ---------------------------------------------------------------------------

/** ¿Tiene este paso su propia tarjeta de entrada (la tarea con su carga)? El resto usa la del kit. */
export function tieneCuentaPropia(p: PasoBase): boolean {
  const w = wodDe(p);
  if (!w) return false;
  return w.formato === 'emom' ? !w.tarea.corre : w.formato === 'amrap' || w.formato === 'pared' || (w.formato === 'fortime' && !!w.tarea);
}

/** El contexto de la tarjeta de entrada: dónde entras. */
function contextoDeEntrada(p: PasoBase): string[] {
  const w = wodDe(p);
  const ronda = p.posicion?.ronda;
  switch (w?.formato) {
    case 'emom':
      return posicionDe(p);
    case 'amrap':
      return [ronda ? `Ronda ${ronda.n}/${ronda.de}` : '', `AMRAP ${fmtDuracion(w.duracionS)}`].filter(Boolean);
    case 'fortime':
      return [ronda ? `Ronda ${ronda.n}/${ronda.de}` : 'For Time'];
    case 'pared':
      return [ronda ? `Ronda ${ronda.n}/${w.rondas}` : '', `${fmtDuracion(w.trabajoS)}/${fmtDuracion(w.descansoS)}`].filter(Boolean);
    default:
      return posicionDe(p);
  }
}

/** Lo que vas a hacer, con su carga: la tarea del EMOM, del For Time, del Tabata. */
function tareaDeEntrada(p: PasoBase): string | null {
  const w = wodDe(p);
  switch (w?.formato) {
    case 'emom':
      return textoTarea(w.tarea, w.ventanaS);
    case 'amrap':
      return w.tareas.length === 1 ? [w.tareas[0]!.nombre, cargaTarea(w.tareas[0]!)].filter(Boolean).join(' · ') : null;
    case 'fortime':
      return w.tarea ? textoTarea(w.tarea) : null;
    case 'pared': {
      const o = principal(p);
      return [p.nombre, o ? fmtObjetivo(o) : null].filter(Boolean).join(' · ') || null;
    }
    default:
      return null;
  }
}

/** EL 3-2-1 (n > 0) o el GO (0) de un paso de WOD: dónde entras, qué haces y con qué carga, y el número. */
export function disponerCuentaWod(n: number, paso: PasoBase, D: number): Disposicion {
  const lineas: LineaG[] = [...lineasContexto(contextoSinPerder(contextoDeEntrada(paso), D), D)];
  let y = bajo(lineas, D, REJILLA.heroe[0]);
  const tarea = tareaDeEntrada(paso);
  if (tarea) {
    const f = filaTarea('tarea', tarea, D, 'tinta2', y);
    lineas.push(...f.lineas);
    y = f.fin + AIRE.lineas;
  }
  return { D, lineas, heroe: heroeEn(n > 0 ? String(n) : 'GO', undefined, y, REJILLA.heroe[1], D), pista: null };
}

// ---------------------------------------------------------------------------
// El final: el crono congelado y la puntuación
// ---------------------------------------------------------------------------

/**
 * ¿Cerró el motor el último paso solo (o el atleta con BACK/LAP)? Terminar desde
 * Controles no lo cierra (no deja parcial del último paso): entonces no hay «tu
 * tiempo» que enseñar. Se mira el último parcial y no cuántos hay: un escenario
 * arranca a mitad del plan, sin los parciales de lo anterior.
 */
export const acabadoDelTodo = (v: VistaWod): boolean => v.estado.terminado && v.estado.parciales.at(-1)?.i === v.plan.pasos.length - 1;

/** ¿Tiene este final su propia cara? Un For Time (su crono) o un AMRAP suelto (su puntuación); el resto, la del kit. */
export function tieneFinalPropio(v: VistaWod): boolean {
  const ultimo = v.plan.pasos[v.plan.pasos.length - 1];
  const w = wodDe(ultimo);
  if (!acabadoDelTodo(v) || !ultimo) return false;
  return (w?.formato === 'fortime' && !!w.tarea) || (w?.formato === 'puntuacion' && !ultimo.posicion?.ronda);
}

/** «Tu tiempo» (For Time) o «Tu puntuación» (AMRAP): el sello, el número que se guarda y lo que dice de él. */
export function disponerFinalWod(v: VistaWod, D: number): Disposicion {
  const ultimo = v.plan.pasos[v.plan.pasos.length - 1]!;
  const w = wodDe(ultimo);
  const [, hC] = REJILLA.contexto;
  const sello = { y: (hC - SELLO / 2) * D, talla: SELLO * D };
  const y0 = REJILLA.heroe[0];
  const lineas: LineaG[] = [];
  let texto = fmtReloj(v.estado.sesionT);
  let unidad: string | undefined;
  let titulo = 'Tu tiempo';
  let dice = '';
  if (w?.formato === 'fortime') {
    const rondas = ultimo.posicion?.ronda?.de;
    dice = [rondas ? `${rondas} rondas` : null, w.capS != null ? (v.estado.sesionT <= w.capS ? `dentro del cap ${fmtReloj(w.capS)}` : `pasó el cap ${fmtReloj(w.capS)}`) : null].filter(Boolean).join(' · ');
  } else if (w?.formato === 'puntuacion') {
    const multi = w.tareas.length > 1;
    const d = dialDe(marcadorDe(v));
    titulo = 'Tu puntuación';
    texto = textoPuntuacion(d, multi);
    unidad = multi ? undefined : 'reps';
    dice = multi ? `AMRAP ${fmtDuracion(w.duracionS)}${d.reps == null ? ' · reps sin decir' : ''}` : `AMRAP ${fmtDuracion(w.duracionS)} · ${w.tareas[0]!.nombre}`;
  }
  lineas.push(...lineaDePartes('titulo', [titulo], TG.contexto, caja(y0, altoLinea(TG.contexto, 'texto')), D));
  const heroe = heroeEn(texto, unidad, bajo(lineas, D, y0), REJILLA.heroe[1], D);
  let fin: number = Y_TAREA;
  if (dice) {
    const f = filaTarea('resultado', dice, D);
    lineas.push(...f.lineas);
    fin = f.fin;
  }
  const yDetalle = Math.max(REJILLA.secundaria[0], fin + AIRE.lineas);
  lineas.push(...lineaDeTexto('detalle', 'Guardado en el reloj', TG.nota, D, { una: caja(yDetalle, ALTO_NOTA), arriba: caja(yDetalle, ALTO_NOTA), abajo: caja(yDetalle + altoNota, ALTO_NOTA) }, { tono: 'tinta2' }));
  return { D, lineas, heroe, pista: null, sello };
}
