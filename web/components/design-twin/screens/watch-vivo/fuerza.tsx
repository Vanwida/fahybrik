'use client';

// (c) Descanso de fuerza — la cuenta atrás y lo que viene.
//
// Datos de PRODUCCIÓN (plantilla 497 · asignación 349): 4×5 a 100 kg con 90 s.
// La sesión entera vive en Z1 porque la ejecución real de esa asignación marcó
// 95 de media y 122 de máxima. Por eso aquí el fondo de la página del cuerpo es
// gris y no rojo: es lo que el pulso dice, y el pulso manda sobre lo que
// «debería» parecer una sesión de fuerza.
//
// El bucle completo: descanso → serie → descanso. Un solo gesto lo mueve, y la
// etiqueta del gesto dice la verdad en cada estado («ya» para adelantar el
// descanso, «hecha» para cerrar la serie). Un botón único mal etiquetado no es
// un botón único, es un botón que miente la mitad del tiempo.

import { useEffect, useRef, useState } from 'react';
import { useTicker } from '../../sim';
import { countdown, kg } from '../watch-live/format';
import { URGENT_THRESHOLD_S, W, zoneColor } from '../watch-live/theme';
import { AroContinuo, AroSegmentado } from './aro';
import { FUERZA, bpmFuerza, zonaDe } from './guion';
import { Marco, SegundoNivel, Sujeto, type Destello } from './lienzo';

interface Fase {
  estado: 'descanso' | 'serie';
  desde: number;
  /** La serie que toca ahora (durante el descanso, la que viene). */
  serie: number;
}

/** «3 de 4 · 5 × 100 kg» — la dosis con su posición, en una línea. */
function lineaSerie(serie: number): string {
  return `${serie} de ${FUERZA.series} · ${FUERZA.reps} × ${kg(FUERZA.cargaKg)} kg`;
}

export function Fuerza({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState(0);
  const [fase, setFase] = useState<Fase>({ estado: 'descanso', desde: 0, serie: FUERZA.serieActual });
  const [destello, setDestello] = useState<Destello>({ n: 0, color: W.orangeSoft });
  const faseRef = useRef(fase);
  useEffect(() => {
    faseRef.current = fase;
  });

  const empezarSerie = (s: number, f: Fase): void => {
    const nueva: Fase = { estado: 'serie', desde: s, serie: f.serie };
    faseRef.current = nueva;
    setFase(nueva);
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Serie ${f.serie} de ${FUERZA.series} · ${lineaSerie(f.serie)}`);
  };

  const cerrarSerie = (s: number, f: Fase): void => {
    const ultima = f.serie >= FUERZA.series;
    const nueva: Fase = { estado: 'descanso', desde: s, serie: ultima ? 1 : f.serie + 1 };
    faseRef.current = nueva;
    setFase(nueva);
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(
      ultima
        ? `Serie ${f.serie} hecha · bloque cerrado`
        : `Serie ${f.serie} hecha · descanso ${FUERZA.descansoS} s`,
    );
  };

  useTicker(true, (s) => {
    setT(s);
    const f = faseRef.current;
    if (f.estado === 'descanso' && s - f.desde >= FUERZA.descansoS) empezarSerie(s, f);
  });

  const transcurrido = t - fase.desde;
  const bpm = bpmFuerza(fase.estado, transcurrido);

  if (fase.estado === 'serie') {
    return (
      <Marco
        contexto={`Serie ${fase.serie} / ${FUERZA.series}`}
        color={zoneColor(zonaDe(bpm))}
        aro={<AroSegmentado total={FUERZA.series} hechas={fase.serie - 1} fraccion={0} />}
        sujeto={<Sujeto texto={kg(FUERZA.cargaKg)} unidad="kg" alto={94} />}
        segundo={<SegundoNivel valor={`${FUERZA.reps} reps`} />}
        accion="Toca · hecha"
        onAvanzar={() => cerrarSerie(t, fase)}
        bpm={bpm}
        onLog={onLog}
        destelloN={destello.n}
        destelloColor={destello.color}
      />
    );
  }

  const quedaS = Math.max(0, FUERZA.descansoS - transcurrido);
  return (
    <Marco
      contexto="Descanso"
      color={W.zoneGreen}
      aro={<AroContinuo fraccion={quedaS / FUERZA.descansoS} />}
      sujeto={
        <Sujeto texto={countdown(quedaS)} alto={94} color={quedaS <= URGENT_THRESHOLD_S ? W.orange : W.ink} />
      }
      segundo={<SegundoNivel valor={lineaSerie(fase.serie)} />}
      accion="Toca · ya"
      onAvanzar={() => empezarSerie(t, fase)}
      bpm={bpm}
      onLog={onLog}
      destelloN={destello.n}
      destelloColor={destello.color}
    />
  );
}
