'use client';

// DEL COACH — la bandeja de comunicados.
//
// Nace de un caso real: el coach rehace el plan entero al pasar el atleta de
// Doubles a Singles Pro, y todo lo que hay que decirle (el porqué del nuevo
// objetivo, un calentamiento de siete pasos, dos suplementos con fecha, una
// pregunta que bloquea el taper) viaja hoy por el chat como texto libre. En el
// chat todo eso tiene el mismo peso que un «ok» y el mismo estado que un emoji:
// ninguno. Un push perdido es un mensaje perdido.
//
// Un comunicado no es un mensaje: se PUBLICA y se RASTREA. El chat conversa.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Bandeja, type ModoBandeja } from './pantalla';

export const meta: TwinMeta = {
  id: 'coach-bandeja',
  titulo: 'Del coach — la bandeja',
  zona: 'Plan y hoy',
  estado: 'construida',
  actualizado: '2026-08-09',
  descripcion:
    'Lo que el coach publica y rastrea, fuera del chat: protocolos, preguntas que bloquean, tareas con fecha, el porqué del plan y el foco que no caduca. Ordenada por lo que te reclama, no por fecha.',
  fuentes: [
    'ios/FAHYBRIK/Comunicados/ComunicadosBandejaView.swift',
    'ios/FAHYBRIK/Comunicados/CoachInboxHeaderButton.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadoModels.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosService.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosAcciones.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosPiezas.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion` a propósito: la ficha del §6 enciende el conmutador
  // «cómo está hoy / propuesta», y aquí NO hay un hoy que enseñar — antes de
  // construirla esta superficie no existía (lo que el coach publicaba viajaba
  // por el chat). Declararla pintaría dos veces la misma pantalla bajo dos
  // rótulos distintos, que es precisamente la clase de teatro que el sello de
  // estado del doble existe para impedir. El arquetipo es Lista y la estrategia
  // `llena`, y eso se cumple; lo que no hay es un antes.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'semana-fuerte',
    titulo: 'La semana que se rehace el plan',
    descripcion:
      'El caso real: la pregunta del wave sin responder arriba, dos tareas (una vence hoy), el calentamiento nuevo, el foco y el briefing. Marca una tarea y mira cómo cambia el contador.',
  },
  {
    id: 'al-dia',
    titulo: 'Todo al día',
    descripcion:
      'Lo mismo, resuelto: la pregunta respondida enseña qué elegiste, las tareas tachadas, la nota vista. La calma también es información y hoy no la da nadie.',
  },
  {
    // El caso de diseño (§6.3): el que ve el atleta recién dado de alta.
    id: 'vacio',
    titulo: 'Recién dado de alta · nada publicado',
    descripcion:
      'La Lista degrada a Vacío centrado, y la salida dice dónde sigue el día a día: la frontera con el chat se declara, no se supone.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Bandeja key={escenario} modo={escenario as ModoBandeja} onLog={onLog} />
    </div>
  );
}
