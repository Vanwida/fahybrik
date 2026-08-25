'use client';

// Muchas rondas — el contador que no crece.
//
// PROPUESTA. El 10-ago un fartlek de 16 series dejó EMPEZAR fuera de la
// pantalla: la lista de rondas medía ~2.600 pt sobre un lienzo de 874, el
// `ZStack` del entreno creció con ella y la puerta del bloque, hermana suya, se
// quedó centrada en un alto imposible. Aquel día se arregló la RUTA (una
// carrera con estructura ya no cae en el HUD de For Time) y se dejó escrito
// que el caso general seguía abierto: un metcon de muchas rondas revienta el
// alto igual, y es decisión de UX. Esta pantalla es esa decisión.
//
// EL MODELO, y es lo que la hace distinta de un recorte: una lista de 16
// ESTACIONES y una de 16 RONDAS no son el mismo problema. Las estaciones son
// heterogéneas y colapsarlas destruye información — su respuesta ya existe, es
// la ventana de tres más la hoja entera de `vivo-fortime`. Las rondas son
// HOMOGÉNEAS: la fila 12 repite literalmente la fila 11, así que una lista de
// doce rondas gasta 681 pt en escribir doce veces lo que cabe en una frase.
// Colapsarlas no quita información: la concentra.
//
// LOS DATOS son los cinco bloques de la biblioteca que repiten rondas, verbatim
// de `blocks.description`: 4, 6, 8, 10 y 12. No hay ninguno de 16 y no se ha
// inventado uno — el alto del contador no depende del número de rondas, y eso
// se demuestra con la escalera real (ver `data.ts`).

import { useCallback, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { useCronoComprimido } from '../../sim';
import { CABEN_HOY, CABEN_PROPUESTA, CASOS, SIM_X, UMBRAL_CONTADOR, WOD_8R_CAP, altoLista, FILA_HOY_PT } from './data';
import { Hoy } from './hoy';
import { Propuesta } from './propuesta';
import { Sello } from './sello';

/** Último minuto de tope: la franja se pone naranja y lo dice. */
const AVISO_TOPE_S = 60;

export const meta: TwinMeta = {
  id: 'vivo-rondas',
  titulo: 'Muchas rondas — el contador que no crece',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  actualizado: '2026-08-25',
  descripcion:
    'La lista de rondas del vivo pinta una fila por ronda y no scrollea, así que a partir de cuatro empuja lo que tiene debajo: es lo que el 10-ago dejó EMPEZAR fuera de pantalla. El trabajo sale de las filas y se escribe una vez, y cuando ni así cabe la lista se colapsa en un contador con la ronda actual grande, la anterior y la siguiente insinuadas. Con cuatro rondas o con treinta, la pantalla mide lo mismo.',
  fuentes: [
    'ios/FAHYBRIK/Workout/RoundsLiveHUD.swift',
    'ios/FAHYBRIK/Workout/WorkoutFormatHUDs.swift',
    'ios/FAHYBRIK/Workout/WorkoutSessionLiveDescriptor.swift',
  ],
  enApp:
    'Portada el 11-ago: `RoundsLiveHUD` — la lista de una línea mientras cabe (banda del trabajo fija, umbral derivado del hueco real en `RoundsListBudget`) y el contador con la ronda actual grande cuando no. El botón del host cierra ronda a ronda («RONDA HECHA») y la muñeca dice el mismo número que la pantalla.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'en-vivo',
    estrategia: 'gobierna',
    sujeto:
      'Con muchas rondas, dónde vas: «RONDA 4/8», que es el dato que se te cae de la cabeza sudando. Con pocas vuelve a mandar el trabajo, porque de cuatro rondas nadie pierde la cuenta.',
    diagnostico: `La fila de hoy mide ${FILA_HOY_PT} pt porque repite el trabajo en cada ronda, y el marco del vivo solo deja 213 pt de apoyos: caben ${CABEN_HOY} rondas. El WOD de 4 rondas de la biblioteca ya se sale (${altoLista(4, FILA_HOY_PT)} pt), el de 8 con tope pide ${altoLista(8, FILA_HOY_PT)} y el de 12 pide ${altoLista(12, FILA_HOY_PT)}. Como la ranura del vivo no scrollea en vertical (§10.3), lo que sobra no se recorta: empuja.`,
    resuelve: `El trabajo sube a la banda y se escribe UNA vez (§10.6): la fila baja a una línea y la lista pasa de ${CABEN_HOY} rondas a ${CABEN_PROPUESTA}. Desde la ${UMBRAL_CONTADOR}ª se colapsa en el contador, y el alto deja de depender del número de rondas. Los parciales que la lista escribía uno por fila pasan al hilo, que además dice si te estás cayendo: eso la lista no lo decía.`,
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'ocho-con-tope',
    titulo: 'WOD 8 rondas con tope de 17:00',
    descripcion:
      'El único bloque de la base con formato metcon. Ocho rondas de tres movimientos: hoy son 465 pt de lista sobre 213, y en la propuesta el contador. Mira el hilo: las tres cerradas van de menos a más y lo dice sin dramatizar.',
  },
  {
    id: 'cuatro-rondas',
    titulo: 'WOD HYROX de 4 rondas',
    descripcion:
      'Pocas rondas, así que la lista se queda: el trabajo manda en la banda y las cuatro rondas caben debajo. Y aun así HOY se sale por 36 pt, porque hoy cada fila repite el trabajo. Cambia a «hoy» y compáralo.',
  },
  {
    id: 'seis-rondas',
    titulo: 'WOD corto AFAP, 6 rondas',
    descripcion:
      'La primera que no cabe como lista: seis rondas de cuatro movimientos. Es el caso que fija el umbral, y donde se ve que el contador no pierde el trabajo, lo escribe mejor.',
  },
  {
    id: 'diez-trineo',
    titulo: 'METCON de trineo, 10 rondas de 45/15',
    descripcion:
      'Aquí la ronda la cierra el RELOJ a los 45 s, no tu toque, así que la franja de acción va de contorno y todos los parciales miden lo mismo. El hilo plano es la verdad de este bloque.',
  },
  {
    id: 'doce-rondas',
    titulo: 'Doce rondas de 400 m',
    descripcion:
      'El bloque más largo de la biblioteca. Hoy pide 681 pt de lista; el contador mide exactamente lo que medía con cuatro rondas. Mantén pulsada la ronda de arriba para deshacerla, igual que en la lista.',
  },
];

export function Screen({ escenario, vista, appearance, onLog }: TwinScreenProps) {
  const metcon = CASOS[escenario] ?? WOD_8R_CAP;
  const [cerradas, setCerradas] = useState<number[]>(() => [...metcon.cerradas]);
  const { t, pausado, alternarPausa } = useCronoComprimido(SIM_X);

  const inicioS = cerradas.reduce((a, b) => a + b, 0);
  const acabado = cerradas.length >= metcon.rondas;
  // Tres relojes y una sola verdad: mientras corre, la puntuación es el crono;
  // al cerrar la última ronda se congela ahí; si muere el tope, en el tope.
  const brutoS = metcon.aperturaS + t;
  const muerto = !acabado && metcon.capS != null && brutoS >= metcon.capS;
  const scoreS = acabado ? inicioS : metcon.capS != null ? Math.min(brutoS, metcon.capS) : brutoS;
  const parcialS = Math.max(0, scoreS - inicioS);

  const avanzar = useCallback(() => {
    setCerradas((previas) => {
      if (previas.length >= metcon.rondas) return previas;
      const inicio = previas.reduce((a, b) => a + b, 0);
      const parcial = Math.max(1, Math.round(scoreS - inicio));
      onLog(`Ronda ${previas.length + 1} cerrada en ${Math.round(parcial)} s`);
      return [...previas, parcial];
    });
  }, [metcon.rondas, scoreS, onLog]);

  // Deshacer la última: el mantenido de la lista de hoy, que el contador no
  // puede perder por el camino.
  const deshacer = useCallback(() => {
    setCerradas((previas) => {
      if (previas.length === 0) return previas;
      onLog(`Ronda ${previas.length} deshecha: vuelves a ella con su tiempo corriendo`);
      return previas.slice(0, -1);
    });
  }, [onLog]);

  if (acabado || muerto) {
    return (
      <div className="twin-screen-safe">
        <Sello
          metcon={metcon}
          muerto={muerto}
          scoreS={acabado ? scoreS : (metcon.capS ?? scoreS)}
          cerradas={cerradas}
          appearance={appearance}
          onLog={onLog}
        />
      </div>
    );
  }

  const cap =
    metcon.capS != null
      ? (() => {
          const restanteS = Math.max(0, metcon.capS - scoreS);
          return { totalS: metcon.capS, restanteS, urgente: restanteS <= AVISO_TOPE_S };
        })()
      : undefined;

  const comun = {
    metcon,
    vivoS: scoreS,
    activa: cerradas.length,
    cerradas,
    parcialS,
    pausado,
    onPausa: alternarPausa,
    onAvanzar: avanzar,
    cap,
    appearance,
  };

  return (
    <div className="twin-screen-safe">
      {vista === 'hoy' ? <Hoy {...comun} /> : <Propuesta {...comun} onDeshacer={deshacer} />}
    </div>
  );
}
