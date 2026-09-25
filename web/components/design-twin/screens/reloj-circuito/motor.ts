'use client';

// EL MOTOR DEL CIRCUITO — el motor puro del kit (`avanzar`/`cerrar`) y, encima,
// lo que un circuito necesita y el kit aún no hace (P10):
//
//   · UNA VUELTA POR PASO: cada tramo de carrera, cada estación y cada mitad de
//     Roxzone deja su parcial (segundos, metros si alguien los midió, pulso,
//     reps). Hoy el circuito se pliega en un segmento: una vuelta con un ritmo
//     mezclado (9:30/km cuando se corrió a 4:50).
//   · LA ROXZONE DE SALIDA se cierra sola cuando la muñeca ve que vuelves a
//     correr (ritmo más rápido que `RITMO_CORRER_S` durante `SEGUIDOS_S`). Es
//     mecanismo nuestro, no método del coach — y está A VALIDAR EN APARATO.
//   · LOS EVENTOS DEL CAMBIO DE PASO se dicen en circuito: «Run 3: 4:41.
//     Roxzone, entras a Sled Pull.» En carrera todo cambio de paso es
//     `.start×2`; solo el descanso es `.stop` (el vocabulario del §4, sin uno nuevo).
//   · LAS REPS DEL AMRAP, declaradas con la corona.
//   · «ENTRAS A…»: la capa de llegada a una estación cuando no hay Roxzone que la anuncie.

import { useEffect, useRef, useState } from 'react';
import {
  avanzar,
  cerrar,
  cuentaDe,
  estadoInicial,
  faltaDe,
  lecturasDe,
  pasoVivo,
  vozDescanso,
  type EstadoSecuencia,
  type EventoVivo,
  type Eventos,
  type InicioSecuencia,
  type Lecturas,
  type Paso,
  type Simulador,
} from '../../kit-reloj';
import { esEstacion, sentidoRoxzone, type Circuito } from './planes';
import { vozEntrada, vozResultado, vozRoxzone } from './voz';

/** Más rápido que 8:00/km es correr, no andar hacia la salida. Mecanismo, no método. */
export const RITMO_CORRER_S = 480;
/** Segundos seguidos corriendo antes de dar la Roxzone por cerrada (que un trote de dos pasos no la cierre). */
export const SEGUIDOS_S = 3;
/** Lo que dura la capa «Entras a…». */
const ENTRAS_S = 3;

export interface Parcial {
  i: number;
  segundos: number;
  /** Metros de ESTE paso si alguien los midió (GPS, PM5); si no, null. */
  metros: number | null;
  ppm: number | null;
  reps: number | null;
}

export interface EstadoCircuito {
  s: EstadoSecuencia;
  parciales: Parcial[];
  /** Dónde empezó el paso en curso, en la sesión. */
  desdeT: number;
  desdeM: number;
  ppmSuma: number;
  ppmN: number;
  /** Reps declaradas por paso (AMRAP), por índice. */
  reps: Record<number, number>;
  /** Segundos seguidos corriendo en la Roxzone de salida. */
  corriendo: number;
  entrasHasta: number;
}

export interface InicioCircuito extends InicioSecuencia {
  /** Los pasos ya hechos, con su parcial. `sesionT` y `sesionM` salen de aquí. */
  parciales: Parcial[];
  reps?: Record<number, number>;
}

type Emitido = { evento: EventoVivo; voz?: string };

function inicial(c: Circuito, sim: Simulador, ini: InicioCircuito): EstadoCircuito {
  const antesT = ini.parciales.reduce((a, x) => a + x.segundos, 0);
  const antesM = ini.parciales.reduce((a, x) => a + (x.metros ?? 0), 0);
  const t = ini.t ?? 0;
  const s0 = estadoInicial(c.plan, sim, { ...ini, sesionT: antesT + t, sesionM: antesM + (ini.metros ?? 0) });
  // Si el escenario arranca ya dentro del preaviso, ese preaviso ya sonó: no se repite con otra cifra.
  const p = c.plan.pasos[ini.i]!;
  const f = faltaDe(p, lecturasDe(p, s0));
  const r = c.plan.reglas;
  const ya = f != null && ((p.medida.tipo === 'distancia' && f <= r.preavisoM) || (p.medida.tipo === 'tiempo' && f <= r.preavisoS));
  const s = { ...s0, preavisado: ya };
  return { s, parciales: ini.parciales, desdeT: antesT, desdeM: antesM, ppmSuma: 0, ppmN: 0, reps: ini.reps ?? {}, corriendo: 0, entrasHasta: 0 };
}

/**
 * El paso cambió (o la sesión acabó): deja el parcial del que se cierra y
 * traduce los eventos del kit al circuito. Los de cambio de paso del kit
 * (`go`, `recupera` con sus voces) se sustituyen; el resto (acción, bloque,
 * sesión, preaviso…) pasa tal cual.
 */
function alCambiar(antes: EstadoCircuito, s: EstadoSecuencia, eventos: Emitido[], c: Circuito): { e: EstadoCircuito; eventos: Emitido[] } {
  const viejo = c.plan.pasos[antes.s.i]!;
  const midio = viejo.medida.tipo === 'distancia' && viejo.medida.mide !== 'atleta';
  const parcial: Parcial = {
    i: antes.s.i,
    segundos: s.sesionT - antes.desdeT,
    metros: midio ? Math.round(s.sesionM - antes.desdeM) : null,
    ppm: antes.ppmN > 0 ? Math.round(antes.ppmSuma / antes.ppmN) : null,
    reps: antes.reps[antes.s.i] ?? null,
  };
  const salida: Emitido[] = eventos.filter((x) => x.evento !== 'go' && x.evento !== 'recupera');
  const resultado = vozResultado(viejo, parcial);
  if (resultado) salida.push({ evento: 'fin-serie', voz: resultado });

  const nuevo = s.terminado ? null : c.plan.pasos[s.i]!;
  let entrasHasta = 0;
  if (nuevo) {
    if (nuevo.rol === 'descanso') salida.push({ evento: 'recupera', voz: vozDescanso(nuevo) });
    else if (nuevo.clase === 'roxzone') salida.push({ evento: 'go', voz: vozRoxzone(nuevo, c.plan.pasos[s.i + 1] ?? null) });
    else salida.push({ evento: 'go', voz: vozEntrada(nuevo, c, sentidoRoxzone(viejo) === 'entrada') });
    // «Entras a…» cuando nada lo ha anunciado: ni una Roxzone de entrada ni el GO de un descanso.
    const anunciado = sentidoRoxzone(viejo) === 'entrada' || s.goHasta > s.sesionT;
    if (esEstacion(nuevo) && !anunciado) entrasHasta = s.sesionT + ENTRAS_S;
  }
  return {
    e: { ...antes, s, parciales: [...antes.parciales, parcial], desdeT: s.sesionT, desdeM: s.sesionM, ppmSuma: 0, ppmN: 0, corriendo: 0, entrasHasta },
    eventos: salida,
  };
}

/** Un segundo de circuito. */
export function tic(e: EstadoCircuito, c: Circuito, sim: Simulador): { e: EstadoCircuito; eventos: Emitido[] } {
  if (e.s.terminado) return { e, eventos: [] };
  const r = avanzar(e.s, c.plan, sim);
  let s = r.estado;
  let eventos: Emitido[] = r.eventos;
  const ppm = r.estado.lect.ppm;
  let n: EstadoCircuito = { ...e, ppmSuma: e.ppmSuma + (ppm ?? 0), ppmN: e.ppmN + (ppm != null ? 1 : 0) };

  // La Roxzone de salida: se cierra al volver a correr (detección de la muñeca).
  const p = c.plan.pasos[s.i]!;
  if (s.i === e.s.i && sentidoRoxzone(p) === 'salida' && p.medida.mide === 'sensor') {
    const corre = s.lect.ritmo != null && s.lect.ritmo <= RITMO_CORRER_S;
    n = { ...n, corriendo: corre ? n.corriendo + 1 : 0 };
    if (n.corriendo >= SEGUIDOS_S) {
      const k = cerrar(s, c.plan, 'medida');
      s = k.estado;
      eventos = [...eventos, ...k.eventos];
    }
  }

  if (s.i !== e.s.i || s.terminado) return alCambiar(n, s, eventos, c);
  return { e: { ...n, s }, eventos };
}

// ---------------------------------------------------------------------------
// El gancho
// ---------------------------------------------------------------------------

export interface MotorCircuito {
  e: EstadoCircuito;
  paso: Paso;
  lecturas: Lecturas;
  /** El crono total (la puntuación): desde el primer paso del circuito. `null` = aún en el calentamiento. */
  total: number | null;
  cuenta: number | null;
  go: boolean;
  entras: boolean;
  pausado: boolean;
  pausar: (si: boolean) => void;
  cerrar: () => void;
  deshacer: () => void;
  sumar30: () => void;
  sumarReps: (d: number) => number;
  terminar: () => void;
}

export function totalDe(e: EstadoCircuito, c: Circuito): number | null {
  if (e.s.i < c.inicio) return null;
  const antes = e.parciales.filter((x) => x.i < c.inicio).reduce((a, x) => a + x.segundos, 0);
  return e.s.sesionT - antes;
}

export function useCircuito(c: Circuito, sim: Simulador, ini: InicioCircuito, eventos: Eventos): MotorCircuito {
  const [e, setE] = useState(() => inicial(c, sim, ini));
  const [pausado, setPausado] = useState(ini.pausado ?? false);
  const ultimo = useRef(e);
  const antes = useRef<EstadoCircuito | null>(null);
  useEffect(() => {
    ultimo.current = e;
  });

  const aplicar = (x: EstadoCircuito, ev: Emitido[] = []) => {
    ultimo.current = x;
    setE(x);
    ev.forEach((y) => eventos.emitir(y.evento, y.voz));
  };

  const corre = !pausado && !e.s.terminado;
  // El guion es fijo por montaje y `aplicar` solo toca refs y el setter.
  useEffect(() => {
    if (!corre) return;
    const h = setInterval(() => {
      const r = tic(ultimo.current, c, sim);
      aplicar(r.e, r.eventos);
    }, 1000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corre]);

  const paso = pasoVivo(c.plan, e.s);
  return {
    e,
    paso,
    lecturas: lecturasDe(paso, e.s),
    total: totalDe(e, c),
    cuenta: cuentaDe(c.plan, e.s),
    go: e.s.goHasta > e.s.sesionT,
    entras: e.entrasHasta > e.s.sesionT,
    pausado,
    pausar: (si) => {
      setPausado(si);
      eventos.emitir('accion');
    },
    cerrar: () => {
      const actual = ultimo.current;
      if (actual.s.terminado) return;
      const k = cerrar(actual.s, c.plan, 'atleta');
      antes.current = actual;
      const r = alCambiar(actual, k.estado, k.eventos, c);
      aplicar(r.e, r.eventos);
    },
    deshacer: () => {
      const a = antes.current;
      const actual = ultimo.current;
      if (!a) return;
      // El tiempo no se deshace: el paso reabierto sigue contando desde donde iba.
      const pasado = actual.s.sesionT - a.s.sesionT;
      const s = { ...a.s, t: a.s.t + pasado, sesionT: actual.s.sesionT, sesionM: actual.s.sesionM, lect: actual.s.lect, goHasta: 0 };
      aplicar({ ...a, s, reps: actual.reps, entrasHasta: 0 });
      antes.current = null;
      eventos.emitir('accion');
    },
    sumar30: () => {
      const actual = ultimo.current;
      aplicar({ ...actual, s: { ...actual.s, extraS: actual.s.extraS + 30, preavisado: false } });
      eventos.emitir('accion');
    },
    sumarReps: (d) => {
      const actual = ultimo.current;
      const i = actual.s.i;
      const v = Math.max(0, (actual.reps[i] ?? 0) + d);
      aplicar({ ...actual, reps: { ...actual.reps, [i]: v } });
      return v;
    },
    terminar: () => {
      const actual = ultimo.current;
      aplicar({ ...actual, s: { ...actual.s, terminado: true } });
    },
  };
}
