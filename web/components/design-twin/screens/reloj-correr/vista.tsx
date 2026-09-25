'use client';

// EL VIVO DE CORRER — un escenario montado con el kit, y nada más: el plan,
// el cuerpo y el punto de partida van a `VivoDePlan`, que pone el motor, la
// carcasa y las caras de correr con las páginas de la corona.

import { VivoDePlan } from '../../kit-reloj';
import type { CasoCorrer } from './casos';

export function VivoCorrer({ caso, onLog }: { caso: CasoCorrer; onLog: (linea: string) => void }) {
  const { plan, estructura, control } = caso.datos;
  return (
    <VivoDePlan
      plan={plan}
      sim={caso.sim}
      inicio={caso.inicio}
      estructura={estructura}
      control={control}
      inicial={{ muneca: caso.muneca }}
      onLog={onLog}
    />
  );
}
