'use client';

// (a) Series de 400 — el tramo que se acaba.
//
// El sujeto es LO QUE QUEDA DEL TRAMO, no el tiempo ni la distancia recorrida:
// corriendo una serie la única pregunta es «cuánto me falta», y la respuesta
// tiene que verse sin enfocar. El aro trocea las 8 series, así que el «3 de 8»
// y el avance dentro de la serie viven en el borde y no roban altura.
//
// §7: el ritmo se pinta porque LO MIDE el GPS, y lo dice: la marca de
// procedencia va pegada al dato. En cinta, sin GPS y sin que el móvil pase
// metros, esta misma página no tendría ni metros ni ritmo que enseñar, y el
// sujeto tendría que degradar al tiempo del tramo.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../../sim';
import { countdown, pace } from '../watch-live/format';
import { URGENT_THRESHOLD_S, W, zoneColor } from '../watch-live/theme';
import { AroSegmentado } from './aro';
import { SERIES, bpmSerie, zonaDe } from './guion';
import { Marco, SegundoNivel, Sujeto, type Destello } from './lienzo';

interface Fase {
  estado: 'trabajo' | 'recupera';
  /** Segundo en el que empezó la fase. */
  desde: number;
  serie: number;
}

function inicioM(serie: number): number {
  return serie === SERIES.actual ? SERIES.restanteInicialM : SERIES.metros;
}

export function Serie({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState(0);
  const [fase, setFase] = useState<Fase>({ estado: 'trabajo', desde: 0, serie: SERIES.actual });
  const [destello, setDestello] = useState<Destello>({ n: 0, color: W.orangeSoft });
  const faseRef = useRef(fase);
  useEffect(() => {
    faseRef.current = fase;
  });

  const aplicar = (s: number, f: Fase): void => {
    const nueva: Fase =
      f.estado === 'trabajo'
        ? { estado: 'recupera', desde: s, serie: f.serie }
        : { estado: 'trabajo', desde: s, serie: f.serie >= SERIES.total ? 1 : f.serie + 1 };
    faseRef.current = nueva;
    setFase(nueva);
    setDestello((d) => ({ n: d.n + 1, color: nueva.estado === 'recupera' ? W.zoneGreen : W.orangeSoft }));
    onLog(
      nueva.estado === 'recupera'
        ? `Serie ${f.serie} de ${SERIES.total} cerrada · recupera ${SERIES.recuperacionS} s`
        : `Serie ${nueva.serie} de ${SERIES.total} · ${SERIES.metros} m`,
    );
  };

  useTicker(true, (s) => {
    setT(s);
    const f = faseRef.current;
    const transcurrido = s - f.desde;
    const acabo =
      f.estado === 'trabajo'
        ? inicioM(f.serie) - transcurrido * SERIES.velocidadMs <= 0
        : transcurrido >= SERIES.recuperacionS;
    if (acabo) aplicar(s, f);
  });

  const transcurrido = t - fase.desde;

  if (fase.estado === 'recupera') {
    const quedaS = Math.max(0, SERIES.recuperacionS - transcurrido);
    const bpm = bpmSerie('recupera', transcurrido);
    return (
      <Marco
        contexto="Recupera"
        color={W.zoneGreen}
        aro={<AroSegmentado total={SERIES.total} hechas={fase.serie} fraccion={0} />}
        sujeto={
          <Sujeto
            texto={countdown(quedaS)}
            alto={94}
            color={quedaS <= URGENT_THRESHOLD_S ? W.orange : W.ink}
          />
        }
        segundo={<SegundoNivel etiqueta="Luego" valor={`${SERIES.metros} m`} />}
        accion="Toca · ya"
        onAvanzar={() => aplicar(t, fase)}
        bpm={bpm}
        onLog={onLog}
        destelloN={destello.n}
        destelloColor={destello.color}
      />
    );
  }

  const quedaM = Math.max(0, inicioM(fase.serie) - transcurrido * SERIES.velocidadMs);
  const bpm = bpmSerie('trabajo', transcurrido);
  return (
    <Marco
      contexto={`Serie ${fase.serie} / ${SERIES.total}`}
      color={zoneColor(zonaDe(bpm))}
      aro={
        <AroSegmentado
          total={SERIES.total}
          hechas={fase.serie - 1}
          fraccion={(SERIES.metros - quedaM) / SERIES.metros}
        />
      }
      sujeto={<Sujeto texto={String(Math.ceil(quedaM))} unidad="m" alto={108} />}
      segundo={<SegundoNivel etiqueta="GPS" valor={`${pace(SERIES.ritmoSecKm)}/km`} />}
      accion="Toca · serie hecha"
      onAvanzar={() => aplicar(t, fase)}
      bpm={bpm}
      onLog={onLog}
      destelloN={destello.n}
      destelloColor={destello.color}
    />
  );
}
