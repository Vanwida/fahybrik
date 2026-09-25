'use client';

// EL GANCHO — el motor puro (`secuencia.ts`) movido por el reloj de React.
//
// Un segundo de motor por segundo real; los eventos de cada transición van a
// `eventos.emitir`, que los junta por instante y los escribe en la cronología.
// Una familia que dice las cosas a su manera (el circuito canta el parcial de
// cada estación; fuerza, la carga que el atleta declaró) no reescribe la voz
// DESPUÉS del cambio de paso: pasa un `traducir`, que recibe la transición
// entera (el estado de antes, el de después y lo que emite el motor) y
// devuelve lo que se emite. `conVoz` es el atajo para cambiar solo la frase.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../sim';
import type { Eventos, EventoVivo } from './eventos';
import type { Lecturas, Paso, Vuelta } from './paso';
import { fmtReloj, fmtRitmo } from './reglas';
import {
  avanzar,
  cerrar,
  cuentaDe,
  estadoInicial,
  lecturasDe,
  pasoVivo,
  type Emitido,
  type EstadoSecuencia,
  type InicioSecuencia,
  type PlanSesion,
  type Simulador,
} from './secuencia';

/** Una transición del motor: de dónde, a dónde, quién la provocó y qué emite. */
export interface Transicion {
  plan: PlanSesion;
  antes: EstadoSecuencia;
  despues: EstadoSecuencia;
  quien: 'motor' | 'atleta';
  eventos: Emitido[];
}

/** Reescribe lo que emite una transición (la voz, y si el vocabulario lo pide, el evento). */
export type Traductor = (t: Transicion) => Emitido[];

/**
 * Un traductor que solo cambia la frase de cada evento: `undefined` deja la
 * del kit, `null` la calla. El evento (y por tanto el háptico) no se toca.
 */
export function conVoz(f: (evento: EventoVivo, voz: string | undefined, t: Transicion) => string | null | undefined): Traductor {
  return (t) =>
    t.eventos.map((e) => {
      const v = f(e.evento, e.voz, t);
      return v === undefined ? e : { evento: e.evento, voz: v ?? undefined };
    });
}

/** Aplica el traductor de la familia, si lo hay. */
export function traducirCon(traducir: Traductor | undefined, t: Transicion): Emitido[] {
  return traducir ? traducir(t) : t.eventos;
}

export interface Secuencia {
  estado: EstadoSecuencia;
  plan: PlanSesion;
  paso: Paso;
  lecturas: Lecturas;
  /** 3, 2, 1 durante la cuenta atrás a pantalla completa; si no, null. */
  cuenta: number | null;
  /** El GO del primer segundo de un paso de trabajo. */
  go: boolean;
  pausado: boolean;
  pausar: (si: boolean) => void;
  /** Cierre a mano (doble toque, Acción, «Empezar ya»). Guarda el estado para deshacer. */
  cerrar: () => void;
  deshacer: () => void;
  /** +30 s al descanso en curso. */
  sumar30: () => void;
  /** Vuelta manual (el control «Vuelta» de un rodaje): parte sin cerrar el paso. */
  vuelta: () => void;
  terminar: () => void;
}

export interface OpcionesSecuencia {
  /** `false` congela el motor (escenarios estáticos como «color y tipo»). */
  corriendo?: boolean;
  traducir?: Traductor;
}

/**
 * El motor de un escenario. Los eventos van a `eventos.emitir`, que los junta
 * por instante y los escribe en la cronología.
 */
export function useSecuencia(
  plan: PlanSesion,
  sim: Simulador,
  inicio: InicioSecuencia,
  eventos: Eventos,
  opciones: OpcionesSecuencia = {},
): Secuencia {
  const [s, setS] = useState(() => estadoInicial(plan, sim, inicio));
  const [pausado, setPausado] = useState(inicio.pausado ?? false);
  // El estado MÁS RECIENTE y el de antes del último cierre a mano, en refs:
  // el aviso de deshacer guarda la función 5 s, y un cierre de hace 5 s no
  // puede leer el estado de su render (sería el de antes de cerrar).
  const ultimo = useRef(s);
  const antes = useRef<EstadoSecuencia | null>(null);
  useEffect(() => {
    ultimo.current = s;
  });

  const aplicar = (nuevo: EstadoSecuencia) => {
    ultimo.current = nuevo;
    setS(nuevo);
  };
  const emitir = (t: Transicion) => traducirCon(opciones.traducir, t).forEach((e) => eventos.emitir(e.evento, e.voz));

  useTicker((opciones.corriendo ?? true) && !pausado && !s.terminado, () => {
    const previo = ultimo.current;
    const r = avanzar(previo, plan, sim);
    aplicar(r.estado);
    emitir({ plan, antes: previo, despues: r.estado, quien: 'motor', eventos: r.eventos });
  });

  const paso = pasoVivo(plan, s);
  return {
    estado: s,
    plan,
    paso,
    lecturas: lecturasDe(paso, s),
    cuenta: cuentaDe(plan, s),
    go: s.goHasta > s.sesionT,
    pausado,
    pausar: (si) => {
      setPausado(si);
      eventos.emitir('accion');
    },
    cerrar: () => {
      const actual = ultimo.current;
      if (actual.terminado) return;
      const r = cerrar(actual, plan, 'atleta');
      antes.current = actual;
      aplicar(r.estado);
      emitir({ plan, antes: actual, despues: r.estado, quien: 'atleta', eventos: r.eventos });
    },
    deshacer: () => {
      const a = antes.current;
      const actual = ultimo.current;
      if (!a) return;
      // El tiempo no se deshace: el paso reabierto sigue contando desde donde
      // iba, y lo que midió la sesión mientras tanto (metros, pulso) se queda.
      const pasado = actual.sesionT - a.sesionT;
      const { sesionT, sesionM, sesionErgoM, ppmSuma, ppmN, zonasS, ppmMax, lect } = actual;
      aplicar({ ...a, t: a.t + pasado, sesionT, sesionM, sesionErgoM, ppmSuma, ppmN, zonasS, ppmMax, lect, goHasta: 0 });
      antes.current = null;
      eventos.emitir('accion');
    },
    sumar30: () => {
      const actual = ultimo.current;
      aplicar({ ...actual, extraS: actual.extraS + 30, preavisado: false });
      eventos.emitir('accion');
    },
    vuelta: () => {
      const actual = ultimo.current;
      const seg = actual.sesionT - actual.tramoDesdeT;
      const m = actual.sesionM - actual.tramoDesdeM;
      const ritmo = m > 50 ? seg / (m / 1000) : null;
      const n = actual.tramosN + 1;
      const v: Vuelta = { n, clase: 'tramo', segundos: seg, metros: Math.round(m), ritmo, ppm: actual.lect.ppm, veredicto: null };
      aplicar({
        ...actual,
        tramosN: n,
        tramoDesdeT: actual.sesionT,
        tramoDesdeM: actual.sesionM,
        vueltas: [...actual.vueltas, v],
        banner: { titulo: `Vuelta ${n}`, valor: fmtReloj(seg), pie: `${fmtRitmo(ritmo)} /km`, hasta: actual.sesionT + 4 },
      });
      eventos.emitir('accion');
    },
    terminar: () => {
      aplicar({ ...ultimo.current, terminado: true });
    },
  };
}
