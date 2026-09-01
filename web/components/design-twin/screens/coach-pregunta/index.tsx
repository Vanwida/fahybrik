'use client';

// LA PREGUNTA DEL COACH — el tipo de comunicado que el chat no sabe resolver.
//
// «¿Tu wave es el jueves o el sábado?» escrito en el chat es un mensaje más: si
// el atleta no contesta, nadie se entera, y el taper se queda montado sobre una
// suposición. Publicado como PREGUNTA, bloquea, tiene dos opciones con su
// consecuencia declarada, y el coach ve si está contestada sin releer el hilo.
//
// El caso real: el plan está montado para una wave el sábado 14 de noviembre y
// el atleta no sabe si la suya es el jueves 12. Dos días de diferencia mueven
// los openers y la carga de carbohidratos.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PantallaPregunta, type ModoPregunta } from './pantalla';

export const meta: TwinMeta = {
  id: 'coach-pregunta',
  titulo: 'Del coach — la pregunta que bloquea',
  zona: 'Plan y hoy',
  estado: 'construida',
  actualizado: '2026-08-09',
  descripcion:
    'Una decisión con dos opciones y la consecuencia de cada una escrita al lado. Se contesta con un toque y el coach lo ve: ni encuesta a ciegas ni mensaje que se pierde en el hilo.',
  fuentes: [
    'ios/FAHYBRIK/Comunicados/ComunicadoPreguntaView.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadoModels.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosService.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosAcciones.swift',
    'ios/FAHYBRIK/Comunicados/ComunicadosPiezas.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'sin-responder',
    titulo: 'Sin responder · el taper en el aire',
    descripcion:
      'El aviso dice qué se queda montado a ciegas mientras no contestes. Toca una opción y mira la confirmación: se responde con un toque, sin botón de enviar.',
  },
  {
    id: 'respondida',
    titulo: 'Respondida · sábado 14',
    descripcion:
      'La elegida se queda con el filo de acento y la otra se apaga sin desaparecer: qué descartaste también es dato. Se puede cambiar.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <PantallaPregunta key={escenario} modo={escenario as ModoPregunta} onLog={onLog} />
    </div>
  );
}
