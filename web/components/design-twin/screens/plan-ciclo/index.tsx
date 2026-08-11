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
// Y se pinta con LA ESPINA (`web/components/plan-espina`), el mismo camino
// vertical de la nota del coach y de la periodización del dashboard: mismos
// rótulos de semana («S5-S8»), mismo color por posición, mismo «estás aquí».
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
  estado: 'espejo',
  actualizado: '2026-08-12',
  descripcion:
    'El ciclo entero como camino vertical: las etapas que tu coach ha publicado, en orden y con el nombre que él les puso, «estás aquí» sobre la que toca, lo que está marcado en el calendario, el agujero declarado donde se acaba lo publicado y la carrera cerrando por abajo. Cero carga prevista: eso no se sabe.',
  fuentes: [
    'ios/FAHYBRIK/Plan/PlanCicloView.swift',
    'ios/FAHYBRIK/Plan/PlanCicloAtoms.swift',
    'ios/FAHYBRIK/Plan/CicloDelPlan.swift',
    'ios/FAHYBRIK/Plan/Espina/EspinaDelPlan.swift',
    'ios/FAHYBRIK/Plan/Espina/CaminoDelPlan.swift',
  ],
  // El 11-ago se portó esta propuesta 1:1 a `PlanCicloView.swift`, con cuatro
  // divergencias reales sobre lo que había aquí (ahora ya resueltas en este
  // mockup): el sobrante se reparte a partes IGUALES entre las paradas que
  // crecen (antes 3:2:1:1); el texto de una parada pasada baja a `muted` y el
  // nodo se queda con el 45 % del tono (antes los dos al 45 %); hay botón de
  // cerrar (×) en el cromo, junto al nivel (`fullScreenCover` en iOS); y la
  // acción es secundaria en mayúsculas, «VER LA SEMANA».
  enApp:
    'PlanCicloView.swift + PlanCicloAtoms.swift implementan esta pantalla 1:1: el cromo con el nivel y el cierre, el sujeto, la espina compartida (`Espina/EspinaDelPlan.swift`) con sus paradas a peso igual, y la frase de política al pie.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

// El mínimo PRIMERO (§6.3): el atleta recién dado de alta es el que ve todo el
// mundo el primer día, y es donde «apilado arriba y vacío abajo» duele más.
export const escenarios: TwinEscenario[] = [
  {
    id: 'alta-nueva',
    titulo: 'Sin plan · recién dado de alta',
    descripcion:
      'Cero etapas y cero carreras: no hay camino que repartir, así que el arquetipo degrada a Vacío y centra. La salida es obligatoria y no es una acción suya: lo publica su coach.',
  },
  {
    id: 'sin-publicar',
    titulo: 'Sin plan activo · lo publicado se acabó',
    descripcion:
      'El atleta real: su etapa terminó el 26-jul y no hay ni una asignación futura en toda la base. Aquí SÍ hay de dónde venir, así que el camino enseña la etapa y luego se rompe: nodo discontinuo, «aquí acaba lo publicado» y su dueño.',
  },
  {
    id: 'coach',
    titulo: 'Ciclo recién empezado · S1 de «Acumulación»',
    descripcion:
      'Una sola etapa publicada, sin secuencia detrás: no se sabe qué viene después y se dice. El nodo de hoy lleva anillo y sus semanas debajo; la carrera cierra el camino a 105 días.',
  },
  {
    id: 'secuencia',
    titulo: 'Mitad de ciclo · tres etapas, cursor en la segunda',
    descripcion:
      'El caso lleno: «Primer mes» (S1-S4) → «Base 1» (S5-S8) → «Testing» (S9-S12). La primera ya pasó y baja de tinta, la de hoy lleva «Estás aquí, semana 2», y las marcas del calendario rellenan sus nodos.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  return (
    <div className="twin-screen-safe">
      <Pantalla escenario={escenario} onLog={onLog} />
    </div>
  );
}
