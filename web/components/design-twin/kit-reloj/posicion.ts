// LA POSICIÓN EN PALABRAS Y LO QUE VIENE — funciones PURAS (I5.1, I5.6 del
// modelo del iPhone; P2 de la muñeca). El Swift las espeja.
//
//   posicionDe   la cabecera por partes: «Serie 3/6 · 1000 m», «Minuto 3/12»,
//                «Ronda 6» (AMRAP), «Descanso · 2′», «Ronda 2/8 · Roxzone».
//                La posición la da el modelo (Posicion anidada): una
//                recuperación nunca cuenta como serie.
//   textoViene   lo que viene, en corto, para «Luego ·» y «Viene:».
//   luegoDe      el siguiente paso y el «después» si lo que viene es recuperar.

import { cargaDelPlan } from './anotar';
import { esFuerza, fmtKg, quienSerie } from './fuerza';
import type { ExtraFamilia } from './metricas';
import { NOMBRE_CLASE_DEFECTO, type PasoBase } from './paso';
import { contextoDe, fmtPrescrito, nombreMaquinaCorto, principal, textoPasoCorto } from './reglas';
import { wodDe } from './tarea';

/**
 * LA POSICIÓN DE LA CABECERA, por partes y por prioridad (la cabecera quita
 * por el final si no cabe). Es `contextoDe` con lo que cada familia cuenta
 * distinto: el EMOM cuenta minutos, el AMRAP rondas que llevas, un descanso
 * dice cuánto dura y la Roxzone se nombra.
 */
export function posicionDe(p: PasoBase, x: ExtraFamilia = {}): string[] {
  const w = wodDe(p);
  const s = p.posicion?.serie;
  if (w?.formato === 'emom' && s) return [`${w.ventanaS === 60 ? 'Minuto' : 'Ventana'} ${s.n}/${s.de}`];
  if (w?.formato === 'amrap' && w.tareas.length > 1) return [x.rondas != null ? `Ronda ${x.rondas + 1}` : 'AMRAP'];
  if (w?.formato === 'puntuacion') return ['Puntuación'];
  if (p.clase === 'roxzone') return [...contextoDe(p), 'Roxzone'];
  if (p.rol === 'descanso' || p.rol === 'recuperacion') return [...contextoDe(p), fmtPrescrito(p.medida)].filter(Boolean);
  // Fuerza: el ejercicio delante (con su hueco de superserie si lo tiene) y la
  // serie k/K; las reps no, que ya son el héroe. Una serie por tiempo (una
  // plancha) sí dice su dosis: el héroe es lo que queda.
  if (p.rol === 'transicion' && p.clase === 'fuerza') return ['Colócate', fmtPrescrito(p.medida)].filter(Boolean);
  if (esFuerza(p) && p.rol === 'trabajo') {
    const quien = [p.posicion?.slot, p.nombre].filter(Boolean).join(' · ');
    const partes = [quien, quienSerie(p)].filter(Boolean);
    return p.medida.tipo === 'tiempo' ? [...partes, fmtPrescrito(p.medida)] : partes;
  }
  // El nombre de lo que haces es lo segundo más importante: va delante. Una
  // estación («Sled Push · Ronda 2/8 · Estación 2/8»), la máquina de un ergo o
  // un test («SkiErg · Serie 3/8 · 250 m») o el ejercicio de fuerza (A1 · …,
  // que `contextoDe` ya pone). Nunca «Ergo 3/8».
  const nombre = p.nombre ?? nombreMaquinaCorto(p.maquina);
  if (nombre && (p.clase === 'estacion' || p.clase === 'ergo' || p.clase === 'test' || p.clase === 'carrera')) {
    // La dosis de una estación ya va en la fila del trabajo: la cabecera no la repite.
    const dosis = fmtPrescrito(p.medida);
    const partes = contextoDe(p).filter((x) => !x.startsWith('Ergo') && !x.startsWith('Test') && !x.startsWith('Carrera') && !(p.clase === 'estacion' && x === dosis));
    const serie = p.posicion?.serie;
    if (p.clase !== 'estacion' && serie && !partes.some((x) => x.startsWith('Serie'))) partes.unshift(`Serie ${serie.n}/${serie.de}`);
    return [nombre, ...partes.filter((x) => x !== nombre)];
  }
  return contextoDe(p);
}

const MODO_RECUPERA = { trote: 'trote', andar: 'caminando', parado: 'parado' } as const;

/**
 * Lo que viene, en corto (para «Luego ·» y «Viene:»). Si abre una tanda o una
 * ronda nueva, lo dice con su tamaño: «Tanda 3/3 · 6 × 1′»; una recuperación
 * dice cómo se recupera: «Recupera 90″ trote»; una serie de fuerza, su dosis
 * con la carga que está en la barra si el atleta la declaró (`arrastrada`,
 * P11) o la que propone el plan: «A1 · Back Squat · 8 × 125 kg»; un
 * «Colócate» dice sus segundos; la Roxzone y la campana del AMRAP, su
 * nombre; si no, el paso: «1000 m a 3:45–3:55».
 */
export function textoViene(p: PasoBase, arrastrada: number | null = null): string {
  const pos = p.posicion;
  if (p.rol === 'recuperacion') return `Recupera ${textoPasoCorto(p)} ${MODO_RECUPERA[p.modoRecupera ?? 'trote']}`;
  if (p.clase === 'roxzone') return 'Roxzone';
  if (p.wod?.formato === 'puntuacion') return 'Puntuación';
  if (p.rol === 'transicion' && p.clase === 'fuerza') return `Colócate ${fmtPrescrito(p.medida)}`.trim();
  if (esFuerza(p) && p.rol === 'trabajo' && p.medida.tipo === 'reps') {
    const quien = [pos?.slot, p.nombre].filter(Boolean).join(' · ');
    const kg = p.fuerza.carga.tipo === 'corporal' ? null : (arrastrada ?? cargaDelPlan(p.fuerza));
    const reps = p.medida.prescrito ?? '—';
    return `${quien} · ${kg != null ? `${reps} × ${fmtKg(kg)}` : `${reps} reps`}`;
  }
  const corto = textoPasoCorto(p);
  if (pos?.tanda && pos.serie?.n === 1) return `Tanda ${pos.tanda.n}/${pos.tanda.de} · ${pos.serie.de} × ${corto}`;
  if (pos?.ronda && (pos.estacion?.n ?? 1) === 1) return `Ronda ${pos.ronda.n}/${pos.ronda.de} · ${corto}`;
  // Sin objetivo, lo prescrito solo dice poco («1′»): se dice cuál es.
  if (pos?.serie && !principal(p)) return `${p.wod?.formato === 'emom' ? 'Minuto' : NOMBRE_CLASE_DEFECTO[p.clase]} ${pos.serie.n}/${pos.serie.de} · ${corto}`;
  return corto;
}

/** Lo que viene, y lo de después si lo que viene es recuperar: «Recupera 90″ trote» · «1000 m a 3:45–3:55». */
export interface LuegoVista {
  que: string;
  despues: string | null;
}

/**
 * «Luego ·» del paso `i`: el siguiente paso con su objetivo y, si es una
 * recuperación, un descanso o una transición, también el trabajo que viene
 * detrás (I5: «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55»).
 * `null` si es el último paso. `cargaDe(j)`: la carga que está en la barra
 * para el paso `j` (la cascada de fuerza); sin ella, la del plan.
 */
export function luegoDe(pasos: ReadonlyArray<PasoBase>, i: number, cargaDe?: (j: number) => number | null): LuegoVista | null {
  const sig = pasos[i + 1];
  if (!sig) return null;
  const tras = pasos[i + 2];
  const despues = sig.rol !== 'trabajo' && tras && tras.rol === 'trabajo' ? textoViene(tras, cargaDe?.(i + 2) ?? null) : null;
  return { que: textoViene(sig, cargaDe?.(i + 1) ?? null), despues };
}
