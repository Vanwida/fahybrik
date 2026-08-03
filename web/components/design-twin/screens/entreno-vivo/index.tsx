'use client';

// El entreno en vivo — el body que hoy hospeda TRES arquetipos a la vez (En
// vivo, Lista y Configurar) y por eso nunca gana su altura en ninguno de los
// tres. `hoy.tsx` reproduce el body real; `propuesta.tsx` los separa. Ver
// docs/DECISIONS.md, «2026-07-28 · El TRAMO es la unidad del entreno en
// vivo» — el tramo es lo que gobierna aquí, no el bloque.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { HoyScreen } from './hoy';
import { PropuestaScreen } from './propuesta';

export const meta: TwinMeta = {
  id: 'entreno-vivo',
  titulo: 'El entreno en vivo — quién gobierna la pantalla',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-07-29',
  descripcion:
    'El body que hoy hospeda TRES arquetipos a la vez. Aquí se separan: qué manda mientras trabajas, qué pasa cuando el bloque es en realidad una lista, y qué es la puerta que se pone encima.',
  fuentes: [
    'ios/FAHYBRIK/Workout/ActiveWorkoutView.swift',
    'ios/FAHYBRIK/Workout/WorkoutFormatHUDs.swift',
    'ios/FAHYBRIK/Workout/WorkoutLiveHUDs.swift',
    'ios/FAHYBRIK/Workout/BlockPreviewGate.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  composicion: {
    arquetipo: 'en-vivo',
    estrategia: 'gobierna',
    sujeto: 'El número que gobierna el esfuerzo AHORA — y cambia con el tramo.',
    // Los pt los mide el propio doble sobre el lienzo 1:1 del iPhone 17 Pro.
    // Y el fallo tiene DOS caras opuestas en la misma pantalla: con 16 ítems
    // se recorta el dato; con 1, sobra medio móvil. Las dos son la misma
    // ausencia de decisión sobre el alto.
    diagnostico:
      'Hoy no gobierna nadie: el cromo tiene alto fijo y al desbordar se sacrifica el dato. En retrato no hay ScrollView (solo en horizontal), así que con los 16 ítems de la simulación HYROX el clipShape se come 365 pt de lista — la ruta se corta en la estación 7. Y en el otro extremo, un remo de un ítem deja 279 pt de Spacer().',
    resuelve:
      'Un dato manda y ESCALA hasta llenar; la lista deja de competir por el alto y pasa a ser una ventana de tres filas alrededor del cursor, con la ruta entera a un toque. Y los otros dos arquetipos salen de aquí: el calentamiento es una Lista y se pinta como Lista, y la puerta del bloque es otra pantalla, de Configurar.',
  },
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'minimo',
    titulo: 'Remo 500 m · sin monitor',
    descripcion: 'Entreno libre y nada conectado: solo gobierna el reloj, y la pantalla dice lo que NO sabe.',
  },
  {
    id: 'hyrox',
    titulo: 'Estación 4 de 16 · Sled Push',
    descripcion: 'La ruta real de la simulación: gobierna el trabajo que tienes delante, no el cronómetro.',
  },
  {
    id: 'calentamiento',
    titulo: 'Calentamiento · 4 movimientos',
    descripcion: 'Aquí no gobierna ningún número. Es una Lista y tiene que pintarse como Lista.',
  },
  {
    id: 'puerta',
    titulo: 'La puerta, encima',
    descripcion: 'El mismo body hospedando Configurar: se ve que es OTRA pantalla y no una rama del HUD.',
  },
];

export function Screen({ escenario, vista, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {vista === 'hoy' ? (
        <HoyScreen escenario={escenario} onLog={onLog} />
      ) : (
        <PropuestaScreen escenario={escenario} onLog={onLog} />
      )}
    </div>
  );
}
