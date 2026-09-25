'use client';

// Guardado en tu móvil — un entreno que no se pudo subir.
//
// PROPUESTA. Decidido por Alex el 25-09 (docs/DECISIONS.md, «El reloj guarda el
// entreno hasta que el servidor lo confirma»): si el servidor RECHAZA un entreno
// terminado (4xx), el atleta ve «Guardado en tu móvil», el resumen se cierra con
// «No se ha podido subir. Lo estamos revisando; no tienes que hacer nada.» y una
// sola acción, CERRAR; el entreno sale en su historial marcado «Sin subir».
//
// EL MODELO, que es lo que hay que tener claro antes de pintar: un rechazo hoy
// es casi siempre un fallo NUESTRO (el servidor acepta cualquier entreno
// terminado). No hay nada que el atleta pueda arreglar, así que la pantalla no
// le pide nada — ni reintentar, ni reclasificar, ni rellenar. Su trabajo está a
// salvo en dos sitios (la cola del móvil y, si lo grabó, el reloj) y eso es lo
// único que tiene que saber. Lo demás es nuestro: lo vemos en el registro
// técnico y lo arreglamos.
//
// Tres escenarios: el resumen (la propuesta), el historial (dónde vuelve a
// encontrarlo) y hoy (el REINTENTAR sin salida que esto sustituye).

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Historial } from './historial';
import { Hoy } from './hoy';
import { Resumen } from './resumen';

export const meta: TwinMeta = {
  id: 'guardado-en-movil',
  titulo: 'Un entreno que no se pudo subir',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'Si el servidor rechaza un entreno terminado, el resumen no se queda atascado en REINTENTAR: dice «Guardado en tu móvil», que no hay nada que hacer, y se cierra. El entreno sigue en el historial, marcado «Sin subir».',
  fuentes: ['ios/FAHYBRIK/Workout/PostWorkoutSummaryView.swift', 'ios/FAHYBRIK/Networking/RequestQueue.swift'],
  enApp:
    'Mecanismo hecho (25-09): la cola guarda el entreno rechazado (`RequestQueue.rejectedRequests()`) y el reloj lo conserva; falta pintar esta pantalla en Swift tras la firma.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'resumen',
    titulo: 'El resumen, rechazado',
    descripcion:
      'Tocas GUARDAR y el servidor dice que no. El registro se queda como estaba y abajo, en vez de REINTENTAR: dónde está tu entreno, que no tienes que hacer nada, y CERRAR.',
  },
  {
    id: 'historial',
    titulo: 'En el historial · «Sin subir»',
    descripcion:
      'El mismo circuito, cosido en local entre los que sí subieron. Un chip más de la fila, en gris. Tócala: abre lo que guarda el móvil con el mismo aviso.',
  },
  {
    id: 'hoy',
    titulo: 'Hoy · REINTENTAR sin salida',
    descripcion:
      'Lo que pasa ahora: el botón pasa a REINTENTAR, cada toque repite el envío y vuelve el mismo 4xx. La pantalla no tiene otra salida. Tócalo.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      {escenario === 'historial' ? (
        <Historial onLog={onLog} />
      ) : escenario === 'hoy' ? (
        <Hoy onLog={onLog} />
      ) : (
        <Resumen onLog={onLog} />
      )}
    </div>
  );
}
