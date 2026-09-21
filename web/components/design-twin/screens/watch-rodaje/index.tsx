'use client';

// LA LÁMINA DE CORRER, en la muñeca. Ver `guion.ts` para el porqué del sujeto.
//
// Una sola cara para las dos cosas que se corren por la calle: el rodaje de
// corrido y la serie. En la app son el mismo lienzo (`RodajeVivoPage`) y desde
// FH-30 también lo son EN ESPEJO, con el móvil llevando el entreno — que es el
// 90 % de los días.

import { useState } from 'react';
import { useTicker } from '../../sim';
import {
  AroContinuo,
  AroEstructura,
  Reloj,
  W,
  tinteDe,
  type ArcoDeTramo,
  type EstadoDestello,
} from '../../kit-watch';
import { ANCLA_MEDIDA, RODAJE, SERIES_CALLE, SIN_ANCLA } from '../../datos-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import {
  DESDE_S,
  DURACION_S,
  SERIE_DESDE_S,
  bpmDe,
  metrosDe,
  paginas,
  ventanaDe,
  type Estado,
} from './guion';

export const meta: TwinMeta = {
  id: 'watch-rodaje',
  titulo: 'Muñeca · la lámina de correr',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  actualizado: '2026-09-21',
  descripcion:
    'El sujeto es LO QUE FALTA de la pieza que corres —el rodaje entero o la serie—, el ritmo baja al segundo nivel y el resto de las medidas se van a su propia página. La misma cara sirve el rodaje y la serie, y desde FH-30 también en espejo: con el móvil en el bolsillo la muñeca pinta esta lámina (MirrorRodajeFace), no una pantalla genérica. El pager de la app es Datos | Vivo | Controles; aquí se dirige el vivo, que es el que se mira corriendo.',
  fuentes: [
    // La DECISIÓN (qué se pinta) y la MEDIDA (de qué se resta) — las dos vías
    // del reloj leen éstas, así que espejar el pintado sin ellas sería espejar
    // la mitad.
    'ios/FAHYBRIKCore/Watch/Lienzo/RodajeLamina.swift',
    'ios/FAHYBRIKCore/Watch/Lienzo/RodajeMedida.swift',
    'ios/FAHYBRIKWatch/Lienzo/RodajeLienzo.swift',
  ],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-senal',
    titulo: 'El mínimo · sin señal',
    descripcion:
      'El GPS aún no ha fijado. Sin distancia no hay resta que prometer: el sujeto cae al crono de la pieza, el ritmo desaparece en vez de pintarse a cero, y la nota dice por qué. Sin aro tampoco — uno vacío mentiría sobre un dato que nadie tiene.',
  },
  {
    id: 'sin-umbral',
    titulo: 'Rodaje · sin umbral',
    descripcion:
      'Ejecución 145: 10.000 m a 5:12/km. Con GPS pero sin ancla de FC, que es el 100 % de la base hoy. Manda lo que falta, el ritmo va debajo y el fondo se queda neutro: sin zona no hay tinte.',
  },
  {
    id: 'con-umbral',
    titulo: 'Rodaje · con umbral medido',
    descripcion:
      'El mismo rodaje el día que un test escriba un umbral: el lienzo se tiñe con tu zona al 45 %. Mismo sujeto, otro fondo — el color es un dato, no decoración.',
  },
  {
    id: 'serie',
    titulo: 'Serie de calle · 5 × 1.200 m',
    descripcion:
      'Ejecución 104 con el objetivo que escribió el coach. La MISMA lámina: cambia el sujeto (los metros que faltan de esta serie), el contexto («serie 3 de 5») y el veredicto del ritmo. Al cerrar entra la recuperación, que es el único momento con una decisión dentro — «toca · empezar ya» — y el único con el aro de la fase entera.',
  },
];

/**
 * LA FASE ENTERA EN EL BISEL — cinco series y sus cuatro trotes. El trote
 * también es entreno, y hasta que el aro no lo dibujó, la mitad de la fase no
 * existía justo en el rato en el que hay tiempo para mirarla.
 */
const ARCOS: ArcoDeTramo[] = Array.from({ length: SERIES_CALLE.total * 2 - 1 }, (_, i) => ({
  trabajo: i % 2 === 0,
  peso: 1,
}));

function inicial(escenario: string): Estado {
  switch (escenario) {
    // Sin señal se arranca de cero: el GPS no ha fijado porque acabas de salir.
    case 'sin-senal':
      return { escena: 'rodaje', gps: false, recupera: false, serie: 1, t: 0 };
    case 'serie':
      return {
        escena: 'serie',
        gps: true,
        recupera: false,
        serie: SERIES_CALLE.actual,
        t: SERIE_DESDE_S,
      };
    default:
      return { escena: 'rodaje', gps: true, recupera: false, serie: 1, t: DESDE_S };
  }
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.orangeSoft });
  const ancla = escenario === 'con-umbral' ? ANCLA_MEDIDA : SIN_ANCLA;

  // Durante la recuperación `serie` es la que ACABA de cerrarse: el contexto
  // anuncia la que viene («viene la 4») y sólo al salir se pasa a ella.
  const empezarYa = () => {
    const siguiente = e.serie >= SERIES_CALLE.total ? 1 : e.serie + 1;
    setE({ ...e, recupera: false, t: 0, serie: siguiente });
    setDestello((d) => ({ n: d.n + 1, color: W.orangeSoft }));
    onLog(`Serie ${siguiente} de ${SERIES_CALLE.total} · ${SERIES_CALLE.objetivoM} m`);
  };

  const cerrarSerie = () => {
    setE({ ...e, recupera: true, t: 0 });
    setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    onLog(`Serie ${e.serie} de ${SERIES_CALLE.total} · hito de ${SERIES_CALLE.objetivoM} m`);
  };

  // Sin `useRef` para «el estado más reciente»: `useTicker` ya guarda la última
  // versión del callback, así que el cierre sobre `e` de este render ES el
  // actual.
  useTicker(e.escena === 'serie' || e.t < DURACION_S, () => {
    if (e.escena === 'rodaje') {
      setE({ ...e, t: e.t + 1 });
      return;
    }
    if (e.recupera) {
      // La recuperación se agota sola; la serie siguiente entra con el mismo
      // gesto que el atleta puede adelantar.
      if (e.t + 1 >= SERIES_CALLE.recuperacionS) empezarYa();
      else setE({ ...e, t: e.t + 1 });
      return;
    }
    // El hito cierra la serie: el coach escribió los metros.
    if (metrosDe({ ...e, t: e.t + 1 }) >= SERIES_CALLE.objetivoM) {
      cerrarSerie();
      return;
    }
    setE({ ...e, t: e.t + 1 });
  });

  const v = ventanaDe(e);
  const metros = metrosDe(e);

  return (
    <Reloj
      paginas={paginas(v, { empezarYa })}
      // El 45 % de la lámina, no el 38 % del resto de modalidades: aquí el tinte
      // ES el fondo entero y no compite con ningún cromo (`RodajeTipo.tinteMax`).
      tintePct={45}
      // En la recuperación el lienzo es el VERDE de recuperar, que es un estado
      // y no una zona; corriendo es tu zona, si es que la hay.
      tinte={v.enRecupera ? W.zoneGreen : tinteDe(bpmDe(e), ancla)}
      // El rodaje sólo puede drenar la distancia, así que sin GPS NO HAY BISEL:
      // un aro vacío, o clavado al 100 %, es cromo que miente. La serie dibuja
      // la fase entera y no cambia de aro al entrar la recuperación: es el mismo
      // dibujo y lo único que se mueve es dónde estás dentro de él.
      bisel={bisel(e, v.enRecupera, metros)}
      destello={destello}
      onLog={onLog}
    />
  );
}

function bisel(e: Estado, enRecupera: boolean, metros: number) {
  if (e.escena === 'serie') {
    const enCurso = enRecupera ? (e.serie - 1) * 2 + 1 : (e.serie - 1) * 2;
    const fraccion = enRecupera
      ? e.t / SERIES_CALLE.recuperacionS
      : Math.min(1, metros / SERIES_CALLE.objetivoM);
    return <AroEstructura arcos={ARCOS} enCurso={enCurso} fraccion={fraccion} />;
  }
  if (!e.gps) return undefined;
  return <AroContinuo fraccion={(RODAJE.distanciaM - metros) / RODAJE.distanciaM} />;
}
