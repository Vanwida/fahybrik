'use client';

// IPHONE · CORRER — propuesta del rediseño del vivo del iPhone para la familia
// de correr (28-09). Modelo: docs/vivo-iphone/modelo.md (I3, I4, I6, I10, §4).
// Kit: `kit-iphone-vivo/` sobre el motor y las reglas de `kit-reloj/`.
//
// Una pregunta (I4): ¿voy al ritmo o a la zona que toca? El héroe la responde
// —el ritmo ACTUAL contra su banda, o el pulso contra su zona— y todo lo demás
// se subordina: lo que falta, la rejilla de la calle (pulso, distancia del
// paso, cadencia del teléfono) o de la cinta (pulso, inclinación, distancia),
// «Luego», la tira, UNA acción. Rodaje, series con su recuperación y su
// preaviso, la cinta en sus dos caras, el progresivo, el RPE, el mapa, y un
// libre idéntico. Nada aquí es de la pantalla: son casos sobre el kit.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { VivoIphoneDePlan } from '../../kit-iphone-vivo';
import { casoDe } from './casos';

export const meta: TwinMeta = {
  id: 'iphone-vivo-correr',
  titulo: 'iPhone · correr',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  actualizado: '2026-09-28',
  descripcion:
    'Correr con el objetivo mandando: el ritmo actual contra su banda en series, tempos y progresivos; el pulso contra su zona en rodajes y tiradas; el RPE como instrucción. Calle con GPS y cadencia del teléfono; cinta conectada o «lo dices tú»; la recuperación con su preaviso y su 3-2-1; la página de Mapa; y un libre que se ve igual.',
  fuentes: [
    'ios/FAHYBRIK/Workout/VivoIphone/VivoIphoneView.swift',
    'ios/FAHYBRIK/Workout/VivoIphone/VivoPaginas.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+Correr.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+Cuenta.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+Vueltas.swift',
    'ios/FAHYBRIKCore/Vivo/Vivo+PlanDeSesion.swift',
  ],
  enApp:
    'Hoy correr en el iPhone son `RunLiveShellView` + `OutdoorRunHUDModel` (calle) y `TreadmillHUDModel` + `RunTargetResolver` (cinta): el título va en inglés («Steady», «Intervals»), el ritmo grande es el medio de la vuelta, la zona prescrita se pinta con el color de la medida, el mapa de Apple ocupa un tercio de la pantalla con «Buscando GPS» encima, la cinta sin conectar es una guía a pantalla completa sin reloj ni pulso, y el botón dice «HECHO» o «TRAMO HECHO · se cierra solo al llegar». Esto lo sustituye entero con el pintor de `kit-iphone-vivo` sobre el mismo estado que la muñeca (`reloj-correr`).',
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'rodaje-z2',
    titulo: 'Rodaje 50′ a Z2 en calle (491)',
    descripcion:
      'Sesión 491: el coach pide zona, así que manda el PULSO con su zona encima y la banda es el espectro de sus cinco zonas con la Z2 encendida («Z2 · a 6 de Z3»). El fondo lleva el tinte de la zona. Sin avisos de ritmo: el ritmo actual va en la rejilla con la distancia y la cadencia del teléfono, y solo se avisa por encima (el tope de FC). La primaria es «Vuelta» (en superficie: no es la acción del momento); a los 3 s se pulsa y sale la tarjeta de la vuelta.',
  },
  {
    id: 'serie-dentro',
    titulo: 'Serie 3/6 · 1000 m a 3:45–3:55, dentro',
    descripcion:
      'El caso ilustrativo del modelo a 380 m: cabecera «Serie 3/6 · 1000 m · Series» con el crono de sesión y los chips GPS y Banda; manda el ritmo ACTUAL contra su banda (marca dentro, «dentro»); «quedan 620 m»; la rejilla: pulso con su zona, distancia del paso, cadencia; «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55»; la tira con las seis series en naranja. Se cierra sola a los 1000 m.',
  },
  {
    id: 'serie-rapida',
    titulo: 'La misma serie, yendo rápido',
    descripcion:
      'Serie 3/6: a los 6 s se va a 3:38. La marca pasa de raya a ▲ y la palabra a «▲ rápido», sin cambiar de color (I8). El háptico «afloja» sale UNA vez tras 4 s fuera (histéresis de 3 s/km) y la cadencia del coach (20 s) impide repetirlo. Vuelve sola a la banda. Mira la cronología.',
  },
  {
    id: 'recuperacion',
    titulo: 'Recupera 90″ trote → serie 4, con el preaviso',
    descripcion:
      'Quedan 14 s de trote. Monocromo: la cuenta atrás es el héroe, «viene 1000 m a 3:45–3:55» en el trabajo, el pulso bajando y el ritmo del trote en la rejilla, «Empezar ya» en naranja. A 10 s el preaviso (háptico + voz), a 3 s el 3-2-1 a pantalla completa y el GO: «Serie 4 de 6. Mil metros a 3:50.». La serie 4 entra con el ritmo mandando otra vez.',
  },
  {
    id: 'cinta-conectada',
    titulo: 'Tempo en cinta al 1 %, cinta conectada (ilustrativo)',
    descripcion:
      'Tempo de 20′ a 4:15–4:25 al 1 % en cinta, con la cinta emparejada: el chip «Cinta» en la cabecera, sin GPS ni Mapa (se corre en cinta). Manda el ritmo que da la cinta contra su banda; «quedan 16:40»; la rejilla: pulso, inclinación del 1 % (el segundo objetivo), distancia de la cinta. Gira el marco (Vista → Horizontal): la cinta admite apaisado, para la consola.',
  },
  {
    id: 'cinta-lo-dices-tu',
    titulo: 'El mismo tempo sin conectar la cinta · «lo dices tú»',
    descripcion:
      'La cinta no está emparejada: el chip dice «Conectar la cinta» (apagado) y la nota «sin la cinta · lo dices tú». El ritmo NO se inventa: el héroe cae a lo que se sabe (lo que falta, 16:40), la banda se queda sin marca («4:15–4:25 · sin lectura») y la rejilla no pinta ni ritmo ni distancia: solo el pulso y la inclinación que tienes que poner. Hoy era una guía de conexión a pantalla completa sin reloj ni pulso.',
  },
  {
    id: 'progresivo',
    titulo: 'Progresivo · tramo 3/8 → 4/8, seguido (538)',
    descripcion:
      'Sesión 538: «Progresivo · tramo 3/8», el ritmo actual contra 4:27–4:46. A los 10 s acaba el minuto y pasa al tramo 4 (4:21–4:38) SIN cuenta atrás a pantalla completa: solo el GO por háptico y voz, porque de trabajo a trabajo no se corta. La tira marca el tramo vivo entre los ocho.',
  },
  {
    id: 'rpe',
    titulo: 'Strides 6 × 20″ a RPE 7 (551)',
    descripcion:
      'Sesión 551, stride 3/6: el RPE no es un número vivo, así que manda lo que falta y la instrucción «RPE 7 · fuerte» ocupa el sitio de la banda (P3), a la misma altura, para que el sujeto no baile. El ritmo actual, el pulso y la cadencia en la rejilla. A los 12 s acaba y entra la recuperación de 1′ «caminando» (M2), monocroma.',
  },
  {
    id: 'mapa',
    titulo: 'Mapa · tirada 80′ a Z2, cruzando el km 5 (494)',
    descripcion:
      'A 1,2 s se desliza a la página Mapa (solo existe con GPS): la ruta hasta aquí sobre el mapa del sistema, los km y el ritmo medio al pie, «la ruta se guarda en Salud». Cabecera y franja siguen ahí: la acción se alcanza desde cualquier página. A los 10 s se cruza el km 5: la vuelta automática sale como tarjeta encima del mapa y la voz dice «Kilómetro 5: 4:52.».',
  },
  {
    id: 'libre',
    titulo: 'LIBRE · el mismo 6 × 1000 m, montado por el atleta',
    descripcion:
      'El mismo 6 × 1000 m a 3:45–3:55 · r 90″ trote escrito en el constructor libre, sin coach: se ve EXACTAMENTE igual que «Serie 3/6 · dentro». Nada en el vivo sabe de dónde vino el entreno (I1): misma cabecera, mismo héroe, misma banda, misma rejilla, misma tira, misma acción.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  // El caso se construye UNA vez por montaje (cada escenario remonta): el plan
  // y el cuerpo tienen que ser los mismos objetos segundo a segundo.
  const [caso] = useState(() => casoDe(escenario));
  return <VivoIphoneDePlan plan={caso.plan} sim={caso.sim} inicio={caso.inicio} dispositivos={caso.dispositivos} guion={caso.guion} onLog={onLog} />;
}
