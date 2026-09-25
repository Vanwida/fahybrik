'use client';

// MUÑECA · LA GRAMÁTICA — propuesta del rediseño de la muñeca (25-09).
// Modelo: docs/reloj-muneca/modelo.md (P4, P5, P6, P7, §3, §4). Kit: `kit-reloj/`.
//
// La carcasa común a TODO el vivo, igual en correr, fuerza, estaciones y WOD:
// izquierda = controles, centro = pila vertical con la corona, derecha = Ahora
// suena. Tocar la pantalla no cierra nada; cerrar a mano es doble toque, botón
// Acción o un botón acotado, con 5 s para deshacer. Y el lenguaje: un evento,
// un háptico (con su voz), un color, un significado, SF recto con cifras fijas.

import { useState } from 'react';
import { VivoDePlan, type Secuencia } from '../../kit-reloj';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CaraEstacion, CaraFuerza } from './caras';
import { ColorTipo } from './color-tipo';
import { Lenguaje } from './lenguaje';
import {
  INICIO_CINTA,
  INICIO_SERIE3,
  cuerpoCintaEspejo,
  cuerpoEstacion,
  cuerpoFuerza,
  cuerpoSeries,
  planCintaEspejo,
  planEstacion,
  planFuerza,
  planSeries,
} from './planes';

export const meta: TwinMeta = {
  id: 'reloj-gramatica',
  titulo: 'Muñeca · la gramática',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'La carcasa común a todo el vivo: controles a la izquierda, corona en vertical, Ahora suena a la derecha; pausa, deshacer, dato viejo y muñeca abajo; y el lenguaje: un evento, un háptico y su voz; un color, un significado; SF recto con cifras fijas.',
  fuentes: [],
  enApp:
    'Hoy el reloj pone los controles a la DERECHA, pagina con un deslizador propio (`WatchReloj`) metido dentro del `TabView` del sistema, cierra una serie con un toque en cualquier sitio y usa un mismo háptico para cuatro cosas; no tiene corona, doble toque, botón Acción ni Water Lock. Esto lo sustituye entero: la gramática de Apple Entreno, un evento por háptico y el deshacer.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'controles-correr',
    titulo: 'Controles · en una carrera',
    descripcion:
      'Desliza a la izquierda del vivo (o «◀ Controles»): Pausa, Siguiente paso, Bloqueo (Water Lock) y Terminar, en el sitio de Apple Entreno. Terminar pide «¿Terminar y guardar?». El Bloqueo deja la esfera sorda al dedo: se sale girando la corona (tres pasos).',
  },
  {
    id: 'controles-fuerza',
    titulo: 'Controles · en una serie de fuerza (529)',
    descripcion:
      'Los mismos cuatro controles en el mismo sitio; solo cambia la etiqueta de contexto: «Siguiente serie». Sesión 529, A1 Back Squat 4 × 8 @65–70 % RM (121–131 kg).',
  },
  {
    id: 'pausa',
    titulo: 'Pausa',
    descripcion:
      'El vivo se atenúa (no se tapa: se sigue viendo dónde estabas), «EN PAUSA» y Reanudar. El doble toque en pausa es Reanudar. Los relojes no corren.',
  },
  {
    id: 'deshacer',
    titulo: 'Deshacer · estación cerrada con doble toque',
    descripcion:
      'Estación del ejemplo del modelo (P10): «Sled Push · 50 m · 152 kg», nada la mide («lo dices tú»). A los 2,5 s, doble toque: la estación se cierra, entra la carrera con su GO y abajo sale «Sled Push hecho · Deshacer» durante 5 s. Pulsa Deshacer y vuelves a la estación con el tiempo corriendo.',
  },
  {
    id: 'sin-gesto',
    titulo: 'Sin doble toque · botón acotado',
    descripcion:
      'La misma estación en un reloj sin doble toque ni botón Acción (anterior a Series 9 / Ultra 2): la acción del momento es un botón visible de 44 pt, «Estación hecha», y deja el mismo deshacer de 5 s. Tocar fuera del botón sigue sin cerrar nada.',
  },
  {
    id: 'dato-viejo',
    titulo: 'Dato viejo · espejo sin enlace',
    descripcion:
      'Sesión 535 en cinta, con el móvil leyendo la cinta. A los 3 s se corta el enlace (.failure): los metros y el ritmo, que llegaban del móvil, pasan a «—» con «sin enlace · la muñeca sigue grabando». El pulso y el reloj son de la muñeca y siguen. Nada se congela en silencio.',
  },
  {
    id: 'muneca',
    titulo: 'Muñeca abajo → vuelve a la página 1',
    descripcion:
      'Empieza en la página 3 (Vueltas). A los 2 s baja la muñeca (Always-On: tinta al 60 %, sin tintes, aro atenuado); a los 4,5 s la sube y la muñeca vuelve a Vivo · página 1, el paso.',
  },
  {
    id: 'lenguaje',
    titulo: 'El lenguaje · los doce eventos',
    descripcion:
      'Uno tras otro, lo que se ve y lo que vibra y se dice (debajo del reloj y en la cronología): 3-2-1 (.click), GO (.start×2 + voz), recupera (.stop + voz), preaviso (.notification + «Quedan cien.»), afloja (.directionDown×2), aprieta (.directionUp×2), vuelta del km (.click×2 + voz), fin de serie (solo voz), bloque (.success), sesión (.success×2 + voz), acción (.click) y enlace perdido (.failure).',
  },
  {
    id: 'color-tipo',
    titulo: 'Color y tipo',
    descripcion:
      'Gira la corona: el héroe ajustándose al ancho con «3:52 /km», «88:88», «10:59:59», «1000 m»… sin salirse nunca; la escala (segundo 30, tercero 22, contexto 16, nota 15, botón 44); el espectro de zonas con 5 y con 7 zonas del coach (Z1 azul pizarra, nunca gris); y los colores con su único significado.',
  },
  {
    id: 'ahora-suena',
    titulo: 'Ahora suena · a la derecha',
    descripcion: 'La música del sistema a la derecha del vivo, como en Apple Entreno. Sus iconos no son naranjas: no son acciones del entreno.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [series] = useState(planSeries);
  const [fuerza] = useState(planFuerza);
  const [estacion] = useState(planEstacion);
  const [cinta] = useState(planCintaEspejo);

  switch (escenario) {
    case 'lenguaje':
      return <Lenguaje onLog={onLog} />;
    case 'color-tipo':
      return <ColorTipo onLog={onLog} />;
    case 'controles-fuerza':
      return (
        <VivoDePlan
          plan={fuerza.plan}
          sim={cuerpoFuerza}
          inicio={{ i: 3, t: 14, sesionT: 460 }}
          estructura={fuerza.estructura}
          control="siguiente"
          etiquetaSiguiente="Siguiente serie"
          cara={(seq: Secuencia) => (seq.paso.clase === 'fuerza' ? <CaraFuerza seq={seq} /> : null)}
          inicial={{ area: 'controles' }}
          onLog={onLog}
        />
      );
    case 'deshacer':
      return (
        <VivoDePlan
          plan={estacion.plan}
          sim={cuerpoEstacion}
          inicio={{ i: 0, t: 38, sesionT: 1712, sesionM: 4800 }}
          estructura={estacion.estructura}
          control="siguiente"
          cara={(seq: Secuencia) => (seq.paso.clase === 'estacion' ? <CaraEstacion seq={seq} /> : null)}
          guion={[{ en: 2500, gesto: 'doble-toque' }]}
          onLog={onLog}
        />
      );
    case 'sin-gesto':
      return (
        <VivoDePlan
          plan={estacion.plan}
          sim={cuerpoEstacion}
          inicio={{ i: 0, t: 38, sesionT: 1712, sesionM: 4800 }}
          estructura={estacion.estructura}
          control="siguiente"
          cara={(seq: Secuencia) => (seq.paso.clase === 'estacion' ? <CaraEstacion seq={seq} /> : null)}
          modelo="sin-gesto"
          onLog={onLog}
        />
      );
    case 'dato-viejo':
      return (
        <VivoDePlan
          plan={cinta.plan}
          sim={cuerpoCintaEspejo}
          inicio={INICIO_CINTA}
          estructura={cinta.estructura}
          control="siguiente"
          onLog={onLog}
        />
      );
    default: {
      const inicial =
        escenario === 'controles-correr'
          ? { area: 'controles' as const }
          : escenario === 'ahora-suena'
            ? { area: 'musica' as const }
            : escenario === 'muneca'
              ? { pagina: 2 }
              : undefined;
      const guion =
        escenario === 'muneca'
          ? [
              { en: 2000, gesto: 'bajar' as const },
              { en: 4500, gesto: 'subir' as const },
            ]
          : undefined;
      return (
        <VivoDePlan
          plan={series.plan}
          sim={cuerpoSeries}
          inicio={{ ...INICIO_SERIE3, pausado: escenario === 'pausa' }}
          estructura={series.estructura}
          control="siguiente"
          inicial={inicial}
          guion={guion}
          onLog={onLog}
        />
      );
    }
  }
}
