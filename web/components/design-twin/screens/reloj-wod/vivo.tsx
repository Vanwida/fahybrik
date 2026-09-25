'use client';

// EL VIVO DEL WOD — `VivoDePlan` del kit, con lo que el WOD necesita y el kit
// todavía no da (Para el kit):
//   · páginas de la corona POR FORMATO (AMRAP: Ronda → Tarea → Rondas → Datos);
//   · la acción del momento por formato: «hecho» en el EMOM (no cierra la
//     ventana: la convierte en respiro), «ronda hecha» en el AMRAP (suma), y
//     ninguna en el reloj de pared (manda el reloj);
//   · el estado propio del formato (tareas marcadas, rondas, la puntuación
//     dicha con la corona), con su deshacer de 5 s;
//   · la voz de la tarea (voces.ts) sobre el MISMO evento del motor;
//   · el aviso contra el /500: el motor no lleva el split del PM5 a sus
//     lecturas, así que aquí se juzga con SUS reglas (`decidirAviso`, holgura
//     y cadencia del coach) y se emite por SU vocabulario.
// Todo lo demás es el kit tal cual: el motor, la carcasa, el aro, el 3-2-1, el
// GO, el aviso del km, Recupera y Descanso.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AVISO_INICIAL,
  AroSesion,
  AvisoVuelta,
  bandaDe,
  Descanso,
  Muneca,
  PasoCorrer,
  Recupera,
  TresDosUno,
  decidirAviso,
  holguraDe,
  palabraVeredicto,
  principal,
  tinteDelPaso,
  useEventos,
  useSecuencia,
  veredictoDe,
  type AccionPrimaria,
  type EstadoAviso,
  type EventoVivo,
  type Eventos,
  type InicioSecuencia,
  type Lecturas,
  type ModeloReloj,
  type Objetivo,
  type MunecaProps,
  type PaginaVivo,
  type PasoBase,
  type PlanSesion,
  type Secuencia,
  type Simulador,
  type Veredicto,
  type Vuelta,
} from '../../kit-reloj';
import { wodDe } from './planes';
import { avisoWod, vozFinErgo, vozGo, vozPara } from './voces';

// ---------------------------------------------------------------------------
// El estado del formato
// ---------------------------------------------------------------------------

export interface Dial {
  rondas: number;
  /** Reps sueltas (con rondas) o reps totales; `null` = sin declarar, nunca 0. */
  reps: number | null;
}

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
  /** La corona sobre la puntuación. */
  girar: (dir: 1 | -1) => void;
  anterior: PasoBase | null;
  /** La puntuación del paso de puntuación en curso (con sus rondas de partida). */
  dial: Dial | null;
}

// ---------------------------------------------------------------------------
// Las lecturas del ergómetro: el PM5 da el /500 (el motor lo lleva como ritmo por km)
// ---------------------------------------------------------------------------

/** ¿Lo mide un ergómetro (PM5)? Entonces el ritmo del motor es su /500 × 2. */
export const esErgo = (p: PasoBase) => !!p.maquina && p.maquina.tipo !== 'cinta' && p.maquina.tipo !== 'bici';

export function lecturasErgo(p: PasoBase, l: Lecturas): Lecturas {
  if (!esErgo(p)) return l;
  return { ...l, split500: l.ritmo != null ? l.ritmo / 2 : null, ritmo: null };
}

/** El /500 medio de una vuelta del motor. */
export function splitDe(v: Vuelta): number | null {
  return v.metros != null && v.metros > 0 ? (v.segundos * 500) / v.metros : null;
}

/**
 * El veredicto de una serie de ergo, con la MISMA banda que se pinta: un
 * objetivo de valor único («@2:05») se juzga con la holgura del coach como
 * banda (`bandaDe`), no al segundo — si no, 2:04 bajo una banda que dice
 * «dentro» se cantaría «rápida».
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
  inicial?: MunecaProps['inicial'];
  guion?: MunecaProps['guion'];
  modelo?: ModeloReloj;
  onLog: (linea: string) => void;
}

function porId(plan: PlanSesion, porIndice: Record<number, number> | undefined): Record<string, number>;
function porId(plan: PlanSesion, porIndice: Record<number, number[]> | undefined): Record<string, number[]>;
function porId<T>(plan: PlanSesion, porIndice: Record<number, T> | undefined): Record<string, T> {
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(porIndice ?? {})) {
    const p = plan.pasos[Number(k)];
    if (p) r[p.id] = v;
  }
  return r;
}

export function VivoWod(p: VivoWodProps) {
  const ev = useEventos(p.onLog);
  // Los eventos del motor pasan por aquí: se guardan y salen tras el render,
  // con el paso nuevo ya pintado, para poner la frase de la tarea.
  const cola = useRef<Array<{ evento: EventoVivo; voz?: string }>>([]);
  const [motor] = useState<Eventos>(() => ({ ultimo: null, emitir: (evento, voz) => void cola.current.push({ evento, voz }) }));
  const seq = useSecuencia(p.plan, p.sim, p.inicio, motor);
  const { paso, lecturas, estado } = seq;
  const zonas = p.plan.zonas;

  const [wod, setWod] = useState<EstadoWod>(() => ({
    hechas: porId(p.plan, p.wodInicial?.hechas),
    rondas: porId(p.plan, p.wodInicial?.rondas),
    dial: {},
  }));

  // Tras cada render: la voz de la tarea sobre el evento del motor.
  useEffect(() => {
    if (cola.current.length === 0) return;
    const lote = cola.current;
    cola.current = [];
    for (const { evento, voz } of lote) {
      let frase = voz;
      if (evento === 'go') frase = vozGo(seq.paso) ?? voz;
      else if (evento === 'recupera') frase = vozPara(seq.paso) ?? voz;
      else if (evento === 'fin-serie') {
        const cerrado = p.plan.pasos[seq.estado.i - 1];
        const v = seq.estado.vueltas.at(-1);
        const o = cerrado ? principal(cerrado) : null;
        const s = v ? splitDe(v) : null;
        const ver = o && s != null ? veredictoSerie(o, s, p.plan) : null;
        const juicio = ver ? juicioSplit(ver) : null;
        frase = (cerrado && v ? vozFinErgo(cerrado, v, juicio) : null) ?? voz;
      }
      ev.emitir(evento, frase);
    }
  });

  // El aviso contra el /500, con las reglas del coach (el motor no ve el split).
  const aviso = useRef<{ id: string; estado: EstadoAviso }>({ id: '', estado: AVISO_INICIAL });
  const t = lecturas.t;
  useEffect(() => {
    const o = principal(paso);
    if (!o || o.eje !== 'split500' || paso.rol !== 'trabajo' || seq.pausado || estado.terminado) return;
    if (aviso.current.id !== paso.id) aviso.current = { id: paso.id, estado: AVISO_INICIAL };
    const s = lecturasErgo(paso, lecturas).split500 ?? null;
    const ver = s == null ? null : veredictoDe(o, s, holguraDe('split500', p.plan.reglas), zonas);
    const d = decidirAviso(aviso.current.estado, ver, t, paso, o.eje, p.plan.reglas);
    aviso.current.estado = d.estado;
    if (d.evento) ev.emitir(d.evento);
    // Un juicio por segundo del paso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, paso.id]);

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
  const dial: Dial | null =
    w?.formato === 'puntuacion'
      ? (wod.dial[paso.id] ?? { rondas: anterior ? (wod.rondas[anterior.id]?.length ?? 0) : 0, reps: null })
      : null;
  // Funcional: varios pasos de corona en un mismo evento (un giro rápido) se suman todos.
  const girar = (dir: 1 | -1) => {
    if (w?.formato !== 'puntuacion') return;
    const id = paso.id;
    const previo = anterior?.id;
    const porRonda = w.tareas.length > 1 ? w.tareas.reduce((a, x) => a + (x.dosis?.prescrito ?? 0), 0) : 0;
    setWod((x) => {
      let { rondas, reps } = x.dial[id] ?? { rondas: previo ? (x.rondas[previo]?.length ?? 0) : 0, reps: null };
      if (reps == null) reps = dir > 0 ? 1 : 0;
      else reps += dir;
      // Con rondas, las reps sueltas llevan: pasar de 29 a 30 es una ronda más.
      if (porRonda > 0 && reps >= porRonda) {
        rondas += 1;
        reps -= porRonda;
      } else if (porRonda > 0 && reps < 0 && rondas > 0) {
        rondas -= 1;
        reps += porRonda;
      }
      return { ...x, dial: { ...x.dial, [id]: { rondas, reps: Math.max(0, reps) } } };
    });
  };

  const aviso5 = avisoWod(paso);
  const cerrar = { hacer: seq.cerrar, deshacer: { aviso: aviso5, hacer: seq.deshacer } };
  let accion: AccionPrimaria | null;
  if (estado.terminado) accion = null;
  else if (w?.formato === 'emom') {
    const id = paso.id;
    accion =
      w.tarea.dosis && wod.hechas[id] == null
        ? { etiqueta: 'hecho', hacer: () => marcar(id, t), deshacer: { aviso: `${w.tarea.nombre} hecho`, hacer: () => desmarcar(id) } }
        : null;
  } else if (w?.formato === 'amrap') {
    const id = paso.id;
    const n = (wod.rondas[id]?.length ?? 0) + 1;
    accion =
      w.tareas.length > 1
        ? { etiqueta: 'ronda hecha', hacer: () => anotar(id, t), deshacer: { aviso: `Ronda ${n} anotada`, hacer: () => quitar(id) } }
        : null;
  } else if (w?.formato === 'puntuacion') accion = { etiqueta: 'guardar', ...cerrar };
  else if (w?.formato === 'pared') accion = null;
  else if (paso.rol !== 'trabajo') accion = { etiqueta: 'empezar ya', ...cerrar };
  else if (paso.cierre === 'atleta') accion = { etiqueta: w?.formato === 'ergo' ? 'serie hecha' : 'hecho', ...cerrar };
  else accion = { etiqueta: 'siguiente paso', ...cerrar };

  const v: Vivo = { seq, plan: p.plan, wod, accion, girar, anterior, dial };

  const propia = estado.terminado ? (p.final?.(v) ?? null) : p.cara(v);
  const cara =
    propia ??
    (paso.rol === 'recuperacion' ? (
      <Recupera paso={paso} lecturas={lecturas} zonas={zonas} />
    ) : paso.rol === 'descanso' ? (
      <Descanso paso={paso} lecturas={lecturas} onMas30={seq.sumar30} />
    ) : (
      <PasoCorrer paso={paso} lecturas={lecturas} zonas={zonas} />
    ));

  const capa =
    seq.cuenta != null && paso.siguiente ? (
      <TresDosUno n={seq.cuenta} paso={paso.siguiente} />
    ) : seq.go ? (
      <TresDosUno n={0} paso={paso} />
    ) : estado.banner ? (
      <AvisoVuelta titulo={estado.banner.titulo} valor={estado.banner.valor} pie={estado.banner.pie} />
    ) : null;

  // El aro es la sesión; la puntuación no es un tramo del coach y no ocupa aro.
  const visibles = p.plan.pasos.filter((x) => x.rol !== 'transicion');
  const iAro = visibles.findIndex((x) => x.id === paso.id);
  const antesDe = p.plan.pasos.slice(0, estado.i).filter((x) => x.rol !== 'transicion').length;
  // En la puntuación, el aro enseña el AMRAP que acaba de terminar, lleno.
  const previo = visibles[Math.max(0, antesDe - 1)]!;
  const aro =
    iAro >= 0 ? (
      <AroSesion pasos={visibles} i={iAro} paso={paso} lecturas={lecturas} />
    ) : (
      <AroSesion pasos={visibles} i={Math.max(0, antesDe - 1)} paso={previo} lecturas={{ ...lecturas, t: previo.medida.prescrito ?? 0, hecho: previo.medida.prescrito }} />
    );

  return (
    <Muneca
      paginas={p.paginas(v, cara)}
      aro={aro}
      tinte={tinteDelPaso(paso, lecturas, zonas)}
      capa={estado.terminado ? null : capa}
      pausado={seq.pausado}
      onPausa={seq.pausar}
      siguiente={{ etiqueta: 'Siguiente paso', icono: 'siguiente', onPulsa: seq.cerrar, deshacer: { aviso: aviso5, hacer: seq.deshacer } }}
      onTerminar={seq.terminar}
      completada={estado.terminado && !p.final}
      accion={accion}
      eventos={ev}
      alPaso={paso.id}
      inicial={p.inicial}
      guion={p.guion}
      modelo={p.modelo}
      onLog={p.onLog}
    />
  );
}

/** «rápida», «lenta», «dentro» — el juicio de una serie de ergo, dicho. */
function juicioSplit(v: Veredicto): string {
  const w = palabraVeredicto('split500', v);
  return w.texto === 'rápido' ? 'rápida' : w.texto === 'lento' ? 'lenta' : w.texto;
}
