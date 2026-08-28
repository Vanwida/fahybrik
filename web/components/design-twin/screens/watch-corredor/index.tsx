'use client';

// EL CORREDOR EN LA MUÑECA — la misma interfaz que el teléfono, con 188 pt.
//
// No hay una línea de diseño propia aquí: el sujeto, el contexto, el segundo
// nivel, el juicio del ritmo y el cierre de la estación salen todos de
// `screens/corredor/guion.ts`, que es el mismo fichero que lee el iPhone. Ésa
// es la respuesta al hallazgo de la card 105 — espejo y standalone divergían
// porque cada uno decidía por su cuenta qué enseñar, y ahora no hay dos sitios
// donde decidirlo.
//
// Lo único que esta pantalla decide es lo que es propio del reloj: el reparto
// en páginas, el aro de la ruta y el destello de la transición. Todo lo demás
// lo hace cumplir `kit-watch`.

import { useState } from 'react';
import { useTicker } from '../../sim';
import { AroRuta, Reloj, W, type EstadoDestello } from '../../kit-watch';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import {
  FUNDIDO,
  RUTA,
  avanzar,
  cerrarPorToque,
  estado,
  fraccionEstacion,
  mensajeSuceso,
  paginas,
  type Estado,
  type Suceso,
} from '../corredor/guion';

export const meta: TwinMeta = {
  id: 'watch-corredor',
  titulo: 'El corredor · muñeca',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'La misma interfaz que el teléfono, con 188 pt: el sujeto es lo que FALTA de la estación que tienes delante (284 m), el segundo nivel es el ritmo contra el objetivo del coach, y el cap sólo se enciende cuando aprieta. Lee el mismo `guion.ts` que la pantalla del iPhone — no hay dos sitios donde decidir qué se ve.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'estacion-carrera',
    titulo: 'Estación 3/8 · Run 800 m, cap 4:00',
    descripcion:
      'Lo que hoy es «Ronda 3/8» y un cronómetro. Ahora: la estación con su nombre, los metros que faltan como sujeto y el ritmo con su juicio debajo. Desliza para el cap y la puntuación, y otra vez para el pulso. Abre la misma pantalla en el iPhone («El corredor · iPhone») en este mismo escenario: es el mismo instante en las dos.',
  },
  {
    id: 'cap-encima',
    titulo: 'El cap apretando',
    descripcion:
      'Séptima estación, piernas fundidas y 28 s de techo. El sujeto se pone naranja: hasta hoy el `time_cap` corría en el motor y no se veía en la muñeca por ningún sitio. Fíjate en que el ritmo se pone rojo y dice «aprieta» sin una sola frase motivacional.',
  },
  {
    id: 'estacion-ciega',
    titulo: 'Estación ciega · 60 wall balls',
    descripcion:
      'Nadie cuenta un wall ball, así que no falta nada medible: el sujeto cae al reloj de la estación y la dosis del coach pasa al segundo nivel. Y el aro se apaga justo donde el reloj deja de medir. No es otra pantalla — es la misma regla con el otro desenlace.',
  },
  {
    id: 'sin-senal',
    titulo: 'El GPS todavía no fija',
    descripcion:
      'Primera estación, recién salido. Sin fijar no hay metros ni ritmo y no se inventan: manda el reloj de la estación y la nota lo dice. A los pocos segundos fija — y ahí verás lo que hoy sale mal en el iPhone: con la señal buena y CERO metros cubiertos, el sujeto lee 800 m que faltan, nunca «sin medir».',
  },
];

function inicial(escenario: string): Estado {
  if (escenario === 'cap-encima') {
    return estado({
      estacion: 6,
      bloqueS: 1_402,
      enEstacionS: 212,
      piernas: FUNDIDO,
      ppm: 176,
      parciales: [209, 168, 221, 118, 236, 174],
    });
  }
  if (escenario === 'estacion-ciega') {
    return estado({ estacion: 1, bloqueS: 283, enEstacionS: 74, ppm: 172, parciales: [209] });
  }
  if (escenario === 'sin-senal') {
    return estado({ estacion: 0, bloqueS: 4, enEstacionS: 4, senal: 'buscando', ppm: 138, parciales: [] });
  }
  return estado();
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [e, setE] = useState<Estado>(() => inicial(escenario));
  const [destello, setDestello] = useState<EstadoDestello>({ n: 0, color: W.zoneGreen });

  const aplicar = ({ estado: nuevo, sucesos }: { estado: Estado; sucesos: Suceso[] }) => {
    setE(nuevo);
    for (const s of sucesos) {
      onLog(mensajeSuceso(s));
      if (s.tipo === 'estacion-cerrada') setDestello((d) => ({ n: d.n + 1, color: W.zoneGreen }));
    }
  };

  // Nada avanza solo en un chipper salvo el tiempo y los metros del GPS: el
  // avance vive en `guion.avanzar`, que es el mismo que corre el teléfono.
  useTicker(true, () => aplicar(avanzar(e)));

  return (
    <Reloj
      paginas={paginas(e, { estacionHecha: () => aplicar(cerrarPorToque(e)) })}
      // Negro. No hay ancla de FC en ningún atleta de la base, y sin ancla no
      // hay zona: el color es un dato (§10.1). Idéntico en el iPhone.
      tinte={null}
      // Las 8 estaciones no caben en ninguna lista de la muñeca, pero sí en el
      // borde: dónde estás, cuánto pesaba cada una y cuánto llevas de ésta, a
      // coste cero de altura de contenido.
      bisel={
        <AroRuta pesos={RUTA.map((x) => x.peso)} activo={e.estacion} fraccion={fraccionEstacion(e)} />
      }
      destello={destello}
      onLog={onLog}
    />
  );
}
