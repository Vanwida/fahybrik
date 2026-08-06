'use client';

// El plan — «la semana dentro del bloque». La PORTADA DIARIA.
//
// La pantalla que contesta las dos preguntas con las que un atleta abre la app:
// qué toca HOY, y dónde cae ese hoy dentro de lo que el coach ha montado. Hoy
// la app tiene esas dos respuestas en sitios distintos (la portada diaria y el
// plan de la semana), así que el atleta ve el entreno sin el porqué o el porqué
// sin el entreno. Aquí es una sola pantalla: la semana y hoy.
//
// La tercera distancia —hacia dónde va el bloque— se fue el 29-jul. Vivía en una
// rampa de volumen previsto por semana cuyos números no existían en producción, y
// afirmaba cuánto iba a entrenar el atleta dentro de tres semanas. Esa pregunta
// la contesta `plan-ciclo` con estructura publicada, y desde aquí se entra por el
// pie. Lo planificado se pinta con seguridad; lo medido del futuro no existe.
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
  // `construida`, no `espejo`: el 6-ago se shipeó la fusión en Swift (docs/DECISIONS.md),
  // pero esta pantalla del doble no se ha re-verificado campo a campo contra ese Swift —
  // es la antesala honesta, no la certificación (regla del 3-ago).
  estado: 'construida',
  actualizado: '2026-08-06',
  descripcion:
    'Dónde estás hoy dentro del bloque y qué toca: el carril de siete días con sus sellos y la sesión de hoy en grande, con su duración solo cuando el plan la deja escrita. Por el pie se entra al ciclo. El día que no toca nada también tiene salida.',
  fuentes: [
    'ios/FAHYBRIK/Plan/PlanView.swift',
    'ios/FAHYBRIK/Plan/PlanHoyModel.swift',
    'ios/FAHYBRIK/Plan/PlanHoyAtoms.swift',
    'ios/FAHYBRIK/Plan/PlanHeroeHoy.swift',
    'ios/FAHYBRIK/Plan/PlanAcciones.swift',
  ],
  enApp:
    'Construida: PlanView ya es esta fusión (InicioView perdió su héroe/fila PM/hecho-hoy el mismo día). Difiere en un punto real: la segunda sesión del día (AM+PM) es una fila compacta bajo el héroe, no está en este mockup de cuatro escenarios.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'semana-carga',
    titulo: 'Semana 3 de 6 · viernes de simulación',
    descripcion:
      'Semana media del bloque: dos sesiones selladas, una saltada y hoy la simulación HYROX entera. Es `for_time`, así que donde iría la duración pone «Dura lo que tardes» — no un número a ojo.',
  },
  {
    id: 'descarga',
    titulo: 'Semana 6 de 6 · última',
    descripcion:
      'La última del bloque. Hoy toca fuerza corta, 4×5 a 100 kg: las repeticiones no traen tempo, así que la duración depende de tus descansos y se dice así.',
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
