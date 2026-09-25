'use client';

// EL VIVO DEL WOD — `useVivo` + `VistaVivo` del kit, configurados. Lo único
// que el WOD pone encima es su ESTADO del formato y lo que sale de él:
//   · las tareas marcadas del EMOM, las rondas del AMRAP y la puntuación
//     dicha con la corona en la campana, con su deshacer de 5 s;
//   · la acción del momento por formato: «hecho» en el EMOM (no cierra la
//     ventana: la convierte en respiro), «ronda hecha» en el AMRAP (suma),
//     «guardar» en la campana y ninguna en el reloj de pared (manda el reloj);
//   · las páginas de la corona por formato y la cara final del For Time;
//   · el aro sin la campana (no es un tramo del coach).
// Todo lo demás es el kit tal cual: el motor (que ya juzga el /500 del PM5 y
// avisa contra él), la voz de la tarea, la carcasa, el aro, el 3-2-1, el GO,
// el aviso del km, Recupera y Descanso.

import { useState, type ReactNode } from 'react';
import {
  AroSesion,
  VistaVivo,
  bandaDe,
  girarDial,
  holguraDe,
  repsPorRonda,
  useVivo,
  wodDe,
  type AccionPrimaria,
  type Dial,
  type GestoGuion,
  type InicioSecuencia,
  type ModeloReloj,
  type Objetivo,
  type PaginaVivo,
  type PasoBase,
  type PlanSesion,
  type Secuencia,
  type Simulador,
  type Veredicto,
  type Vuelta,
} from '../../kit-reloj';

// ---------------------------------------------------------------------------
// El estado del formato
// ---------------------------------------------------------------------------

export interface EstadoWod {
  /** EMOM: segundo de la ventana en que se marcó la tarea, por id de paso. */
  hechas: Record<string, number>;
  /** AMRAP: segundo de la ventana en que se cerró cada ronda, por id de paso. */
  rondas: Record<string, number[]>;
  /** La puntuación dicha con la corona, por id del paso de puntuación. */
  dial: Record<string, Dial>;
}

/** El estado de partida de un escenario, por ÍNDICE de paso (los ids se generan). */
export interface WodInicial {
  hechas?: Record<number, number>;
  rondas?: Record<number, number[]>;
}

export interface Vivo {
  seq: Secuencia;
  plan: PlanSesion;
  wod: EstadoWod;
  /** La acción del momento (para la pista «doble toque · …»), o null. */
  accion: AccionPrimaria | null;
  anterior: PasoBase | null;
  /** La puntuación del paso de puntuación en curso (con sus rondas de partida). */
  dial: Dial | null;
}

// ---------------------------------------------------------------------------
// El ergómetro
// ---------------------------------------------------------------------------

/** ¿Lo mide un ergómetro con PM5 (remo, SkiErg)? La bici y la cinta no dan /500. */
export const esErgo = (p: PasoBase) => !!p.maquina && p.maquina.tipo !== 'cinta' && p.maquina.tipo !== 'bici';

/** El /500 medio de una vuelta del motor. */
export function splitDe(v: Vuelta): number | null {
  return v.metros != null && v.metros > 0 ? (v.segundos * 500) / v.metros : null;
}

/**
 * El veredicto de una serie de ergo en la página Series, con la MISMA banda
 * que se pinta (`bandaDe`, holgura del coach): también el de las series del
 * historial con que arranca el escenario, que el motor no cerró.
 */
export function veredictoSerie(o: Objetivo, s: number, plan: PlanSesion): Veredicto | null {
  return bandaDe(o, s, plan.zonas, holguraDe(o.eje, plan.reglas))?.veredicto ?? null;
}

// ---------------------------------------------------------------------------
// El vivo
// ---------------------------------------------------------------------------

export interface VivoWodProps {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  wodInicial?: WodInicial;
  /** La cara del paso; `null` = la del kit (correr, Recupera, Descanso). */
  cara: (v: Vivo) => ReactNode | null;
  /** Las páginas de la corona; la primera es la cara. */
  paginas: (v: Vivo, cara: ReactNode) => PaginaVivo[];
  /** La cara al acabar (el For Time congela su crono = la puntuación). */
  final?: (v: Vivo) => ReactNode | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  modelo?: ModeloReloj;
  onLog: (linea: string) => void;
}

function porId<T>(plan: PlanSesion, porIndice: Record<number, T> | undefined): Record<string, T> {
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(porIndice ?? {})) {
    const p = plan.pasos[Number(k)];
    if (p) r[p.id] = v;
  }
  return r;
}

export function VivoWod(p: VivoWodProps) {
  const { seq, eventos: ev } = useVivo(p.plan, p.sim, p.inicio, { onLog: p.onLog });
  const { paso, estado } = seq;
  const t = seq.lecturas.t;

  const [wod, setWod] = useState<EstadoWod>(() => ({
    hechas: porId(p.plan, p.wodInicial?.hechas),
    rondas: porId(p.plan, p.wodInicial?.rondas),
    dial: {},
  }));

  // --- las acciones del formato ---
  const marcar = (id: string, s: number) => {
    setWod((w) => ({ ...w, hechas: { ...w.hechas, [id]: s } }));
    ev.emitir('accion');
  };
  const desmarcar = (id: string) => {
    setWod((w) => {
      const hechas = { ...w.hechas };
      delete hechas[id];
      return { ...w, hechas };
    });
    ev.emitir('accion');
  };
  const anotar = (id: string, s: number) => {
    setWod((w) => ({ ...w, rondas: { ...w.rondas, [id]: [...(w.rondas[id] ?? []), s] } }));
    ev.emitir('accion');
  };
  const quitar = (id: string) => {
    setWod((w) => ({ ...w, rondas: { ...w.rondas, [id]: (w.rondas[id] ?? []).slice(0, -1) } }));
    ev.emitir('accion');
  };

  const anterior = p.plan.pasos[estado.i - 1] ?? null;
  const w = wodDe(paso);
  const dialDe = (x: EstadoWod): Dial => x.dial[paso.id] ?? { rondas: anterior ? (x.rondas[anterior.id]?.length ?? 0) : 0, reps: null };
  const dial: Dial | null = w?.formato === 'puntuacion' ? dialDe(wod) : null;
  // La corona en la campana: arriba es «más». Funcional: varios pasos de
  // corona en un mismo evento (un giro rápido) se suman todos.
  const corona = (dir: 1 | -1): boolean => {
    if (w?.formato !== 'puntuacion') return false;
    const porRonda = w.tareas.length > 1 ? repsPorRonda(w.tareas) : 0;
    const mas = dir === 1 ? -1 : 1;
    setWod((x) => ({ ...x, dial: { ...x.dial, [paso.id]: girarDial(dialDe(x), mas, porRonda) } }));
    return true;
  };

  const accion = (_s: Secuencia, kit: AccionPrimaria | null): AccionPrimaria | null => {
    if (estado.terminado) return null;
    if (w?.formato === 'emom') {
      const id = paso.id;
      return w.tarea.dosis && wod.hechas[id] == null
        ? { etiqueta: 'hecho', hacer: () => marcar(id, t), deshacer: { aviso: `${w.tarea.nombre} hecho`, hacer: () => desmarcar(id) } }
        : null;
    }
    if (w?.formato === 'amrap') {
      const id = paso.id;
      const n = (wod.rondas[id]?.length ?? 0) + 1;
      return w.tareas.length > 1
        ? { etiqueta: 'ronda hecha', hacer: () => anotar(id, t), deshacer: { aviso: `Ronda ${n} anotada`, hacer: () => quitar(id) } }
        : null;
    }
    if (!kit) return null;
    if (w?.formato === 'puntuacion') return { ...kit, etiqueta: 'guardar' };
    if (w?.formato === 'pared') return null;
    if (paso.rol === 'trabajo' && paso.cierre === 'atleta') return { ...kit, etiqueta: paso.clase === 'ergo' ? 'serie hecha' : 'hecho' };
    return kit;
  };

  // Las caras solo leen si hay acción y cómo se llama (la pista «doble toque ·
  // …»); la que se ejecuta, con su deshacer, la monta `VistaVivo` con esta regla.
  const pista = estado.terminado ? null : { etiqueta: paso.rol !== 'trabajo' ? 'empezar ya' : 'siguiente paso', hacer: seq.cerrar };
  const v: Vivo = { seq, plan: p.plan, wod, accion: accion(seq, pista), anterior, dial };

  // El aro es la sesión; la puntuación no es un tramo del coach y no ocupa aro.
  const aro = () => {
    const visibles = p.plan.pasos.filter((x) => x.rol !== 'transicion');
    const iAro = visibles.findIndex((x) => x.id === paso.id);
    const antesDe = p.plan.pasos.slice(0, estado.i).filter((x) => x.rol !== 'transicion').length;
    if (iAro >= 0) return <AroSesion pasos={visibles} i={iAro} paso={paso} lecturas={seq.lecturas} />;
    // En la puntuación, el aro enseña el AMRAP que acaba de terminar, lleno.
    const previo = visibles[Math.max(0, antesDe - 1)]!;
    return <AroSesion pasos={visibles} i={Math.max(0, antesDe - 1)} paso={previo} lecturas={{ ...seq.lecturas, t: previo.medida.prescrito ?? 0, hecho: previo.medida.prescrito }} />;
  };

  return (
    <VistaVivo
      seq={seq}
      eventos={ev}
      cara={() => p.cara(v)}
      paginas={(_s, cara) => p.paginas(v, cara)}
      accion={accion}
      corona={(_s, dir) => corona(dir)}
      aro={aro}
      final={p.final ? () => p.final!(v) : undefined}
      guion={p.guion}
      modelo={p.modelo}
      onLog={p.onLog}
    />
  );
}
