'use client';

// El relevo, en la muñeca. Ver `guion.ts`: la pantalla la gobierna lo que hace
// OTRA persona, y eso es justo lo que el reloj no puede medir.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroRelevo, Reloj, W, tinteDe, type EstadoDestello } from '../../kit-watch';
import { DOBLES, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { bpmDe, fraccionRelevo, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-dobles',
  titulo: 'Muñeca · dobles',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-30',
  descripcion:
    'El sujeto no es un número, es si trabajas tú o esperas. Y cuando esperas, tu salida pasa a ser el sujeto — salvo que nadie mida a tu pareja, que es lo que pasa hoy.',
  fuentes: [],
  enApp:
    'RelayLiveView ya distingue trabajas-vs-esperas en la muñeca; el resto del tratamiento sigue aquí.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'espera-a-ciegas',
    titulo: 'El mínimo · espera a ciegas',
    descripcion:
      'Lo que hay hoy en el 100 % de la base: `dobles_live_status` con cero filas y ni un tiempo de cambio. Esperas y no hay NADA que estimar, así que el sujeto degrada a tu pulso bajando. El cambio lo dices tú.',
  },
  {
    id: 'con-estimacion',
    titulo: 'Con la máquina emparejada',
    descripcion:
      'El móvil ve el remo en el que está tu pareja y puede decir cuánto le queda. La virgulilla del «~40» es la marca de que es una estimación, no una medida — y no se cae ni en el 3-2-1.',
  },
];

function inicial(escenario: string): Estado {
  // Los dos escenarios arrancan ESPERANDO, que es la cara que decide la vista:
  // es donde se ve si hay salida que anunciar o sólo tu propio pulso.
  return { ancla: SIN_ANCLA, fase: 'espera', conMaquina: escenario === 'con-estimacion', t: 0 };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo caza `react-hooks/refs`).
  const entrar = () => {
    setE({ ...e, fase: 'trabajo', t: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog('Cambio · entras tú');
  };

  /**
   * El toque. Significa lo mismo en las dos fases —«el relevo se ha hecho»— y
   * es SIEMPRE el atleta quien lo dice: ni el reloj ni el móvil ven el cambio.
   */
  const cambio = () => {
    if (e.fase === 'espera') {
      entrar();
      return;
    }
    setE({ ...e, fase: 'espera', t: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Tu tramo cerrado · rema ${DOBLES.pareja}`);
  };

  // La espera se agota sola SÓLO cuando el móvil ve la máquina de tu pareja; sin
  // eso no hay nada que agotar y la pantalla espera al toque. Ojo: aunque se
  // agote, lo que se dispara es un AVISO (destello y los últimos segundos en
  // naranja). En la app el que sabe que el relevo se ha hecho es el que entra.
  useTicker(true, () => {
    if (e.fase === 'espera' && e.conMaquina && e.t + 1 >= DOBLES.esperaS) entrar();
    else setE({ ...e, t: e.t + 1 });
  });

  return (
    <Reloj
      paginas={paginas(e, { cambio })}
      // La espera NO se tiñe de verde como el descanso de fuerza: allí el sujeto
      // es una cuenta atrás y aquí puede ser tu pulso, y un fondo verde detrás de
      // un pulso sin umbral se leería como una zona que nadie ha medido.
      tinte={tinteDe(bpmDe(e), e.ancla)}
      // Quién trabaja se ve de reojo y sin una palabra: la mitad de arriba es
      // SIEMPRE la tuya — en un relevo el atleta no puede estar buscando cuál de
      // las dos mitades le toca mirar.
      bisel={<AroRelevo tuyo={e.fase === 'trabajo'} fraccion={fraccionRelevo(e)} />}
      destello={destello}
      onLog={onLog}
    />
  );
}
