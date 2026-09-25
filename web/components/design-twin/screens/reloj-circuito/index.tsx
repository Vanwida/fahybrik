'use client';

// Muñeca · circuito y HYROX — propuesta del rediseño de la muñeca (25-sep). Modelo: docs/reloj-muneca/modelo.md.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'reloj-circuito',
  titulo: 'Muñeca · circuito y HYROX',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'La carrera comprometida con sentido: cada km usa la pantalla de correr con el crono total a la vista, cada estación dice su dosis y su carga, y lo que nada mide lo dices tú.',
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
