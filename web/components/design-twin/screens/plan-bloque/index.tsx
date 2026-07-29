'use client';

// El plan — «la semana dentro del bloque».
//
// La pantalla que contesta las dos preguntas con las que un atleta abre la app:
// qué toca HOY, y dónde cae ese hoy dentro de lo que el coach ha montado. Hoy
// la app tiene esas dos respuestas en sitios distintos (la portada diaria y el
// plan de la semana), así que el atleta ve el entreno sin el porqué o el porqué
// sin el entreno. Aquí es una sola pantalla y una sola idea, contada a tres
// distancias: el bloque, la semana y hoy.
//
// Todo lo que pinta sale de las cuatro sesiones de producción de
// `datos-reales.ts`; la estructura del plan y la voz del coach viven en
// `data.ts`, con su procedencia al lado.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Pantalla } from './pantalla';

export const meta: TwinMeta = {
  id: 'plan-bloque',
  titulo: 'El plan — la semana dentro del bloque',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  descripcion:
    'Dónde estás hoy dentro del bloque y qué toca: la rampa de semanas, el carril de siete días con sus sellos y la sesión de hoy en grande. El día que no toca nada también tiene salida.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'semana-carga',
    titulo: 'Semana 3 de 6 · viernes de simulación',
    descripcion:
      'Semana media del bloque: dos sesiones selladas, una saltada y hoy la simulación HYROX entera. La rampa sube y todavía queda más arriba.',
  },
  {
    id: 'descarga',
    titulo: 'Semana 6 de 6 · descarga',
    descripcion:
      'La última del bloque: la rampa cae a la mitad, se ve rayada y se dice con palabras. Hoy toca fuerza corta, 4×5 a 100 kg.',
  },
  {
    id: 'descanso',
    titulo: 'Jueves sin nada en el plan',
    descripcion:
      'El día vacío: no se fabrica ninguna sesión. Se enseña lo que hiciste ayer con su sello y lo que toca mañana, y la acción lleva ahí.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Pantalla escenario={escenario} onLog={onLog} />
    </div>
  );
}
