'use client';

// Muñeca · antes y después — propuesta del rediseño de la muñeca (25-sep). Modelo: docs/reloj-muneca/modelo.md.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'reloj-antes-despues',
  titulo: 'Muñeca · antes y después',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-09-25',
  descripcion:
    'Lo de hoy desde la esfera, el brief con la estructura real y el GPS listo; al terminar, la sesión completada, el RPE en la corona y un resumen de corredor.',
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
