'use client';

// EL TEST, CONTRA EL DE HACE TRES MESES — propuesta.
//
// Un test es el resolvedor del plan: el atleta lo hace a tope y de su resultado
// salen los ritmos con los que se le escribe el mes siguiente. Hoy la app le
// devuelve una cifra y un chip de delta contra la marca inmediatamente anterior
// (`TestsHubView.swift` · `TestResultDoneView.swift`), y ahí se acaba: no puede
// elegir contra qué compararse, no ve qué zonas se le han movido, y si repitió el
// mismo tiempo con nueve pulsaciones menos la pantalla se lo cuenta como «−0,4 s».
//
// Esta pantalla contesta la pregunta entera y en su orden: qué pasó · contra qué
// · qué cambia en tu plan · cómo lo hiciste.
//
// LOS DOS ESCENARIOS QUE SON UN ENCARGO, NO UNA DEMO:
//   · «2 × 2′» es el test que el coach pidió y que el sistema HOY NO SABE MONTAR:
//     al medirse por tiempo fijo el resultado son metros, y una medida de
//     distancia tiene prohibido calibrar (`shared/schema/test-battery.ts`,
//     CALIBRATING_MEASURES). Además necesita dos piezas que no existen: tramos
//     declarados y una agregación (media | mejor) que los convierta en un número.
//   · «Mismo tiempo, menos pulso» es la mejora que hoy es invisible.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { TestComparativa } from './propuesta';
import { TESTS } from './data';

export const meta: TwinMeta = {
  id: 'test-comparativa',
  titulo: 'El test, contra el de hace tres meses',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  descripcion:
    'El resultado de un test deja de ser una cifra suelta: se elige contra qué compararse, se ve el umbral desplazado (y con él las seis zonas del plan) y se lee tramo a tramo a qué pulso se hizo.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'detalle',
    estrategia: 'llena',
    sujeto: 'El veredicto — cuánto has mejorado, en una frase, antes que la cifra.',
    diagnostico:
      'Hoy el resultado son un número grande, un chip de delta contra la marca anterior y una curva de 84×30 pt (TestsHubView.swift). No hay forma de compararse con un test concreto, ni de ver qué zonas cambian, ni de distinguir «mismo tiempo» de «mismo tiempo con 9 ppm menos».',
    resuelve:
      'El delta pasa a ser una frase con sujeto, la referencia se elige, y debajo va lo que el atleta usará mañana: el umbral desplazado en la escala de ritmo y el desglose por tramos con su pulso.',
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'remo-2k',
    titulo: '2 km de remo · cuatro intentos',
    descripcion:
      'El caso canónico: seis meses de historia y cuatro referencias posibles. Toca «Hace 3 meses» / «1ª vez» y mira cómo cambia el veredicto sin que se mueva la cifra de hoy.',
  },
  {
    id: 'dos-por-dos',
    titulo: '2 × 2′ · el test que hoy no se puede montar',
    descripcion:
      'Tiempo fijo, así que se miden METROS (más es mejor) y hacen falta tramos + una agregación. El sistema de hoy lo guardaría como baseline y no movería ni una zona.',
  },
  {
    id: 'mismo-tiempo',
    titulo: 'Mismo tiempo, 9 ppm menos',
    descripcion:
      'La mejora que hoy es invisible: 0,4 s de diferencia en el crono y nueve pulsaciones menos de coste. La app actual lo pinta como «nada».',
  },
  {
    id: 'sin-pulso',
    titulo: 'El test viejo no llevaba reloj',
    descripcion: 'Del intento anterior solo se sabe el tiempo. El hueco se dice; no se rellena con un cero ni con una estimación.',
  },
  {
    id: 'primera',
    titulo: 'La primera vez',
    descripcion: 'Sin historia no hay comparación: se dice que esta marca es la referencia, y no aparece ni selector ni curva.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const test = TESTS[escenario] ?? TESTS['remo-2k'];
  return (
    <div className="twin-screen-safe" style={{ height: '100%' }}>
      <TestComparativa key={test.id} test={test} onLog={onLog} />
    </div>
  );
}
