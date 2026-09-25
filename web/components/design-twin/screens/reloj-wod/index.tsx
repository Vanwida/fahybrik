'use client';

// Muñeca · EMOM, AMRAP, For Time y ergo — propuesta del rediseño de la muñeca (25-sep). Modelo: docs/reloj-muneca/modelo.md.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'reloj-wod',
  titulo: 'Muñeca · EMOM, AMRAP, For Time y ergo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'Cada formato con su pregunta: la ventana del minuto, las rondas y las reps con la corona, el crono que puntúa y el /500 contra su objetivo.',
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
