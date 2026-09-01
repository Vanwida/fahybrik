'use client';

// El For Time, en la muñeca. Ver `guion.ts` para el porqué de las dos caras: la
// mitad de la carrera el reloj mide, y la otra mitad no ve absolutamente nada.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroRuta, Reloj, W, type EstadoDestello } from '../../kit-watch';
import { FORTIME, RUTA_FORTIME } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { cronoCarrera, fraccionMedida, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-fortime',
  titulo: 'Muñeca · For Time',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-03',
  descripcion:
    'El crono total es la puntuación y no se va de la pantalla. En 8 de las 16 estaciones el reloj no mide nada más: la forma de la ruta se va al bisel, que es el único sitio donde cabe.',
  fuentes: [],
  enApp:
    'FixedLiveView shipea el crono-puntuación, la estación y la transición; falta el bisel.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'estacion-ciega',
    titulo: 'El mínimo · estación ciega',
    descripcion:
      'Sled Push: 50 m con 152 kg y el reloj sin ver un solo metro. Una página, el crono, y la dosis que escribió el coach. Fíjate en que el bisel se apaga justo donde el reloj deja de medir.',
  },
  {
    id: 'tramo-de-carrera',
    titulo: 'Tramo de carrera',
    descripcion:
      'El sexto Run de 1 km: aquí el GPS sí mide, así que aparece una segunda página con los metros que faltan. El crono sigue siendo la primera.',
  },
];

/** El Sled Push de la ruta — 50 m · 152 kg, y el reloj no ve nada de él. */
const ESTACION_CIEGA = RUTA_FORTIME.findIndex((x) => x.nombre === 'Sled Push');

/**
 * Dónde cae un segundo del crono en la forma ESTIMADA de la ruta. Sirve sólo
 * para arrancar la reproducción en un sitio coherente; no se le dice nunca al
 * atleta, porque los pesos de `RUTA_FORTIME` son duraciones estimadas y no un
 * reloj. (Los 2.480 s de `FORTIME.desdeS` caen dentro del sexto Run.)
 */
function estacionEn(segundos: number): { estacion: number; enEstacionS: number } {
  let resto = Math.max(0, segundos);
  for (let i = 0; i < RUTA_FORTIME.length; i += 1) {
    const peso = RUTA_FORTIME[i]!.peso;
    if (resto < peso) return { estacion: i, enEstacionS: resto };
    resto -= peso;
  }
  return { estacion: RUTA_FORTIME.length - 1, enEstacionS: 0 };
}

function inicial(escenario: string): Estado {
  // El crono arranca en el mismo sitio en los dos escenarios: es la única cifra
  // real que existe de un For Time y es la que hay que ver a los dos tamaños.
  // Que en la estación ciega no cuadre con la forma de la ruta no es un fallo —
  // los pesos son estimaciones, y ir por detrás de la estimación es lo normal:
  // la ejecución 59 acabó en 73:00 y la ruta estimada suma 66.
  if (escenario === 'tramo-de-carrera') {
    return { cronoS: FORTIME.desdeS, ...estacionEn(FORTIME.desdeS) };
  }
  return { estacion: ESTACION_CIEGA, cronoS: FORTIME.desdeS, enEstacionS: 0 };
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.zoneGreen });

  // Nada avanza solo en un For Time: no hay descanso que se agote ni hito que
  // cierre una estación. Lo único que corre es el crono.
  useTicker(true, () => setE({ ...e, cronoS: e.cronoS + 1, enEstacionS: e.enEstacionS + 1 }));

  const estacionHecha = () => {
    const ultima = e.estacion >= RUTA_FORTIME.length - 1;
    const siguiente = ultima ? 0 : e.estacion + 1;
    setE({ ...e, estacion: siguiente, enEstacionS: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(
      ultima
        ? `For Time cerrado · ${cronoCarrera(e.cronoS)}`
        : `${RUTA_FORTIME[e.estacion]!.nombre} hecha · viene ${RUTA_FORTIME[siguiente]!.nombre}`,
    );
  };

  return (
    <Reloj
      paginas={paginas(e, { estacionHecha })}
      // Negro, siempre. La ejecución 59 no dejó una sola fila de segmentos, así
      // que no hay FC que reproducir; sin FC no hay zona, y sin zona no hay
      // tinte. El color es un dato (§10.1).
      tinte={null}
      // Las 16 estaciones no caben en ninguna lista de la muñeca, pero SÍ caben
      // en el borde: cuántas llevas, cuánto pesaba cada una y en cuál estás, a
      // coste cero de altura de contenido.
      bisel={
        <AroRuta
          pesos={RUTA_FORTIME.map((x) => x.peso)}
          activo={e.estacion}
          fraccion={fraccionMedida(e)}
        />
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
