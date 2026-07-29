'use client';

// (b) EMOM — el minuto que drena.
//
// El sujeto es el minuto, y no cambia al acabar la tarea: lo que cambia es el
// COLOR del lienzo. Trabajando, el fondo es tu zona de pulso; en cuanto marcas
// la tarea, el fondo entero pasa a verde y el mismo número se lee como «lo que
// te queda de respiro». Un solo dato, dos significados, cero pantallas nuevas.
//
// El aro drena el minuto entero de un tirón, cruzando las dos fases: es la
// ventana, y la ventana no se para porque tú acabes antes.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../../sim';
import { countdown } from '../watch-live/format';
import { URGENT_THRESHOLD_S, W, zoneColor } from '../watch-live/theme';
import { AroContinuo } from './aro';
import { EMOM, bpmEmom, tareaEmom, zonaDe } from './guion';
import { Marco, SegundoNivel, Sujeto, type Destello } from './lienzo';

interface Fase {
  estado: 'trabajo' | 'recupera';
  desde: number;
  ronda: number;
  /** Segundo absoluto en el que cierra la ventana de esta ronda. */
  finS: number;
}

export function Emom({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState(0);
  const [fase, setFase] = useState<Fase>({
    estado: 'trabajo',
    desde: 0,
    ronda: EMOM.actual,
    finS: EMOM.restanteInicialS,
  });
  const [destello, setDestello] = useState<Destello>({ n: 0, color: W.orangeSoft });
  const faseRef = useRef(fase);
  useEffect(() => {
    faseRef.current = fase;
  });

  const marcarHecha = (s: number, f: Fase): void => {
    const nueva: Fase = { ...f, estado: 'recupera', desde: s };
    faseRef.current = nueva;
    setFase(nueva);
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Ronda ${f.ronda} hecha · recupera ${Math.max(0, f.finS - s)} s`);
  };

  const abrirRonda = (s: number, f: Fase): void => {
    const ronda = f.ronda >= EMOM.rondas ? 1 : f.ronda + 1;
    const nueva: Fase = { estado: 'trabajo', desde: s, ronda, finS: s + EMOM.ventanaS };
    faseRef.current = nueva;
    setFase(nueva);
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Ronda ${ronda} de ${EMOM.rondas} · ${tareaEmom(ronda)}`);
  };

  useTicker(true, (s) => {
    setT(s);
    const f = faseRef.current;
    if (s >= f.finS) abrirRonda(s, f);
  });

  const quedaS = Math.max(0, fase.finS - t);
  const bpm = bpmEmom(fase.estado, t - fase.desde);
  const recuperando = fase.estado === 'recupera';

  return (
    <Marco
      contexto={recuperando ? `Ronda ${fase.ronda} · recupera` : `Ronda ${fase.ronda} / ${EMOM.rondas}`}
      color={recuperando ? W.zoneGreen : zoneColor(zonaDe(bpm))}
      aro={<AroContinuo fraccion={quedaS / EMOM.ventanaS} />}
      sujeto={
        <Sujeto texto={countdown(quedaS)} alto={94} color={quedaS <= URGENT_THRESHOLD_S ? W.orange : W.ink} />
      }
      segundo={<SegundoNivel valor={recuperando ? 'recupera' : tareaEmom(fase.ronda)} />}
      accion={recuperando ? undefined : 'Toca · hecha'}
      onAvanzar={recuperando ? undefined : () => marcarHecha(t, fase)}
      bpm={bpm}
      onLog={onLog}
      destelloN={destello.n}
      destelloColor={destello.color}
    />
  );
}
