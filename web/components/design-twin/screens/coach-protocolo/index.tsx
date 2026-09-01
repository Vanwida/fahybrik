'use client';

// EL PROTOCOLO DEL COACH — siete pasos con reloj, marcables uno a uno.
//
// El caso real es el calentamiento del día de carrera, que es donde peor
// funciona el texto libre: el atleta lo lee en el pasillo de boxes, de pie, con
// el móvil en una mano y sin margen para releer un párrafo buscando por dónde
// iba. Cronometrado hacia atrás desde la salida, y cada paso se marca.
//
// Esto no es futuro puro: la previa del entreno ya tiene un `warmupChecklist`
// que siempre llega vacío, y el protocolo de un test viaja hoy como texto plano
// dentro de la nota del entreno. Lo que falta es que sea un objeto con estado.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { PantallaProtocolo, type ModoProtocolo } from './pantalla';

export const meta: TwinMeta = {
  id: 'coach-protocolo',
  titulo: 'Del coach — el protocolo',
  zona: 'Plan y hoy',
  estado: 'construida',
  actualizado: '2026-08-09',
  descripcion:
    'El calentamiento del día de carrera como pasos marcables, con la marca temporal en mono contando hacia atrás desde la salida. La CTA de cerrarlo no se activa hasta que están los siete.',
  fuentes: [
    'ios/FAHYBRIK/Comunicados/ComunicadoProtocoloView.swift',
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
    id: 'sin-empezar',
    titulo: 'Sin empezar · los siete por delante',
    descripcion:
      "La cuenta atrás entera, de −40' a −5'. La CTA está apagada y dice cuántos pasos faltan, en vez de dejarse pulsar sin nada marcado.",
  },
  {
    id: 'a-medias',
    titulo: 'A medias · 3 de 7',
    descripcion:
      'El caso normal: entras a mitad de calentamiento. La barra mide los siete pasos por separado, no un porcentaje redondeado.',
  },
  {
    id: 'hecho',
    titulo: 'Hecho · cerrado',
    descripcion:
      'Marcados los siete y cerrado. La cabecera cambia el contador por la insignia HECHO, que es el dato que hoy el coach no tiene de ninguna forma.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <PantallaProtocolo key={escenario} modo={escenario as ModoProtocolo} onLog={onLog} />
    </div>
  );
}
