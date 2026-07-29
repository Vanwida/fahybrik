'use client';

// For Time — la ruta y el suceso.
//
// El entreno en vivo de hoy resuelve bien el tramo que dura un rato. Lo que no
// tiene resuelto es el bloque donde el trabajo es fijo, el crono es la
// puntuación y las transiciones no las manda un minuto: las manda un SUCESO.
//
// La tesis de esta familia, en una línea: el suceso lo conoce el aparato, y no
// hay dos aparatos iguales. Los metros los sabe el remo, los km los sabe el
// reloj, y las repeticiones no las sabe nadie. Esa diferencia no es un detalle
// de pintura — decide quién es el sujeto de la pantalla, si la estación puede
// cerrarse sola, qué se puede escribir en el tachado cuando se cierra, y desde
// el 29-jul también QUÉ CARA sale al girar el móvil:
//
//   EL TRAMO DECIDE LA CARA; EL FORMATO NUNCA SUELTA LA FRANJA.
//
// Con una máquina delante, el horizontal es la cara del monitor. Sin ella, es
// el HUD del formato. Y en las dos, arriba, el crono del bloque: girar cambia
// lo que miras, nunca cuánto llevas.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { EscenaHyrox } from './escena-hyrox';
import { EscenaPulso } from './escena-pulso';

export const meta: TwinMeta = {
  id: 'vivo-fortime',
  titulo: 'For Time — la ruta y el suceso',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'El crono sube y el trabajo es fijo. La estación es el tramo, el reloj del bloque es la puntuación y no se va nunca, y de cada estación se sale por donde se puede: cruzando el objetivo si alguien lo mide, o con tu toque si no lo mide nadie. Gíralo: con máquina delante sale la cara del monitor, sin ella el HUD del formato, y la franja se queda en las dos.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hyrox-remo',
    titulo: 'Estación 10 de 16 · el remo',
    descripcion:
      'La medida corre sola y la estación se cierra al cruzar. Mira el tachado: 1.014 m, que es lo que leyó el remo, no los 1.000 que pedía el plan. Gíralo para la cara de monitor, y no lo sueltes al cruzar: el tramo siguiente es un Run y la cara cambia sola.',
  },
  {
    id: 'ruta-entera',
    titulo: 'Las 16, de un vistazo',
    descripcion:
      'La ruta entera con los parciales reales de lo cerrado. Fíjate en las estaciones sin medida: ahí solo hay tiempo, y así se queda. En horizontal se parte en dos columnas y caben las 16 sin scroll.',
  },
  {
    id: 'a-pulso-cap',
    titulo: '21-15-9 con cap de 12:00',
    descripcion:
      'Nadie cuenta repeticiones, así que no hay contador: el sujeto es el trabajo que tienes delante y cada tanda la cierras tú. Aquí no hay máquina, así que al girar no hay cara de monitor: manda el formato.',
  },
  {
    id: 'cap-encima',
    titulo: 'Queda menos de un minuto',
    descripcion:
      'La franja se pone naranja y lo dice sin dramatizar, gires como gires. Si el cap muere, la puntuación pasa a ser las repeticiones cerradas.',
  },
];

export function Screen({ escenario, orientation, onLog }: TwinScreenProps) {
  const aPulso = escenario === 'a-pulso-cap' || escenario === 'cap-encima';
  // La orientación es un PROP, no una clave de remontaje: el estudio no cambia
  // la `key` al girar, así que el guion, el crono y tus cortes siguen donde
  // estaban. Girar enseña lo mismo de otra manera; no reinicia nada.
  const landscape = orientation === 'landscape';
  return (
    <div className="twin-screen-safe">
      {aPulso ? (
        <EscenaPulso escenario={escenario} landscape={landscape} onLog={onLog} />
      ) : (
        <EscenaHyrox escenario={escenario} landscape={landscape} onLog={onLog} />
      )}
    </div>
  );
}
