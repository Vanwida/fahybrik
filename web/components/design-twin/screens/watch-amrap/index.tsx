'use client';

// El marcador, en la muñeca. Ver `guion.ts` para por qué ésta es la única de las
// nueve vistas que anuncia su acción todo el rato.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroContinuo, Reloj, W, clock, tinteDe, type EstadoDestello } from '../../kit-watch';
import { AMRAP, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { bpmDe, paginas, quedaDe, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-amrap',
  titulo: 'Muñeca · AMRAP',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-30',
  descripcion:
    'La ronda no la mide nadie: la declaras tú con un toque, y por eso es la única vista que anuncia su acción todo el rato. La muñeca entera es el marcador.',
  fuentes: [],
  enApp:
    'FixedLiveView (rama amrap) shipea cuenta atrás, «Rondas: N» y el botón «+ Ronda».',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'arranque',
    titulo: 'El mínimo · cero rondas',
    descripcion:
      'Acaba de empezar: un 0 llenando la muñeca. Un contador se pinta en cero, y es cuando más falta hace — lo único que hay que mirar es lo que queda de ventana.',
  },
  {
    id: 'final',
    titulo: 'Los últimos 39 s',
    descripcion:
      'Nueve rondas y el aro casi vacío: eso es información, no un aro roto. Al cerrarse la ventana la acción desaparece y el numeral crece — ya es el marcador.',
  },
];

function inicial(escenario: string): Estado {
  if (escenario === 'final') {
    return {
      ancla: SIN_ANCLA,
      t: AMRAP.ventanaS - AMRAP.restanteFinalS,
      rondas: AMRAP.rondasAlFinal,
    };
  }
  return { ancla: SIN_ANCLA, t: 0, rondas: 0 };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo cazaría `react-hooks/refs`).
  const sumarRonda = () => {
    setE({ ...e, rondas: e.rondas + 1 });
    // Sin destello: la confirmación es el LATIDO del numeral. El golpe de luz a
    // pantalla completa está reservado para lo que hace el reloj sin pedirte
    // permiso, y sumar una ronda lo has hecho tú.
    onLog(`Ronda ${e.rondas + 1} · quedan ${clock(quedaDe(e))}`);
  };

  useTicker(true, () => {
    if (quedaDe(e) <= 0) return;
    const t = e.t + 1;
    setE({ ...e, t });
    if (t >= AMRAP.ventanaS) {
      setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
      onLog(`Se acabó · ${e.rondas} rondas`);
    }
  });

  return (
    <Reloj
      paginas={paginas(e, { sumarRonda })}
      // Sin ancla de FC no hay zona y no hay tinte: el fondo se queda negro, que
      // es lo que le pasa hoy al 100 % de la base.
      tinte={tinteDe(bpmDe(e), e.ancla)}
      // Los 12 min drenando. Llega casi vacío al final, y eso es el dato.
      bisel={<AroContinuo fraccion={quedaDe(e) / AMRAP.ventanaS} />}
      destello={destello}
      onLog={onLog}
    />
  );
}
