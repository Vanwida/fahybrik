'use client';

// EN OBRA — el agente que construye esta propuesta sustituye este fichero.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'plan-rehecho',
  titulo: 'Plan · rehecho',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion: 'En obra.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [{ id: 'en-obra', titulo: 'En obra', descripcion: 'Se está construyendo.' }];

export function Screen(_: TwinScreenProps) {
  return <div className="twin-screen-safe" style={{ display: 'grid', placeItems: 'center' }}>En obra</div>;
}
