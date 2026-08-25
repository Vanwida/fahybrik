'use client';

// El motor de tramos que comparten los dos HUD: el cursor por la estructura del
// bloque (4×1000 con 2' entre series), su reloj y sus metros.
//
// Refleja cómo avanza la app: un tramo de DISTANCIA se cierra solo cuando la
// medida llega al objetivo (GPS fuera, odómetro en la cinta) y encadena con la
// recuperación, que corre sobre el reloj de la sesión. El botón «TRAMO HECHO»
// es un ATAJO manual, la misma transición.

import { useCallback, useEffect, useRef, useState } from 'react';
import { beltWorkTick } from '@fahybrid/shared/domain/belt-work-clock';
import { useTicker } from '../../sim';
import type { Tramo } from './data';
import { TRAMOS } from './data';

export interface EstadoTramos {
  /** Índice del tramo vivo dentro de la estructura. */
  idx: number;
  /** Segundos del tramo — congelados mientras hay pausa. */
  legS: number;
  /** Metros del tramo. */
  legM: number;
  /** Metros del SEGMENTO entero (lo que el HUD de calle llama «Distancia»). */
  segM: number;
}

/** Cada cuántos metros el doble apunta un parcial en la cronología. */
const PARCIAL_M = 250;

export interface OpcionesTramos {
  /** El HUD ya está en vivo (la cuenta atrás terminó). */
  corriendo: boolean;
  /** Pausa (manual o automática): congela el reloj del tramo. */
  pausado: boolean;
  /** El atleta no avanza (parado en el semáforo): no suma metros. */
  parado: boolean;
  /** Cinta FTMS: el reloj de trabajo solo suma con velocidad. Calle = other. */
  superficie?: 'ftms' | 'other';
  /** Metros por segundo del tramo actual — lo decide cada HUD (GPS o cinta). */
  metrosPorSegundo: (tramo: Tramo) => number;
  /** Cierre de tramo, automático o por el botón. */
  onTramo: (idx: number, motivo: 'auto' | 'manual') => void;
  /** Parcial cada PARCIAL_M dentro de un tramo de trabajo. */
  onParcial: (metros: number) => void;
}

export function useTramos(opts: OpcionesTramos): { estado: EstadoTramos; avanzar: () => void } {
  const inicial: EstadoTramos = { idx: 0, legS: 0, legM: 0, segM: 0 };
  const [estado, setEstado] = useState<EstadoTramos>(inicial);
  const ref = useRef<EstadoTramos>(inicial);
  const parcialRef = useRef(0);
  const optsRef = useRef(opts);
  // Latest-ref en efecto: el tick del segundo siguiente ya ve las opciones nuevas.
  useEffect(() => {
    optsRef.current = opts;
  });

  const cerrarTramo = useCallback((motivo: 'auto' | 'manual') => {
    const cur = ref.current;
    if (cur.idx >= TRAMOS.length - 1) return;
    const next: EstadoTramos = { idx: cur.idx + 1, legS: 0, legM: 0, segM: cur.segM };
    ref.current = next;
    parcialRef.current = 0;
    setEstado(next);
    optsRef.current.onTramo(next.idx, motivo);
  }, []);

  useTicker(opts.corriendo, () => {
    const { pausado, parado, metrosPorSegundo, superficie = 'other' } = optsRef.current;
    const cur = ref.current;
    const tramo = TRAMOS[cur.idx];

    const next: EstadoTramos = { ...cur };
    if (!pausado) {
      next.legS =
        cur.legS +
        beltWorkTick({
          wallDt: 1,
          surface: superficie,
          window: tramo.tipo === 'trabajo' ? 'work' : 'recovery',
          beltMoving: !parado,
        });
    }
    if (!pausado && !parado) {
      const d = metrosPorSegundo(tramo);
      next.legM = cur.legM + d;
      next.segM = cur.segM + d;
    }
    ref.current = next;
    setEstado(next);

    if (tramo.tipo === 'trabajo') {
      const marca = Math.floor(next.legM / PARCIAL_M) * PARCIAL_M;
      if (marca > parcialRef.current && marca < (tramo.metros ?? 0)) {
        parcialRef.current = marca;
        optsRef.current.onParcial(marca);
      }
    }

    const completo =
      tramo.tipo === 'trabajo' ? next.legM >= (tramo.metros ?? 0) : next.legS >= (tramo.segundos ?? 0);
    if (completo) cerrarTramo('auto');
  });

  const avanzar = useCallback(() => cerrarTramo('manual'), [cerrarTramo]);
  return { estado, avanzar };
}

/** Fracción 0…1 del objetivo del tramo (SegmentGoal.fraction). */
export function fraccionTramo(tramo: Tramo, estado: EstadoTramos): number {
  if (tramo.tipo === 'trabajo') {
    const objetivo = tramo.metros ?? 0;
    return objetivo > 0 ? Math.min(1, Math.max(0, estado.legM / objetivo)) : 0;
  }
  const objetivo = tramo.segundos ?? 0;
  return objetivo > 0 ? Math.min(1, Math.max(0, estado.legS / objetivo)) : 0;
}

/** Segundos que quedan de un tramo de tiempo (la recuperación). */
export function restanteTramo(tramo: Tramo, estado: EstadoTramos): number {
  return Math.max(0, (tramo.segundos ?? 0) - estado.legS);
}
