'use client';

// La cinta, en la muñeca. Ver `guion.ts` para el porqué de las dos pantallas y
// para por qué sin cinta emparejada el bisel se queda vacío.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroContinuo, Reloj, W, tinteDe, type EstadoDestello } from '../../kit-watch';
import { CINTA, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DESDE_S, METROS_POR_SEGUNDO, bpmDe, faltanM, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-cinta',
  titulo: 'Muñeca · cinta',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Bajo techo el reloj sólo mide pulso y tiempo: los metros y la velocidad los lee el móvil de la cinta y llegan marcados. Sin cinta emparejada, la muñeca es un pulsómetro con cronómetro.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-maquina',
    titulo: 'El mínimo · sin cinta emparejada',
    descripcion:
      'Hoy es el 100 % de los casos: ninguna cinta llega a la app. El reloj no sabe cuántos metros llevas, así que el sujeto es el tiempo del tramo, el bisel se queda vacío —no hay fracción que dibujar— y el tramo lo cierras tú tocando la pantalla.',
  },
  {
    id: 'emparejada',
    titulo: 'Con la cinta emparejada',
    descripcion:
      'El móvil lee la cinta por BLE y le pasa al reloj los metros y la velocidad: llegan marcados «del móvil», nunca como medida suya. Aparece el aro, y el tramo se cierra solo al llegar a los 1.000 m.',
  },
];

function inicial(escenario: string): Estado {
  const maquina = escenario === 'emparejada';
  return {
    maquina,
    // Hoy no hay ancla de FC de ningún atleta: fondo neutro y pulso en ppm.
    ancla: SIN_ANCLA,
    fase: 'corriendo',
    hechosM: maquina ? CINTA.desdeM : 0,
    // Los dos escenarios arrancan en el mismo punto del tramo, para que se vea
    // que la diferencia no es dónde estás: es qué puede saber el reloj.
    t: DESDE_S,
  };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual (y un ref aquí lo cazaría `react-hooks/refs`).
  const cerrarTramo = () => {
    setE({ ...e, fase: 'entre', t: 0, hechosM: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(
      e.maquina
        ? 'Tramo cerrado · lo cierran los metros que canta la cinta'
        : 'Tramo cerrado · lo has dicho tú, no la cinta',
    );
  };

  const empezarTramo = () => {
    setE({ ...e, fase: 'corriendo', t: 0, hechosM: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Tramo nuevo · ${CINTA.tramoM} m a ${CINTA.velocidadKmH} km/h`);
  };

  // Quién cierra el tramo es LA diferencia entre los dos escenarios: con cinta
  // lo cierran los metros; sin ella no se agota nada solo y hay que tocar. El
  // tiempo entre tramos tampoco se agota: no hay descanso prescrito en la base.
  useTicker(true, () => {
    if (e.fase === 'corriendo' && e.maquina) {
      const hechos = e.hechosM + METROS_POR_SEGUNDO;
      if (hechos >= CINTA.tramoM) {
        cerrarTramo();
        return;
      }
      setE({ ...e, t: e.t + 1, hechosM: hechos });
      return;
    }
    setE({ ...e, t: e.t + 1 });
  });

  const corriendo = e.fase === 'corriendo';

  return (
    <Reloj
      paginas={paginas(e, { cerrarTramo, empezarTramo })}
      // Entre tramos el lienzo es el VERDE de recuperación, que es un estado y no
      // una zona; corriendo es tu zona, si es que hay ancla para calcularla.
      tinte={corriendo ? tinteDe(bpmDe(e), e.ancla) : W.zoneGreen}
      // El aro sólo existe cuando la máquina puede alimentarlo. Sin cinta no hay
      // fracción que dibujar, y entre tramos tampoco (no hay descanso prescrito
      // que agotar): dibujar uno igualmente sería cromo que miente.
      bisel={corriendo && e.maquina ? <AroContinuo fraccion={faltanM(e) / CINTA.tramoM} /> : undefined}
      destello={destello}
      onLog={onLog}
    />
  );
}
