'use client';

// Muñeca · correr, rehecho — propuesta del rediseño de la muñeca (25-sep). Modelo: docs/reloj-muneca/modelo.md.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'reloj-correr',
  titulo: 'Muñeca · correr, rehecho',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'El paso de correr con el objetivo mandando: ritmo contra su banda en series y tempos, pulso contra su techo en rodajes y tiradas, lo que falta debajo y la sesión entera en el aro.',
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
