'use client';

// MUÑECA · CORRER, REHECHO — propuesta del rediseño de la muñeca (25-09).
// Modelo: docs/reloj-muneca/modelo.md. Kit: `kit-reloj/`.
//
// El paso de correr con el OBJETIVO mandando (P3, Alex 25-09): el número
// grande es lo que el coach pide controlar —el ritmo contra su banda, o el
// pulso contra su zona—; lo que falta, debajo; el pulso siempre en la
// principal; el aro es la sesión. La corona recorre Paso → Datos → Vueltas →
// Estructura; a la izquierda los controles, a la derecha Ahora suena. Los
// mandos simulados (doble toque, Acción, corona, muñeca) van debajo del reloj.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { casoDe } from './casos';
import { VivoCorrer } from './vista';

export const meta: TwinMeta = {
  id: 'reloj-correr',
  titulo: 'Muñeca · correr, rehecho',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'El paso de correr con el objetivo mandando: ritmo contra su banda en series y tempos, pulso contra su zona en rodajes y tiradas, lo que falta debajo, el pulso siempre en la principal y la sesión entera en el aro. Voz al cambiar de paso y cada km.',
  fuentes: [],
  enApp:
    'Hoy el reloj corre con `RodajeLamina` (FH-30): una lámina donde manda lo que falta, con el ritmo MEDIO debajo, sin objetivo, sin pulso en la principal y cerrando la serie con un toque en cualquier sitio; el aro de estructura del bisel sí existe y aquí se reutiliza. Lo nuevo: el objetivo manda con su banda y su marca ▲▼, el pulso en la principal, la voz, la corona en vertical, el 3-2-1 y el descanso común.',
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'serie-dentro',
    titulo: 'Serie · 6 × 1000 m @3:45–3:55',
    descripcion:
      'El caso ilustrativo del modelo, serie 3 de 6 a 380 m. Manda el ritmo ACTUAL contra su banda (marca dentro, «dentro»); debajo lo que falta y el pulso con su zona. Gira la corona: Datos, Vueltas (series 1 y 2 contra su objetivo), Estructura. Al llegar a 1000 m la serie se cierra sola: «Serie 3: 3:50, dentro» y empieza la recuperación.',
  },
  {
    id: 'serie-z5',
    titulo: 'Serie a zona · 800 m @Z5 (479)',
    descripcion:
      'Sesión 479, serie 2 de 6: el coach pide zona, así que manda el PULSO y la banda se dibuja sobre el espectro de sus cinco zonas con la Z5 encendida («Z5 · dentro»). El fondo lleva el tinte de la zona (solo porque el paso va a zona); el ritmo baja a tercero.',
  },
  {
    id: 'serie-rapida',
    titulo: 'La misma serie, yendo rápido',
    descripcion:
      'Serie 3 de 6: a los 46 s se va a 3:38. La marca pasa de raya a ▲ y sale «▲ rápido» — sin cambiar de color. El háptico «afloja» (.directionDown×2) sale UNA vez tras 4 s fuera (histéresis de 3 s/km); la cadencia del coach (20 s) impide repetirlo. Vuelve a la banda sola. Mira la cronología.',
  },
  {
    id: 'recupera-go',
    titulo: 'Recuperación 90″ trote → serie 4',
    descripcion:
      'Quedan 14 s de trote. Monocromo: cuenta atrás, «Luego · 1000 m a 3:45–3:55», el pulso bajando y «doble toque · empezar ya». A 10 s el preaviso (.notification + voz), a 3 s el 3-2-1 a pantalla completa (.click por segundo) y el GO (.start×2 + «Serie 4 de 6. Mil metros a 3:50.»).',
  },
  {
    id: 'rodaje-z2',
    titulo: 'Rodaje 50′ @Z2 (491)',
    descripcion:
      'Sesión 491: manda el pulso, la banda dice «Z2 · a 6 de Z3» (el techo), quedan 37:26 y el ritmo va a tercero. Solo avisa por encima (P9: el tope de FC). El control contextual es «Vuelta», y hay vuelta automática por km.',
  },
  {
    id: 'tirada-z2',
    titulo: 'Tirada 80′ @Z2 · vuelta por km (494)',
    descripcion:
      'Sesión 494 con el cue del coach «mirar el pulso» al pie (M8). A los 10 s cruza el km 5: vuelta automática (.click×2), la tarjeta del km y la voz «Kilómetro 5: 4:52.».',
  },
  {
    id: 'tempo-z4',
    titulo: 'Tempo 3950 m @Z4 (573)',
    descripcion:
      'Sesión 573: a zona, manda el pulso («Z4 · a 6 de Z5»); lo que falta en km (2,18 km) y el ritmo actual en tercero.',
  },
  {
    id: 'strides',
    titulo: 'Strides 6 × 20″ @RPE 7 (551)',
    descripcion:
      'Sesión 551, stride 3 de 6: el RPE no es un número vivo, así que manda lo que falta con la instrucción «RPE 7 · fuerte» y el pulso debajo. Al acabar, la recuperación «caminando» (M2) con su 3-2-1 al final.',
  },
  {
    id: 'progresivo',
    titulo: 'Progresivo · tramo 3/8 (538)',
    descripcion:
      'Sesión 538: «Progresivo · tramo 3/8», ritmo contra 4:27–4:46. Al acabar el minuto pasa al tramo 4 SIN cuenta atrás a pantalla completa (seguido, sin cortar): solo el GO por háptico y voz.',
  },
  {
    id: 'tanda-serie',
    titulo: 'Series anidadas · tanda 2/3 · serie 4/6 (509)',
    descripcion:
      'Sesión 509 en cinta, 3 × (6 × 1′ / 1′) r 5′, sin objetivo: manda lo que falta, «Tanda 2/3 · Serie 4/6» sin aplanar (M4). A los 8 s entra la recuperación de 1′ «caminando».',
  },
  {
    id: 'tanda-descanso',
    titulo: 'Descanso entre tandas (509)',
    descripcion:
      'Última serie de la tanda 2: a los 6 s entra el DESCANSO ENTRE TANDAS de 5′ — la cara común de descanso (P8: «Viene: Tanda 3/3 · 6 × 1′», +30 s, Empezar ya), distinta de la recuperación de 1′ entre series.',
  },
  {
    id: 'cinta',
    titulo: 'Cinta al 1 % · 2′ @Z4 (535)',
    descripcion:
      'Sesión 535: «Cinta · 1 % · metros de la cinta» al pie; sin GPS, los metros y el ritmo los da la cinta. Manda el pulso contra Z4; la inclinación es el segundo objetivo (M1, M3).',
  },
  {
    id: 'gps',
    titulo: 'GPS honesto · buscando → listo (538)',
    descripcion:
      'Sesión 538, tramo 1 (10′ a 5:20), arrancada sin esperar a «GPS listo». Sin GPS el ritmo NO se pinta a cero: el héroe cae a lo que se sabe (el tiempo), la banda se queda sin marca y la nota dice «GPS · buscando». A los 7 s fija y manda el ritmo.',
  },
  {
    id: 'always-on',
    titulo: 'Always-On · muñeca abajo',
    descripcion:
      'La serie 3 de 6 con la muñeca bajada: fondo negro, sin tintes, tinta al 60 %, aro atenuado, 1 Hz. Pulsa «Subir muñeca» (debajo del reloj): vuelve a Vivo, página 1.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan
  // y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoDe(escenario));
  return <VivoCorrer caso={caso} onLog={onLog} />;
}
