'use client';

// El rodaje, en la muñeca. Ver `guion.ts` para el porqué del orden de páginas.
//
// Es la única de las nueve vistas SIN destello: un destello es un suceso, y en
// un rodaje no pasa nada. Se corre.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroContinuo, Reloj, clock, distanciaMedida, tinteDe, unidadDistancia } from '../../kit-watch';
import { ANCLA_MEDIDA, RODAJE, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DESDE_S, DURACION_S, bpmDe, metrosDe, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-rodaje',
  titulo: 'Muñeca · rodaje',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-03',
  descripcion:
    'La modalidad donde el reloj mide todo lo suyo (pulso, ritmo y distancia) y la única sin una sola decisión dentro: se mira y no se toca de principio a fin.',
  fuentes: [],
  enApp:
    'En la app es el arquetipo genérico ContinuousLiveView, no una pantalla dedicada.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-senal',
    titulo: 'El mínimo · sin señal',
    descripcion:
      'El GPS aún no ha fijado. Sin ritmo y sin distancia el rodaje se queda en dos páginas, pulso y tiempo: ni un cero inventado, y ningún aro que llenar con una distancia que nadie está midiendo.',
  },
  {
    id: 'sin-umbral',
    titulo: 'Sin umbral',
    descripcion:
      'Ejecución 145: 10.000 m a 5:12/km. Con GPS pero sin ancla de FC, que es el 100 % de la base hoy. Manda el ritmo, el fondo va neutro y el pulso baja de sitio, en ppm crudos.',
  },
  {
    id: 'con-umbral',
    titulo: 'Con umbral medido',
    descripcion:
      'El mismo rodaje el día que un test escriba un umbral: el lienzo se tiñe con tu zona y el pulso sube a la primera página. Mismo entreno, otro sujeto.',
  },
];

function inicial(escenario: string): Estado {
  switch (escenario) {
    // Sin señal se arranca de cero: el GPS no ha fijado porque acabas de salir.
    case 'sin-senal':
      return { ancla: SIN_ANCLA, gps: false, t: 0 };
    case 'con-umbral':
      return { ancla: ANCLA_MEDIDA, gps: true, t: DESDE_S };
    default:
      return { ancla: SIN_ANCLA, gps: true, t: DESDE_S };
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual. El pulso se para al llegar al hito — el rodaje se acabó.
  useTicker(e.t < DURACION_S, () => {
    const t = e.t + 1;
    setE({ ...e, t });
    if (t >= DURACION_S && e.gps) {
      onLog(
        `Rodaje hecho · ${distanciaMedida(RODAJE.distanciaM)} ${unidadDistancia(RODAJE.distanciaM)} en ${clock(DURACION_S)}`,
      );
    }
  });

  const metros = metrosDe(e);

  return (
    <Reloj
      paginas={paginas(e)}
      // Sin ancla de FC no hay zona y no hay tinte: el fondo se queda negro.
      tinte={tinteDe(bpmDe(e), e.ancla)}
      // Un rodaje no tiene estructura que trocear: ni series, ni ventana, ni
      // estaciones. Lo único que puede drenar es la distancia, así que el aro
      // sólo existe cuando el GPS la está midiendo. Sin señal NO HAY BISEL: un
      // aro vacío, o clavado al 100 %, es cromo que miente sobre un dato que
      // nadie tiene.
      bisel={e.gps ? <AroContinuo fraccion={(RODAJE.distanciaM - metros) / RODAJE.distanciaM} /> : undefined}
      onLog={onLog}
    />
  );
}
