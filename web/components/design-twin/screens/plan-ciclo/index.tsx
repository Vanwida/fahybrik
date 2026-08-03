'use client';

// El plan — «hacia dónde voy y cuánto queda».
//
// La vista más lejana de la familia del plan (`plan-ciclo` · `plan-semana` ·
// `plan-dia`): las tres preguntan lo mismo a tres distancias, así que comparten
// modelo (`plan/modelo.ts`), escenarios (`plan/datos.ts`) y vocabulario visual
// (`plan/atoms.tsx`). Aquí no se pinta ningún entreno: se pinta la ESTRUCTURA
// publicada —qué etapas hay, en qué orden, dónde caes hoy, qué está marcado y
// cuándo es la carrera— que es lo único del futuro que de verdad se sabe.
//
// Lo que NO hay, y es el motivo de que exista: ni una barra de carga, de volumen
// o de intensidad prevista. El resultado medido del futuro depende de lo que el
// atleta haga, así que dibujarlo sería mentir (CONTRATO-UI §7).

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Pantalla } from './pantalla';

export const meta: TwinMeta = {
  id: 'plan-ciclo',
  titulo: 'El plan — hacia dónde voy y cuánto queda',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-07-29',
  descripcion:
    'Las etapas que tu coach ha publicado, en orden y con el nombre que él les puso, el cursor de hoy dentro de la que toca, lo que está marcado en el calendario y la carrera cerrando por abajo. Cero carga prevista: eso no se sabe.',
  fuentes: [],
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

// El mínimo PRIMERO (§6.3): el atleta recién dado de alta es el que ve todo el
// mundo el primer día, y es donde «apilado arriba y vacío abajo» duele más.
export const escenarios: TwinEscenario[] = [
  {
    id: 'alta-nueva',
    titulo: 'Recién dado de alta · sin nada',
    descripcion:
      'Cero etapas y cero carreras: no hay espina que repartir, así que el arquetipo degrada a Vacío y centra. La salida es obligatoria y no es una acción suya: lo publica su coach.',
  },
  {
    id: 'sin-publicar',
    titulo: 'Hoy en producción · lo publicado se acabó',
    descripcion:
      'El atleta real: su etapa terminó el 26-jul y no hay ni una asignación futura en toda la base. Aquí SÍ hay de dónde venir, así que la espina enseña la etapa y el agujero del final se declara con su dueño.',
  },
  {
    id: 'coach',
    titulo: 'Dentro de «Acumulación» · semana 1 de 2',
    descripcion:
      'Una sola etapa publicada, sin secuencia detrás: no se sabe qué viene después y se dice. La etapa se abre con sus semanas y la carrera cierra a 105 días.',
  },
  {
    id: 'secuencia',
    titulo: 'Tres etapas encadenadas · cursor en el segundo',
    descripcion:
      'El caso lleno: «Primer mes» → «Base 1» → «Testing», cuatro semanas cada una. Un test con fecha en la etapa de hoy y cuatro por posición en «Testing», que se enseñan como lo que se sabe: «semana 1 · martes».',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Pantalla escenario={escenario} onLog={onLog} />
    </div>
  );
}
