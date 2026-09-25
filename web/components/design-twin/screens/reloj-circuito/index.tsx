'use client';

// MUÑECA · CIRCUITO Y HYROX — propuesta del rediseño de la muñeca (25-09).
// Modelo: docs/reloj-muneca/modelo.md (P10, y P8 para el descanso). Kit: `kit-reloj/`.
//
// Cada tramo de carrera usa LA MISMA lámina de correr —el objetivo del coach
// manda— con la posición («Ronda 2/5 · Run 1000 m») y el crono total, que es la
// puntuación, siempre bajo el contexto. Cada estación dice nombre, dosis y
// carga; si algo la mide (el PM5) el número grande es lo que falta, y si nada
// la mide es su crono con «lo dices tú». La Roxzone es un paso propio si el
// coach la activa. Cada tramo, estación y Roxzone deja su parcial (el motor del
// kit; la página Ruta de la corona). La carrera comprometida se juzga en vivo contra el
// objetivo del coach; el coste propio (s/km sobre tu fresco) es del resumen.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoCircuito } from './vista';

export const meta: TwinMeta = {
  id: 'reloj-circuito',
  titulo: 'Muñeca · circuito y HYROX',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'La carrera comprometida con sentido: cada tramo usa la pantalla de correr con el crono total a la vista, cada estación dice su dosis y su carga, lo que nada mide lo dices tú, la Roxzone es un paso propio y cada tramo y estación deja su parcial.',
  fuentes: [],
  enApp:
    'Hoy el circuito se pliega en un solo segmento que se guarda como UNA vuelta con un ritmo mezclado (9:30/km cuando se corrió a 4:50), las estaciones medidas en metros enseñan una cuenta atrás congelada («te faltan 50 m» que nunca baja), el descanso entre estaciones no se ve y se pisa con un toque, y la Roxzone no existe.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'c493-carrera',
    titulo: '493 · la carrera comprometida · Ronda 2/5',
    descripcion:
      'Sesión 493, Run 1000 m @RPE 8 tras el SkiErg, a 170 m del final. La lámina de correr: manda lo que falta con «RPE 8 · ritmo de carrera» (la nota «a race pace» del coach es la palabra de su RPE), el ritmo actual debajo y el pulso abajo. Arriba, «Ronda 2/5 · Run 1000 m» y el total, que no se va. A 100 m, «Quedan cien»; a los 1000 m se cierra solo (.start×2 + «Run 2: 4:28. Entras a Burpee Broad Jump. Cuarenta metros.») y 3 s de «Entras a».',
  },
  {
    id: 'c493-ski',
    titulo: '493 · SkiErg 500 m con el PM5 · Ronda 1/5',
    descripcion:
      'Sesión 493, estación MEDIDA: «SkiErg · RPE 8,5», lo que falta lo cuenta el PM5 («quedan · PM5») y debajo el /500 actual. Se cierra sola a los 500 m (el tiempo queda como su parcial) y entra el descanso de 90″: la fase común del kit, «Viene: Ronda 2/5 · Run 1000 m · RPE 8».',
  },
  {
    id: 'c493-bbj',
    titulo: '493 · Burpee Broad Jump · lo dices tú',
    descripcion:
      'Sesión 493, estación que NADA mide: «40 m» sin cuenta atrás congelada; el número grande es el crono de la estación y encima «lo dices tú · doble toque». A los 3,5 s, doble toque: 5 s de «Estación hecha · Deshacer» y entra el descanso de 90″ (.stop + «Burpee Broad Jump: 1:15. Descanso, 90 segundos.»).',
  },
  {
    id: 'c493-descanso',
    titulo: '493 · el descanso de 90″ entre rondas',
    descripcion:
      'Sesión 493, quedan 14 s del r90″ tras los burpees. Visible y monocromo: cuenta atrás, «Viene: Ronda 3/5 · Run 1000 m · RPE 8», +30 s y Empezar ya. Un toque no lo salta; Empezar ya y el doble toque (en la pantalla o con la mano) dejan 5 s para deshacer. A 10 s el preaviso, 3-2-1 y GO a la ronda 3.',
  },
  {
    id: 'c492-ronda5',
    titulo: '492 · rondas con cuentas distintas · la 5 sin Farmers',
    descripcion:
      'Sesión 492, Trineos y carries: Sled Push 5 × 25 m @180 kg, Sled Pull 5 × 25 m @135 kg, Farmers 4 × 100 m @2 × 32 kg, r90″. Quedan 12 s del descanso tras los Farmers de la ronda 4: «Viene: Ronda 5/5 · Sled Push · 25 m · 180 kg», 3-2-1 y «Ronda 5/5 · Estación 1/2» — dos estaciones, no tres. Gira la corona: la Ruta enseña la ronda 4 con Farmers y la 5 sin ellos.',
  },
  {
    id: 'c506-amrap',
    titulo: '506 · el AMRAP 4′ dentro del chipper',
    descripcion:
      'Sesión 506, ronda 2/4: tras el Run 800 m, AMRAP 4′ de Walking Lunge. La tarea en la muñeca y lo que queda de la ventana; nada que contar en vivo: las reps se dicen en la campana (Alex, 25-09). A los 11 s suena (.stop + «Tiempo. ¿Cuántas Walking Lunge?») y la corona —el bisel, «Corona ▲▼» o la rueda sobre la esfera— pasa a las reps: el atleta sube a 16 y guarda con doble toque («Walking Lunge: 16 reps.» y el GO del Run 3). Lo que no se diga en 20 s queda sin declarar, nunca 0; la Ruta enseña las reps de la ronda 1.',
  },
  {
    id: 'hyrox-carrera',
    titulo: 'HYROX · Run 5/8 con el total y el cap',
    descripcion:
      'Simulación completa: orden y dosis de stations.ts, cargas de la plantilla 441 (dato del coach; stations.ts no trae cargas). El Run no lleva objetivo en la 441, así que manda lo que falta, con el ritmo actual en segundo y el pulso. Arriba «Run 5/8 · 1000 m» y el total con el cap (90′ de ejemplo: la 441 no lo trae).',
  },
  {
    id: 'hyrox-roxzone',
    titulo: 'HYROX · Run 8 → Roxzone → Wall Balls',
    descripcion:
      'Faltan 60 m del último Run. Al cerrarse solo entra la Roxzone como paso propio (.start×2 + «Run 8: 4:40. Roxzone. Entras a Wall Balls.»): «Roxzone · Estación 8/8», «entras a Wall Balls», «100 reps · 6 kg» y su crono con «doble toque · empiezo». A los 26 s, doble toque: empieza la estación y la Roxzone queda como su parcial.',
  },
  {
    id: 'hyrox-sled',
    titulo: 'HYROX · Sled Push lo dices tú → Roxzone de salida',
    descripcion:
      '«Sled Push · 50 m · 152 kg», el crono de la estación con «lo dices tú · doble toque». A los 3,5 s, doble toque: entra la Roxzone de salida («sales a Run 3/8», «sigue sola al correr»). El atleta anda 6 s y echa a correr: a los 3 s corriendo la muñeca la cierra sola y entra el Run 3 con su GO. La detección es simulada: A VALIDAR EN APARATO.',
  },
  {
    id: 'hyrox-sin-gesto',
    titulo: 'HYROX · Sled Push en un reloj sin doble toque',
    descripcion:
      'El mismo Sled Push en un reloj anterior a Series 9 / Ultra 2: la acción del momento es un botón visible de 44 pt, «Estación hecha», con el mismo deshacer de 5 s. La dosis sube al título para que el crono siga siendo grande; un toque fuera del botón no cierra nada (dos seguidos en la pantalla sí, como en Apple Entreno).',
  },
  {
    id: 'hyrox-ruta',
    titulo: 'HYROX · la ruta en la corona',
    descripcion:
      'Una vuelta de corona desde el Run 5: la Ruta con lo hecho y su parcial (Run 4, Burpee Broad Jump), la Roxzone sumada arriba, lo de ahora con su crono en blanco y lo que viene (Row, Run 6…). Otra vuelta: Datos, con los km CORRIDOS y su ritmo medio solo de los tramos de carrera (hoy sale mezclado con las estaciones).',
  },
  {
    id: 'hyrox-ski-pm5',
    titulo: 'HYROX · SkiErg con PM5',
    descripcion:
      'Estación 1/8 con el PM5 enlazado: el número grande es lo que falta de los 1000 m («quedan · PM5») y debajo el /500. Se cierra sola al llegar. Compárala con la siguiente.',
  },
  {
    id: 'hyrox-sin-pm5',
    titulo: 'HYROX sin PM5 · SkiErg lo dices tú',
    descripcion:
      'La misma estación sin PM5: nada cuenta los metros, así que no hay cuenta atrás que se congele. «1000 m · sin PM5» avisa de que esta vez no va sola, y manda el crono de la estación con «lo dices tú · doble toque».',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta).
  const [caso] = useState(() => casoDe(escenario));
  return <VivoCircuito caso={caso} onLog={onLog} />;
}
