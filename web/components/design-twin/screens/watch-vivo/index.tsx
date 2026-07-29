'use client';

// La muñeca, rediseñada — propuesta para el entreno en vivo del Apple Watch.
//
// EL PROBLEMA: 40 mm a distancia de brazo, en movimiento y sudando. Ahí el
// sujeto es casi lo único que cabe, y todo lo demás tiene que ser OTRA PÁGINA,
// no letra pequeña alrededor. La app de reloj de hoy (pantalla «El entreno en
// la muñeca») acierta el principio (un solo botón grande, pocas métricas) y
// falla la ejecución: gasta 52 pt de alto en el botón y otros tantos en tejas
// de métricas, y el héroe se queda en 54 px de cuerpo.
//
// LA PROPUESTA, en tres movimientos que se aplican igual en los cuatro guiones:
//
//   1. La pantalla ES el botón. Los 52 pt del botón vuelven al sujeto.
//   2. El progreso se dibuja en el BISEL, trazando el borde redondeado del
//      lienzo: cuesta cero altura y se ve de reojo. En las series, además, se
//      trocea en 8 y lleva el «3 de 8» sin gastar una línea.
//   3. Dos niveles por página y ni uno más. Lo que no cabe no se encoge: se va
//      a la segunda página, que en los cuatro casos es el CUERPO (pulso y zona),
//      porque el pulso es lo único que el reloj mide siempre por sí mismo.
//
// El fondo entero se tiñe con tu zona, a sangre. En un OLED eso es gratis y es
// lo que se lee sin enfocar la vista.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Amrap } from './amrap';
import { Emom } from './emom';
import { Fuerza } from './fuerza';
import { Serie } from './serie';

export const meta: TwinMeta = {
  id: 'watch-vivo',
  titulo: 'La muñeca, rediseñada',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'El entreno en vivo del reloj con el sujeto al doble de tamaño: la pantalla es el botón, el progreso se traza en el bisel y el pulso vive en una segunda página.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'correr-series',
    titulo: 'Series de 400',
    descripcion:
      'Serie 3 de 8: los metros que faltan mandan, el aro trocea las 8 series y el fondo es tu zona.',
  },
  {
    id: 'emom',
    titulo: 'EMOM',
    descripcion:
      'Ronda 4 de 12: el minuto drena en el bisel y, al marcar la tarea, el lienzo entero pasa a recuperación.',
  },
  {
    id: 'fuerza-descanso',
    titulo: 'Descanso de fuerza',
    descripcion:
      'Los 90 s reales de la plantilla 497: la cuenta atrás manda y debajo, en una línea, la serie que viene.',
  },
  {
    id: 'amrap',
    titulo: 'AMRAP',
    descripcion:
      'Los últimos 39 s: las rondas a tamaño máximo, tocar suma una y el marcador late al hacerlo.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  switch (escenario) {
    case 'emom':
      return <Emom onLog={onLog} />;
    case 'fuerza-descanso':
      return <Fuerza onLog={onLog} />;
    case 'amrap':
      return <Amrap onLog={onLog} />;
    default:
      return <Serie onLog={onLog} />;
  }
}
