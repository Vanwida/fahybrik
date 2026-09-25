'use client';

// Muñeca · fuerza, rehecha — propuesta del rediseño de la muñeca (25-sep). Modelo: docs/reloj-muneca/modelo.md.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'reloj-fuerza',
  titulo: 'Muñeca · fuerza, rehecha',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'El ejercicio primero y la dosis con sus dos ejes; se anota en el propio descanso con la corona, y la última serie lleva al siguiente ejercicio.',
  fuentes: [],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  { id: 'base', titulo: 'En construcción', descripcion: 'Andamio: la pantalla la construye su agente.' },
];

export function Screen(_props: TwinScreenProps) {
  return null;
}
