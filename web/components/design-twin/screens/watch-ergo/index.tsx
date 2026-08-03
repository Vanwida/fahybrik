'use client';

// El ergo, en la muñeca. Ver `guion.ts` para qué mide aquí el reloj, por qué el
// sujeto son dos páginas y por qué la página 3 no lleva objetivo.

import { useState } from 'react';
import { useTicker } from '../../sim';
import {
  AroContinuo,
  AroSegmentado,
  Reloj,
  W,
  tinteDe,
  type EstadoDestello,
} from '../../kit-watch';
import { ERGO, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DESDE_S, METROS_POR_SEGUNDO, bpmDe, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-ergo',
  titulo: 'Muñeca · ergo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-30',
  descripcion:
    'El PM5 lo lee el móvil, no el reloj: en la muñeca sólo hay pulso y tiempo, y los metros y el /500 llegan marcados. Sin monitor emparejado se caen dos de las tres páginas y la primera pasa a ser tu FC.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-maquina',
    titulo: 'El mínimo · sin PM5 emparejado',
    descripcion:
      'Sin monitor no hay metros, ni /500, ni potencia: quedan tu pulso y el crono de la serie, y la serie la cierras tú tocando la pantalla. El aro sigue diciendo por qué serie vas, pero no cuánto llevas de ella — eso no lo puede saber.',
  },
  {
    id: 'emparejado',
    titulo: 'Con el PM5 emparejado',
    descripcion:
      'Las tres páginas: lo que falta de los 500 m, tu pulso y tu /500 — con los dos números de la máquina marcados «del móvil». La serie se cierra sola al llegar, y el descanso de 120 s se agota en el bisel.',
  },
];

function inicial(escenario: string): Estado {
  const maquina = escenario === 'emparejado';
  return {
    maquina,
    // Hoy no hay ancla de FC de ningún atleta: fondo neutro y pulso en ppm.
    ancla: SIN_ANCLA,
    fase: 'remando',
    serie: ERGO.actual,
    hechosM: maquina ? ERGO.desdeM : 0,
    // Los dos escenarios arrancan en el mismo punto de la serie: lo que cambia
    // no es dónde estás, es qué puede saber el reloj.
    t: DESDE_S,
  };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo cazaría `react-hooks/refs`).
  const cerrarSerie = () => {
    const ultima = e.serie >= ERGO.total;
    setE({ ...e, fase: 'descanso', t: 0, hechosM: 0, serie: ultima ? 1 : e.serie + 1 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    const quien = e.maquina ? 'los 500 m los ha cantado el PM5' : 'lo has dicho tú, no la máquina';
    onLog(
      ultima
        ? `Serie ${e.serie} hecha · bloque cerrado — ${quien}`
        : `Serie ${e.serie} hecha · descanso ${ERGO.descansoS} s — ${quien}`,
    );
  };

  const empezarYa = () => {
    setE({ ...e, fase: 'remando', t: 0, hechosM: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Serie ${e.serie} de ${ERGO.total} · ${ERGO.tramoM} m`);
  };

  // El descanso sí se agota solo (los 120 s están prescritos). La serie sólo se
  // cierra sola cuando hay PM5 que cante los metros; sin él, hay que tocar.
  useTicker(true, () => {
    if (e.fase === 'descanso') {
      if (e.t + 1 >= ERGO.descansoS) empezarYa();
      else setE({ ...e, t: e.t + 1 });
      return;
    }
    if (e.maquina) {
      const hechos = e.hechosM + METROS_POR_SEGUNDO;
      if (hechos >= ERGO.tramoM) {
        cerrarSerie();
        return;
      }
      setE({ ...e, t: e.t + 1, hechosM: hechos });
      return;
    }
    setE({ ...e, t: e.t + 1 });
  });

  const descansando = e.fase === 'descanso';
  const queda = Math.max(0, ERGO.descansoS - e.t);

  return (
    <Reloj
      paginas={paginas(e, { cerrarSerie, empezarYa })}
      // En el descanso el lienzo es el VERDE de recuperación, que es un estado y
      // no una zona; remando es tu zona, si es que hay ancla para calcularla.
      tinte={descansando ? W.zoneGreen : tinteDe(bpmDe(e), e.ancla)}
      bisel={
        descansando ? (
          <AroContinuo fraccion={queda / ERGO.descansoS} />
        ) : (
          // Las cinco repeticiones. CUÁL vas es prescripción más tus cierres, y
          // eso el reloj lo sabe siempre; cuánto llevas DE ÉSTA sólo lo sabe el
          // PM5, así que sin monitor la porción en curso se queda a cero en vez
          // de rellenarse a ojo.
          <AroSegmentado
            total={ERGO.total}
            hechas={e.serie - 1}
            fraccion={e.maquina ? e.hechosM / ERGO.tramoM : 0}
          />
        )
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
