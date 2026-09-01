'use client';

// Correr, la mitad de la carrera.
//
// Es la vista más usada de la app: en HYROX ocho de los dieciséis tramos son
// correr, y en el plan semanal casi todo lo demás también. La propuesta parte
// de una tesis que la pantalla de hoy no tiene: **el sujeto depende del
// objetivo del tramo, no de la modalidad**. Correr no es una pantalla, son
// cuatro sujetos:
//
//   rodaje  → el objetivo es una ZONA          → manda el pulso, y tiñe el aire
//   series  → el objetivo es un HITO           → mandan los metros que faltan
//   descanso→ el objetivo es recuperar         → manda la cuenta atrás
//   espera  → todavía no hay nada que medir    → manda la verdad y la salida
//
// El espejo de lo shipeado (`../run-live`) tiene un solo sujeto para todos los
// casos, el ritmo, dentro de una tarjeta, con la distancia, el tiempo y el
// pulso repartidos en celdas iguales y la zona en otra tarjeta más abajo. Con
// eso, a 3:50 y mirando el suelo, no hay nada que se lea antes que lo demás: el
// dato que gobierna pesa lo mismo que el que acompaña. Aquí gobierna uno y el
// resto se subordina, incluso desapareciendo.
//
// Lo demás que cambia respecto del espejo, y por qué:
//  · la ZONA tiñe el lienzo entero, no un chip: el color se lee antes que
//    cualquier cifra y sobrevive al sudor y al brazo en movimiento;
//  · en distancia se pinta lo que QUEDA, drenando, no lo recorrido creciendo;
//  · no hay ni un «—:—»: sin señal no se pinta un ritmo, se pinta por qué no lo
//    hay (§7). Y lo declarado a mano viaja marcado hasta el final;
//  · el motor es una función pura del segundo (`simular`), así el guion se
//    reproduce idéntico y cerrar un tramo a mano es EL hito, no otra rama.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { EscenaBuscando } from './escena-buscando';
import { EscenaCinta } from './escena-cinta';
import { EscenaRodaje } from './escena-rodaje';
import { EscenaSeries } from './escena-series';

export const meta: TwinMeta = {
  id: 'vivo-correr',
  titulo: 'Correr, la mitad de la carrera',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-29',
  descripcion:
    'Cuatro sujetos, no cuatro pantallas: la zona te tiñe el aire en el rodaje, los metros que faltan mandan en las series, el descanso es pantalla propia y sin señal no se inventa un ritmo. Gira el marco: el readout se va a columnas.',
  fuentes: [],
  enApp:
    'El tinte de zona y los HUD de calle/cinta están shipeados (OutdoorRunHUDView, TreadmillHUDView); faltan el sujeto «metros que faltan» y el arranque gateado por GPS.',
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'rodaje',
    titulo: 'Rodaje · 40:00 en Z2',
    descripcion:
      'El pulso manda y el color del lienzo es tu zona. A los 10 s salta el km 3 con su parcial; a los 22 el pulso se va a Z3 sin que cambie el ritmo.',
  },
  {
    id: 'series-calle',
    titulo: '8×400 · manda el hito',
    descripcion:
      'Serie 3: drenan los metros que faltan y el ritmo se juzga contra 1:32. Al cruzar los 400, destello y el descanso pasa a ser la pantalla.',
  },
  {
    id: 'cinta',
    titulo: 'Cinta · 5×1000, honesta',
    descripcion:
      'La velocidad se LEE de la máquina en km/h. A los 20 s deja de compartirla: se para de contar metros, se dice, y se declara con un toque.',
  },
  {
    id: 'gps-buscando',
    titulo: 'Sin señal todavía',
    descripcion:
      'La espera, honesta: qué hacer para que fije y a qué sales. EMPEZAR no se enciende hasta que hay señal, a los 6 s.',
  },
];

export function Screen({ orientation, appearance, escenario, onLog }: TwinScreenProps) {
  const horizontal = orientation === 'landscape';
  const props = { horizontal, appearance, onLog };

  switch (escenario) {
    case 'series-calle':
      return <EscenaSeries {...props} />;
    case 'cinta':
      return <EscenaCinta {...props} />;
    case 'gps-buscando':
      return <EscenaBuscando {...props} />;
    default:
      return <EscenaRodaje {...props} />;
  }
}
