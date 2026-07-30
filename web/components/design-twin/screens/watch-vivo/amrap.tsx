'use client';

// (d) AMRAP — el marcador.
//
// Reproduce los últimos 39 s de un AMRAP de 12 min, que es cuando el reloj sirve
// de verdad: cuántas llevo, cuánto queda, ¿me da otra? Las rondas son una sola
// cifra, así que aquí el sujeto llega a su tamaño máximo (unos 118 pt de altura
// de cifra, la mitad del alto del lienzo) y late al sumar, que es la
// confirmación que sustituye a mirar si el botón se ha pulsado.
//
// El aro lleva la ventana de los 12 min y llega casi vacío: eso es información,
// no un aro roto.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../../sim';
import { clock } from '../watch-live/format';
import { W, zoneColor } from '../watch-live/theme';
import { AroContinuo, SegundoNivel } from '../../kit-watch';
import { AMRAP, bpmAmrap, zonaDe } from './guion';
import { Marco, Sujeto, type EstadoDestello } from './lienzo';

export function Amrap({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState(0);
  const [rondas, setRondas] = useState<number>(AMRAP.rondasIniciales);
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });
  const rondasRef = useRef(rondas);
  const cerradoRef = useRef(false);
  useEffect(() => {
    rondasRef.current = rondas;
  });

  useTicker(true, (s) => {
    setT(s);
    if (!cerradoRef.current && s >= AMRAP.restanteInicialS) {
      cerradoRef.current = true;
      setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
      onLog(`Tiempo · ${rondasRef.current} rondas`);
    }
  });

  const quedaS = Math.max(0, AMRAP.restanteInicialS - t);
  const terminado = quedaS === 0;
  const bpm = bpmAmrap(t);

  const sumar = () => {
    const siguiente = rondas + 1;
    setRondas(siguiente);
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Ronda ${siguiente}`);
  };

  return (
    <Marco
      contexto={terminado ? 'Tiempo · AMRAP 12 min' : 'AMRAP 12 min'}
      color={zoneColor(zonaDe(bpm))}
      aro={<AroContinuo fraccion={quedaS / AMRAP.ventanaS} />}
      sujeto={<Sujeto texto={String(rondas)} latido={rondas} />}
      segundo={
        terminado ? (
          <SegundoNivel valor="rondas" />
        ) : (
          <SegundoNivel etiqueta="Quedan" valor={clock(quedaS)} />
        )
      }
      accion={terminado ? undefined : 'Toca · una más'}
      onAvanzar={terminado ? undefined : sumar}
      bpm={bpm}
      onLog={onLog}
      destelloN={destello.n}
      destelloColor={destello.color}
    />
  );
}
