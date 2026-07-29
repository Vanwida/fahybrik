'use client';

// El plan — LA SEMANA.
//
// La segunda de las tres distancias del mismo objeto (`plan/modelo.ts`), y la
// que más se abre: contesta **«¿qué me toca hoy y qué llevo?»**, de un vistazo y
// con el reparto por modalidad delante.
//
// Arquetipo Lista (§6.2): el sujeto es EL CONJUNTO Y SU ESTADO —el contador de
// sesiones y las horas ya medidas—, no una sesión suelta. Y cuando la semana no
// tiene nada, la Lista **degrada a Vacío** y se pinta centrada con salida, que
// es el caso de HOY en producción: no existe ni una asignación futura en toda la
// base.
//
// Todo lo que pinta sale de `plan/datos.ts` con su procedencia al lado; el
// vocabulario visual entero es el de `plan/atoms.tsx`, compartido con las otras
// dos vistas del plan para que el sujeto no baile al bajar de nivel (§10.3).

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Pantalla } from './pantalla';

export const meta: TwinMeta = {
  id: 'plan-semana',
  titulo: 'El plan — la semana',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  descripcion:
    'Qué te toca hoy y qué llevas: el contador de sesiones, las horas ya medidas, el reparto por modalidad y los siete días con su estado. La semana vacía tiene dos caras, y se distinguen.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    // El caso de diseño (§6.3): el que ve todo el mundo el primer día.
    id: 'alta-nueva',
    titulo: 'Recién dado de alta · sin plan',
    descripcion:
      'Atleta 68: cero asignaciones en toda la base y ningún plan del que venir. La Lista degrada a Vacío centrado, y la salida es doble: lo publica su coach, y mientras tanto se puede montar el entreno.',
  },
  {
    id: 'sin-publicar',
    titulo: 'El plan se acabó · sin semana nueva',
    descripcion:
      'Atleta 67 HOY: la semana está igual de vacía, pero este sí tiene de dónde venir. Cerró «Acumulación» el 26-jul, así que el vacío puede decir qué acabó y ofrecer volver a ello.',
  },
  {
    id: 'coach',
    titulo: 'La semana del coach · jueves',
    descripcion:
      'La semana real del atleta 67 (13-19 jul): 8 sesiones en 6 días, 6 medidas, una saltada, sábado de descanso y dos días dobles. Hoy es jueves y toca el rodaje Z2.',
  },
  {
    id: 'libre',
    titulo: 'La semana te la montas tú',
    descripcion:
      'Atleta 64: cinco cosas el martes (cuatro suyas más un test del coach) y tres el lunes. Sin tramo y sin voz del coach — el titular sale del estado, no se le inventa una frase.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Pantalla escenario={escenario} onLog={onLog} />
    </div>
  );
}
