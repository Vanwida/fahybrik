'use client';

// El ergo por series — remo, esquí y bici con el monitor conectado.
//
// La tesis: en el ergo NO gobierna el reloj, gobierna el HITO. Los metros y las
// calorías los sabe la máquina, y cruzarlos es lo que cierra el tramo; el crono
// ni siquiera arranca hasta que la máquina se mueve. Por eso esta familia no
// puede ser el HUD genérico con otro icono: cambia quién manda.
//
// Cuatro reglas del dominio, y las cuatro se VEN corriendo el guion:
//
//   1. El crono espera a la máquina           → escenario del esquí.
//   2. El cruce cierra el tramo               → escenario del remo.
//   3. Un corte de lecturas no cierra nada    → remo, a los 92 s.
//   4. Si el cruce no se ve, cierra el toque  → escenario de la bici.
//
// La cara horizontal no es una variante decorativa: es la postura real de este
// entreno (el móvil apoyado en el ergo), y por eso la orientación cambia la
// pintura entera, no el ancho de una tarjeta.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { InvitacionAGirar } from './girar';
import { CaraMonitor } from './monitor';
import { GUION, type Guion } from './motor';
import { CaraVertical } from './vertical';

export const meta: TwinMeta = {
  id: 'vivo-erg',
  titulo: 'El ergo por series — el hito manda',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  descripcion:
    'Remo, esquí y bici con el monitor conectado: el ritmo contra tu objetivo, la medida drenando hasta el hito y el descanso como pantalla propia. Gira el marco para ver la cara de monitor.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'series-remo',
    titulo: 'Remo 5×500 · serie 2',
    descripcion:
      'Entras con la serie lanzada. A los 92 s se cortan las lecturas y el tramo NO se cierra; al cruzar los 500 llega el descanso de 2:00 con el resumen y el pulso bajando.',
  },
  {
    id: 'ski-continuo',
    titulo: 'Esquí 400 m · el crono espera',
    descripcion:
      'Tres segundos quieto: el crono no arranca hasta el primer golpe. Los cuatro parciales de 100 se apilan solos. Sin pulso, porque el reloj no dio lectura (ejecución 173).',
  },
  {
    id: 'bici-calorias',
    titulo: 'Bici 3×20 cal · se pierde el cruce',
    descripcion:
      'Aquí la medida es la caloría y el ritmo son vatios. El corte se traga el cruce de las 20: la serie no se da por hecha y la cierras tú. Después, descanso sin prescribir.',
  },
  {
    id: 'horizontal-monitor',
    titulo: 'La cara de monitor',
    descripcion:
      'El móvil apoyado en el ergo: cuatro lecturas grandes, la serie y lo que queda en la franja. Cambia la orientación a horizontal en el panel.',
  },
];

function guionDe(escenario: string): Guion {
  return GUION[escenario] ?? GUION['series-remo'];
}

export function Screen({ orientation, escenario, onLog }: TwinScreenProps) {
  const guion = guionDe(escenario);
  const landscape = orientation === 'landscape';

  // Girar el móvil ES la decisión de postura: en horizontal manda la cara de
  // monitor, la corra el escenario que la corra. Y el escenario que existe para
  // enseñarla, en vertical, previsualiza en vez de dejar un callejón.
  const cuerpo = landscape ? (
    <CaraMonitor guion={guion} onLog={onLog} />
  ) : escenario === 'horizontal-monitor' ? (
    <InvitacionAGirar guion={guion} />
  ) : (
    <CaraVertical guion={guion} onLog={onLog} />
  );

  return <div className="twin-screen-safe">{cuerpo}</div>;
}
