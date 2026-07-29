'use client';

// Hub de tests — PROPUESTA de composición (§6 del docs/CONTRATO-UI.md).
//
// Es donde aterriza el atleta nuevo y donde HOY no puede hacer nada: tres
// tarjetas cortas, el resto negro, cero acciones, y el contador de calibración
// oculto justo cuando vale cero.
//
// Arquetipo: **Vacío** cuando no hay nada programado (estrategia `centra`, con
// salida obligatoria) · **Lista** en cuanto hay programación (`llena` + acción
// anclada). El arquetipo se degrada, no se rompe.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { TestsHoy } from './antes';
import { TestsPropuesta } from './propuesta';
import { ESTADOS, NUEVO } from './data';

export const meta: TwinMeta = {
  id: 'tests-calibracion',
  titulo: 'Hub de tests — la calibración es el sujeto',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  descripcion:
    'La pantalla donde aterriza el atleta nuevo deja de ser un callejón sin salida: el contador se pinta también en cero y el vacío se centra con una salida real.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'hoy-nuevo',
    titulo: 'HOY · recién dado de alta',
    descripcion:
      'Tres tarjetas cortas apiladas arriba y el resto negro — la franja naranja mide el hueco. Sin contador (se oculta al valer 0) y sin una sola acción.',
  },
  {
    id: 'nuevo',
    titulo: 'Propuesta · recién dado de alta',
    descripcion:
      '«0/4» centrado como sujeto, qué desbloquean los cuatro tests, y la salida: probarse por su cuenta + quién programa el resto y cuándo.',
  },
  {
    id: 'alex',
    titulo: 'Propuesta · con la batería a medias',
    descripcion:
      'Estado real del atleta 64: sentadilla 186,7 y peso muerto 245, falta press banca. 0 de 4 con 1 a medias, y la acción anclada es completarla.',
  },
  {
    id: 'veterano',
    titulo: 'Propuesta · calibrado entero',
    descripcion: '4 de 4 en verde, umbral en 163 ppm y tres modalidades con zonas. Sin acción anclada: no falta nada.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const hoy = escenario.startsWith('hoy-');
  const e = ESTADOS[hoy ? escenario.slice(4) : escenario] ?? NUEVO;

  return <div className="twin-screen-safe">{hoy ? <TestsHoy /> : <TestsPropuesta e={e} onLog={onLog} />}</div>;
}
