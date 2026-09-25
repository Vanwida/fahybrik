'use client';

// LOS EVENTOS — un evento, un háptico (P5, tabla del §4).
//
// Hoy un mismo `.notification` significa cuatro cosas (toque, aviso, tic del
// 3-2-1, fuera de objetivo) y un cambio de tramo apila tres o cuatro golpes en
// 150 ms. Aquí cada evento semántico tiene UN háptico de WKHapticType y, si
// toca, UNA frase de voz. Una pantalla nunca llama a un háptico: emite el
// evento, y este fichero decide qué vibra y qué se dice.
//
// «Sin apilar»: los eventos que llegan en el mismo instante (cerrar una serie
// = fin de serie + empieza recuperación) salen como UNA vibración — la de más
// prioridad — y sus frases se encadenan. En el doble, cada emisión se escribe
// en la cronología del panel:
//
//   «Empieza trabajo — háptico .start×2 · voz: «Serie 3 de 6. Mil metros a 3:50.»»

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EjeObjetivo, PasoBase, ReglasAviso, Veredicto } from './paso';

export type EventoVivo =
  | 'cuenta' // 3-2-1 antes de un paso de trabajo, un tic por segundo
  | 'go' // empieza trabajo
  | 'recupera' // empieza recuperación (o descanso)
  | 'preaviso' // 10 s o 100 m para acabar
  | 'afloja' // vas rápido / pulso por encima
  | 'aprieta' // vas lento
  | 'vuelta' // vuelta automática (km)
  | 'fin-serie' // el resultado de la serie (voz; no vibra: ya vibra lo siguiente)
  | 'bloque' // bloque hecho
  | 'sesion' // sesión hecha
  | 'accion' // el atleta hizo algo (pausa, serie hecha…)
  | 'enlace'; // enlace perdido

export type HapticoWK =
  | 'click'
  | 'start'
  | 'stop'
  | 'notification'
  | 'directionUp'
  | 'directionDown'
  | 'success'
  | 'failure';

export interface Vocablo {
  nombre: string;
  haptico: HapticoWK | null;
  veces: number;
  /** ¿Lleva voz? (la frase la pone quien emite, sacada del dato del paso). */
  voz: boolean;
  /** Si coinciden varios en el mismo instante, vibra el de más prioridad. */
  prioridad: number;
}

/** La tabla del §4, literal. */
export const VOCABULARIO: Record<EventoVivo, Vocablo> = {
  cuenta: { nombre: '3-2-1', haptico: 'click', veces: 1, voz: false, prioridad: 3 },
  go: { nombre: 'Empieza trabajo', haptico: 'start', veces: 2, voz: true, prioridad: 9 },
  recupera: { nombre: 'Empieza recuperación', haptico: 'stop', veces: 1, voz: true, prioridad: 8 },
  preaviso: { nombre: 'Preaviso', haptico: 'notification', veces: 1, voz: true, prioridad: 6 },
  afloja: { nombre: 'Afloja', haptico: 'directionDown', veces: 2, voz: false, prioridad: 5 },
  aprieta: { nombre: 'Aprieta', haptico: 'directionUp', veces: 2, voz: false, prioridad: 5 },
  vuelta: { nombre: 'Vuelta automática', haptico: 'click', veces: 2, voz: true, prioridad: 4 },
  'fin-serie': { nombre: 'Fin de serie', haptico: null, veces: 0, voz: true, prioridad: 0 },
  bloque: { nombre: 'Bloque hecho', haptico: 'success', veces: 1, voz: false, prioridad: 10 },
  sesion: { nombre: 'Sesión hecha', haptico: 'success', veces: 2, voz: true, prioridad: 11 },
  accion: { nombre: 'Acción del atleta', haptico: 'click', veces: 1, voz: false, prioridad: 2 },
  enlace: { nombre: 'Enlace perdido', haptico: 'failure', veces: 1, voz: false, prioridad: 7 },
};

/** «.start×2», «.click». */
export function fmtHaptico(v: Vocablo): string {
  if (!v.haptico) return 'sin háptico';
  return `.${v.haptico}${v.veces > 1 ? `×${v.veces}` : ''}`;
}

/** Lo que sale de un instante: una vibración y, quizá, una frase. */
export interface Emision {
  /** Sube en cada emisión: sirve de `key` para el destello y el lector del estudio. */
  n: number;
  eventos: EventoVivo[];
  /** El evento que vibra (el de más prioridad con háptico), o null si ninguno vibra. */
  vibra: EventoVivo | null;
  haptico: string;
  voz: string | null;
  linea: string;
}

export interface Eventos {
  /** Emite un evento semántico; `voz` es la frase, sacada del dato del paso. */
  emitir: (evento: EventoVivo, voz?: string) => void;
  /** La última emisión, para el destello y el lector del estudio. */
  ultimo: Emision | null;
}

/** Junta lo que coincide en un instante: un háptico, las voces encadenadas. */
export function componer(n: number, cola: ReadonlyArray<{ evento: EventoVivo; voz?: string }>): Emision {
  const conHaptico = cola.filter((c) => VOCABULARIO[c.evento].haptico != null);
  const vibra = conHaptico.reduce<EventoVivo | null>(
    (mejor, c) =>
      mejor == null || VOCABULARIO[c.evento].prioridad > VOCABULARIO[mejor].prioridad ? c.evento : mejor,
    null,
  );
  const voces = cola.map((c) => c.voz).filter((v): v is string => !!v);
  const voz = voces.length > 0 ? voces.join(' ') : null;
  const nombres = cola.map((c) => VOCABULARIO[c.evento].nombre);
  const haptico = vibra ? fmtHaptico(VOCABULARIO[vibra]) : 'sin háptico';
  const linea = `${[...new Set(nombres)].join(' + ')} — ${vibra ? `háptico ${haptico}` : haptico}${
    voz ? ` · voz: «${voz}»` : ''
  }`;
  return { n, eventos: cola.map((c) => c.evento), vibra, haptico, voz, linea };
}

/**
 * El emisor de una pantalla. Los eventos emitidos en el mismo tic se juntan
 * (microtarea) y salen como una sola línea en la cronología.
 */
export function useEventos(onLog: (linea: string) => void): Eventos {
  const cola = useRef<Array<{ evento: EventoVivo; voz?: string }>>([]);
  const cuenta = useRef(0);
  const programado = useRef(false);
  const vivo = useRef(true);
  const [ultimo, setUltimo] = useState<Emision | null>(null);
  const logRef = useRef(onLog);
  useEffect(() => {
    logRef.current = onLog;
  });
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const emitir = useCallback((evento: EventoVivo, voz?: string) => {
    cola.current.push({ evento, voz });
    if (programado.current) return;
    programado.current = true;
    setTimeout(() => {
      programado.current = false;
      const lote = cola.current;
      cola.current = [];
      if (!vivo.current || lote.length === 0) return;
      cuenta.current += 1;
      const e = componer(cuenta.current, lote);
      setUltimo(e);
      logRef.current(e.linea);
    }, 0);
  }, []);

  return { emitir, ultimo };
}

// ---------------------------------------------------------------------------
// El aviso fuera de objetivo — histéresis y cadencia como DATO del coach
// ---------------------------------------------------------------------------

export interface EstadoAviso {
  /** El veredicto que se está sosteniendo. */
  fuera: Veredicto;
  /** Desde qué segundo del paso se sostiene. */
  desde: number;
  /** Segundo del paso del último aviso (null = aún ninguno en este paso). */
  ultimo: number | null;
}

export const AVISO_INICIAL: EstadoAviso = { fuera: 'dentro', desde: 0, ultimo: null };

/**
 * ¿Toca vibrar «afloja» o «aprieta»? Reglas del §4: nunca en calentamiento ni
 * en recuperación (salvo que el coach lo pida); el primer aviso tras
 * `confirmacionS` seguidos fuera; el siguiente, no antes de `cadenciaS`; en un
 * paso a zona, «aprieta» espera `graciaZonaS` (el pulso llega tarde). El
 * veredicto que entra aquí ya lleva la HOLGURA aplicada.
 */
export function decidirAviso(
  prev: EstadoAviso,
  v: Veredicto | null,
  t: number,
  p: PasoBase,
  eje: EjeObjetivo | null,
  reglas: ReglasAviso,
): { estado: EstadoAviso; evento: 'afloja' | 'aprieta' | null } {
  const callar =
    (p.fase === 'calentamiento' && !reglas.avisarEnCalentamiento) ||
    (p.rol !== 'trabajo' && !reglas.avisarEnRecuperacion);
  if (callar || v == null || v === 'dentro') {
    return { estado: { fuera: 'dentro', desde: t, ultimo: prev.ultimo }, evento: null };
  }
  if (v !== prev.fuera) return { estado: { fuera: v, desde: t, ultimo: prev.ultimo }, evento: null };
  const confirmado = t - prev.desde >= reglas.confirmacionS;
  const libre = prev.ultimo == null || t - prev.ultimo >= reglas.cadenciaS;
  const gracia = (eje === 'zona' || eje === 'ppm') && v === 'por-debajo' && t < reglas.graciaZonaS;
  if (!confirmado || !libre || gracia) return { estado: prev, evento: null };
  return {
    estado: { ...prev, ultimo: t },
    evento: v === 'por-encima' ? 'afloja' : 'aprieta',
  };
}
