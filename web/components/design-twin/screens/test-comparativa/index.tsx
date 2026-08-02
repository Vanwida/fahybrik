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
    'El resultado de un test deja de ser una cifra suelta: se elige contra qué compararse y el sujeto es la escalera de zonas recalculada — la banda de cada zona antes y ahora, que es lo que el atleta leerá mañana en su plan.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'detalle',
    estrategia: 'llena',
    sujeto: 'Las seis zonas, antes → ahora. En HYROX se entrena por zonas; el producto del test es esa tabla.',
    diagnostico:
      'Hoy el resultado son un número grande, un chip de delta contra la marca anterior y una curva de 84×30 pt (TestsHubView.swift). No hay forma de compararse con un test concreto, ni de ver qué zonas cambian, ni de distinguir «mismo tiempo» de «mismo tiempo con 9 ppm menos».',
    resuelve:
      'La marca antes → ahora con delta y %, la referencia elegible, y la escalera: cada zona con su banda de entonces, la de hoy y cuánto se movió — más el desglose por tramos con su pulso.',
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'dos-por-dos',
    titulo: '2 × 2′ · el test que hoy no se puede montar',
    descripcion:
      'Tiempo fijo, así que se miden METROS y el héroe es el split medio. La escalera enseña las seis bandas −5 s. Hoy el sistema lo guardaría como baseline y no movería ni una zona.',
  },
  {
    id: 'remo-2k',
    titulo: '2 km de remo · cuatro intentos',
    descripcion:
      'Seis meses de historia y cuatro referencias posibles. Toca «Hace 3 meses» / «1ª vez» y mira cómo se recalcula la escalera entera sin que se mueva la cifra de hoy.',
  },
  {
    id: 'carrera-5k',
    titulo: 'Carrera 5K · las zonas en /km',
    descripcion:
      'Correr es la mitad de HYROX y habla el mismo idioma: la misma escalera, con las bandas en minutos por kilómetro.',
  },
  {
    id: 'mismo-tiempo',
    titulo: 'Mismo tiempo, 9 ppm menos',
    descripcion:
      'La mejora que hoy es invisible: 0,4 s de diferencia en el crono y nueve pulsaciones menos de coste. Las zonas no se mueven — y se dice UNA vez, sin teatro de dos columnas iguales.',
  },
  {
    id: 'sin-pulso',
    titulo: 'El test viejo no llevaba reloj',
    descripcion: 'Del intento anterior solo se sabe el tiempo. El hueco se dice; no se rellena con un cero ni con una estimación.',
  },
  {
    id: 'primera',
    titulo: 'La primera vez',
    descripcion:
      'Sin historia no hay comparación: la escalera sale en una sola columna — estas son tus zonas, a partir de aquí se compara.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const test = TESTS[escenario] ?? TESTS['dos-por-dos'];
  return (
    <div className="twin-screen-safe" style={{ height: '100%' }}>
      <TestComparativa key={test.id} test={test} onLog={onLog} />
    </div>
  );
}
