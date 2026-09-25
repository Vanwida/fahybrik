// LA VOZ DEL WOD — lo que el kit todavía no sabe decir (Para el kit: `vozTarea`).
//
// El motor emite sus eventos con la voz de correr: al entrar en la ventana 3
// de un EMOM diría «EMOM 3 de 12. Un minuto.», que es la ventana y no la
// tarea. Aquí se reescribe la frase DESPUÉS de la transición, con el paso
// nuevo ya en la mano, y solo la frase: el evento, y por tanto el háptico,
// sigue siendo el del motor (P5: un evento, un háptico). Igual que en `voz.ts`:
// cantidades en cifra, cada frase sale del dato del paso.

import { NOMBRE_CLASE_DEFECTO, fmtRitmo, principal, vozInicio, type PasoBase, type Vuelta } from '../../kit-reloj';
import { wodDe, type Tarea } from './planes';

function tareaDicha(t: Tarea, ventanaS?: number): string {
  const carga = t.carga ? `, ${t.carga.kg} kilos` : '';
  if (!t.dosis || t.dosis.tipo === 'abierta') return ventanaS ? `${t.nombre}, ${ventanaS === 60 ? 'todo el minuto' : 'todo el intervalo'}` : t.nombre;
  const n = t.dosis.prescrito ?? 0;
  if (t.dosis.tipo === 'reps') return `${n} ${t.nombre}${carga}`;
  if (t.dosis.tipo === 'distancia') return `${t.nombre}, ${n} metros${carga}`;
  if (t.dosis.tipo === 'cal') return `${t.nombre}, ${n} calorías`;
  return `${t.nombre}${carga}`;
}

/** Al empezar un paso de trabajo (GO). `null` = la del kit sirve. */
export function vozGo(p: PasoBase): string | null {
  const w = wodDe(p);
  const pos = p.posicion;
  if (!w) return null;
  switch (w.formato) {
    case 'emom':
      return `${pos?.serie?.n ?? ''} de ${w.ventanas}. ${tareaDicha(w.tarea, w.ventanaS)}.`;
    case 'amrap':
      return `AMRAP, ${w.duracionS / 60} minutos. ${w.tareas.map((t) => tareaDicha(t)).join(', ')}.`;
    case 'fortime': {
      if (!w.tarea) return null;
      const ronda = pos?.ronda && pos.estacion?.n === 1 ? `Ronda ${pos.ronda.n} de ${pos.ronda.de}. ` : '';
      return `${ronda}${tareaDicha(w.tarea)}.`;
    }
    case 'pared':
      return `Ronda ${pos?.ronda?.n ?? ''} de ${w.rondas}.`;
    case 'ergo': {
      // La del kit con el nombre de la máquina y la posición: «SkiErg, 4 de 8. Doscientos cincuenta metros a 2:05 el quinientos.»
      const cuenta = pos?.serie ? `${pos.serie.n} de ${pos.serie.de}` : pos?.tramo ? `tramo ${pos.tramo.n} de ${pos.tramo.de}` : pos?.ronda ? `ronda ${pos.ronda.n} de ${pos.ronda.de}` : '';
      const frase = vozInicio({ ...p, posicion: undefined });
      return cuenta ? frase.replace(/^([^.]+)\./, `$1, ${cuenta}.`) : frase;
    }
    default:
      return null;
  }
}

/** Al empezar algo que no es trabajo (el `.stop`): la campana del AMRAP, el descanso del Tabata. */
export function vozPara(p: PasoBase): string | null {
  const w = wodDe(p);
  if (w?.formato === 'puntuacion') return w.tareas.length > 1 ? 'Tiempo. Rondas y repeticiones.' : `Tiempo. ¿Cuántas ${w.tareas[0]!.nombre}?`;
  if (w?.formato === 'pared') return 'Descanso.';
  return null;
}

/**
 * El resultado de una serie de ergo: a /500, el /500 medio y su veredicto (no
 * el tiempo en /km); a zona, el veredicto del pulso (el tiempo es lo prescrito
 * y no dice nada: «Tramo 2: dentro.»).
 */
export function vozFinErgo(p: PasoBase, v: Vuelta, juicio: string | null): string | null {
  const o = principal(p);
  if (wodDe(p)?.formato !== 'ergo' || !o) return null;
  const quien = p.posicion?.tramo ? 'Tramo' : 'Serie';
  if (o.eje === 'zona' || o.eje === 'ppm') {
    const dicho = v.veredicto === 'dentro' ? 'dentro' : v.veredicto === 'por-encima' ? 'pulso alto' : v.veredicto === 'por-debajo' ? 'pulso bajo' : null;
    return dicho ? `${quien} ${v.n}: ${dicho}.` : null;
  }
  if (o.eje !== 'split500' || v.metros == null || v.metros <= 0) return null;
  const s500 = (v.segundos * 500) / v.metros;
  return `${quien} ${v.n}: ${fmtRitmo(s500)} el quinientos${juicio ? `, ${juicio}` : ''}.`;
}

/** El aviso de deshacer de un cierre a mano, dicho con el nombre de la cosa. */
export function avisoWod(p: PasoBase): string {
  const w = wodDe(p);
  if (p.rol === 'recuperacion') return 'Recuperación cortada';
  if (p.rol === 'descanso') return 'Descanso cortado';
  if (w?.formato === 'puntuacion') return 'Puntuación guardada';
  if (w?.formato === 'emom') return `Minuto ${p.posicion?.serie?.n ?? ''} saltado`;
  if (w?.formato === 'amrap') return 'AMRAP cortado';
  if (w?.formato === 'ergo' && p.posicion?.serie) return `Serie ${p.posicion.serie.n} cerrada`;
  if (p.nombre) return `${p.nombre} hecho`;
  return `${NOMBRE_CLASE_DEFECTO[p.clase]} cerrado`;
}
