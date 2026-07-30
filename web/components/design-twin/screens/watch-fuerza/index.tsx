'use client';

// El hierro, en la muñeca. Ver `guion.ts` para el porqué de las dos pantallas.

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
import { ANCLA_MEDIDA, FUERZA_DOSIS_NULA, FUERZA_SIN_FC, FUERZA_TIPICA, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { bpmDe, paginas, type Estado } from './guion';

export const meta: TwinMeta = {
  id: 'watch-fuerza',
  titulo: 'Muñeca · fuerza',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'El reloj está en la muñeca que sostiene la barra: durante la serie no pide nada, sólo enuncia. La decisión y los controles viven en el descanso.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-fc',
    titulo: 'El mínimo · sin pulso',
    descripcion:
      'Ejecución 171: 4×10 a 82,5 kg y el reloj no registró NI el pulso. Una sola página, fondo neutro y cero color: no hay ningún dato que colorear.',
  },
  {
    id: 'dosis-nula',
    titulo: 'Sin repeticiones',
    descripcion:
      'El circuito de pierna real: cuatro series y 30 kg, y el coach no escribió las reps. Se pinta la carga sola — ni «— reps» ni un 0.',
  },
  {
    id: 'tipica',
    titulo: 'La serie completa',
    descripcion:
      'Ejecución 162: 4×5 a 100 kg con 90 s. El bucle entero — serie (ciego) → descanso (mando) → serie. Fíjate en que la acción cambia de peso.',
  },
  {
    id: 'con-umbral',
    titulo: 'Con umbral medido',
    descripcion:
      'La misma serie el día que un test escriba un umbral: entonces, y sólo entonces, el lienzo se tiñe con tu zona.',
  },
];

function inicial(escenario: string): Estado {
  const base = { fase: 'serie', t: 0 } as const;
  switch (escenario) {
    case 'sin-fc':
      return { ...base, caso: FUERZA_SIN_FC, ancla: SIN_ANCLA, serie: FUERZA_SIN_FC.serieActual };
    case 'dosis-nula':
      return { ...base, caso: FUERZA_DOSIS_NULA, ancla: SIN_ANCLA, serie: FUERZA_DOSIS_NULA.serieActual };
    case 'con-umbral':
      return { ...base, caso: FUERZA_TIPICA, ancla: ANCLA_MEDIDA, serie: FUERZA_TIPICA.serieActual };
    default:
      return { ...base, caso: FUERZA_TIPICA, ancla: SIN_ANCLA, serie: FUERZA_TIPICA.serieActual };
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual. Un ref aquí, además de sobrar, lo caza `react-hooks/refs`.
  const cerrarSerie = () => {
    const ultima = e.serie >= e.caso.series;
    setE({ ...e, fase: 'descanso', t: 0, serie: ultima ? 1 : e.serie + 1 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(
      ultima
        ? `Serie ${e.serie} hecha · bloque cerrado`
        : `Serie ${e.serie} hecha · descanso ${e.caso.descansoS} s`,
    );
  };

  const empezarYa = () => {
    setE({ ...e, fase: 'serie', t: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Serie ${e.serie} de ${e.caso.series} · ${e.caso.reps ?? '?'} × ${e.caso.cargaKg} kg`);
  };

  // El descanso se agota solo; la serie NO. La serie la cierra el atleta,
  // porque nadie más sabe cuándo has soltado la barra (handoff: en fuerza
  // gobierna la transición el ATLETA).
  useTicker(true, () => {
    if (e.fase === 'descanso' && e.t + 1 >= e.caso.descansoS) empezarYa();
    else setE({ ...e, t: e.t + 1 });
  });

  const bpm = bpmDe(e);
  const enDescanso = e.fase === 'descanso';
  const queda = Math.max(0, e.caso.descansoS - e.t);

  return (
    <Reloj
      paginas={paginas(e, { cerrarSerie, empezarYa })}
      // En el descanso el lienzo es el VERDE de recuperación, que es un estado
      // y no una zona; durante la serie es tu zona, si es que la hay.
      tinte={enDescanso ? W.zoneGreen : tinteDe(bpm, e.ancla)}
      bisel={
        enDescanso ? (
          <AroContinuo fraccion={queda / e.caso.descansoS} />
        ) : (
          <AroSegmentado total={e.caso.series} hechas={e.serie - 1} fraccion={0} />
        )
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
