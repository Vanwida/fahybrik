'use client';

// Correr — calle y cinta: la puerta del bloque, la pregunta «¿Dónde corres
// hoy?» (la hace la puerta del motor ANTES de nada, la misma para plan, libre y
// benchmark) y el HUD que toque. El toque del atleta manda: aunque el escenario
// sugiera cinta, puede elegir calle — el guion solo gobierna lo asíncrono.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { BLOQUE, entornoDelEscenario, type Entorno } from './data';
import { PuertaBloque } from './gate';
import { HUDCalle } from './hud-calle';
import { HUDCinta } from './hud-cinta';
import { GuiaCinta, PasoDonde, type EnlaceCinta } from './prestart';

// POR QUÉ ESTA PANTALLA VUELVE A «CONSTRUIDA» (10-ago-2026).
//
// Se sellaba `espejo` del 3-ago, y al re-verificarla contra el Swift de hoy salió
// que ya mentía ANTES de ese sello: el sujeto del HUD de calle dejó de llevar la
// sub-línea «Objetivo 4:35 · DENTRO» el 29-jul (commit b49684a2), y desde entonces
// enseña una PASTILLA DE DESVÍO —«+7 s vs objetivo», `DeltaPastilla` de
// `Theme/LenguajeVivoUI.swift`, que ni siquiera está en `fuentes`— y colorea el
// numeral con la escala del §10 (dentro = ok, RÁPIDO = warning), no con el
// dos-colores de aquí. Eso es una pasada de re-verificación propia, no un apaño de
// paso, así que el estado dice la verdad: se construyó, no soy fiel.
//
// Lo que SÍ queda re-verificado hoy, línea a línea contra el Swift:
//   · la línea de dosis del bloque, que ahora sale de la estructura (#61)
//   · la cabecera de formato: `wodHeader` escribe «Series», no «Intervalos»
//   · el ritmo objetivo con su unidad PEGADA («4:35/km»), en los dos HUD
//   · «Objetivo 4:35/km · pon 13,1» en la cinta (`objetivoConMarca`, 9-ago)
//   · las distancias con coma española, y la MEDIDA con sus dos decimales
//   · el aspa: sale del ENTRENO, no «cierra la pantalla» (5-ago, murieron los covers)
//
// Lo que queda pendiente para volver a `espejo`: la pastilla de desvío + la escala
// de color del sujeto de calle, y añadir `Theme/LenguajeVivoUI.swift` a `fuentes`.
export const meta: TwinMeta = {
  id: 'run-live',
  titulo: 'Correr — calle y cinta',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-25',
  descripcion:
    '4 × 1 km @ 4:35 con 2 min al trote: puerta de bloque, «¿Dónde corres hoy?», y el HUD de calle (GPS, mapa, autopausa) o el de cinta (la velocidad la pones tú, y te decimos qué número marcar) — gira el marco en el HUD.',
  fuentes: [
    'ios/FAHYBRIK/Workout/BlockPreviewGate.swift',
    'ios/FAHYBRIK/Workout/RunPreStartFlow.swift',
    'ios/FAHYBRIK/Workout/Outdoor/OutdoorRunHUDView.swift',
    'ios/FAHYBRIK/Workout/Outdoor/RunRouteMapView.swift',
    'ios/FAHYBRIK/Workout/Outdoor/RunAutoPause.swift',
    'ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDView.swift',
    // La línea de dosis de la puerta la escribe el formateador, no la vista: sin
    // estos dos, el espejo afirmaba una línea cuya fuente no declaraba.
    'ios/FAHYBRIKCore/Plan/PrescriptionRenderer.swift',
    'ios/FAHYBRIKCore/Workout/WorkoutModels.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'calle-gps-ok',
    titulo: 'Calle · GPS al momento',
    descripcion: 'Fija en 3 s y corre la primera serie dentro del objetivo, con parciales.',
  },
  {
    id: 'calle-gps-debil',
    titulo: 'Calle · GPS perezoso',
    descripcion: '8 s buscando señal, un rato en débil, y a fuerte — la insignia nunca miente.',
  },
  {
    id: 'cinta-manual',
    titulo: 'Cinta · la velocidad la pones tú',
    descripcion: 'Una BH sin control por Bluetooth: la app registra lo que pongas y controla la inclinación.',
  },
  {
    id: 'autopausa',
    titulo: 'Semáforo',
    descripcion: 'Te paras a los 40 s: autopausa a los 3 s, y al arrancar se reanuda sola.',
  },
];

type Fase = 'gate' | 'donde' | 'guia-cinta' | 'hud';

export function Screen({ orientation, escenario, onLog }: TwinScreenProps) {
  const horizontal = orientation === 'landscape';
  const [fase, setFase] = useState<Fase>('gate');
  const [eleccion, setEleccion] = useState<Entorno | null>(null);
  const [entorno, setEntorno] = useState<Entorno>('calle');
  const [enlaceCinta, setEnlaceCinta] = useState<EnlaceCinta>('suelta');

  switch (fase) {
    case 'gate':
      return (
        <PuertaBloque
          horizontal={horizontal}
          onEmpezar={() => {
            onLog('EMPEZAR → el bloque lleva carrera: la puerta pregunta dónde');
            setEleccion(entornoDelEscenario(escenario));
            setFase('donde');
          }}
          onSalir={() => onLog('Saldría del entreno')}
          onAtras={() => onLog('Iría al bloque anterior')}
        />
      );
    case 'donde':
      return (
        <PasoDonde
          horizontal={horizontal}
          sesion={BLOQUE.titulo}
          eleccion={eleccion}
          onElegir={setEleccion}
          onContinuar={() => {
            const elegido = eleccion ?? 'calle';
            setEntorno(elegido);
            onLog(elegido === 'calle' ? 'En la calle → GPS' : 'En cinta → conectarla');
            if (elegido === 'calle') {
              setFase('hud');
            } else {
              setEnlaceCinta('suelta');
              setFase('guia-cinta');
            }
          }}
          onCancelar={() => setFase('gate')}
        />
      );
    case 'guia-cinta':
      return (
        <GuiaCintaConGuion
          horizontal={horizontal}
          enlace={enlaceCinta}
          setEnlace={setEnlaceCinta}
          onEmpezar={() => setFase('hud')}
          onSinConectar={() => {
            // Ya no baja a un HUD genérico ni a apuntar la distancia a mano
            // (`ManualEntryControl` murió con los covers el 5-ago): se queda en su
            // pantalla, que sin cinta degrada sola a reloj del tramo, objetivo y pulso.
            onLog('Correr sin conectar → se queda en la pantalla, sin lectura de la cinta');
            setFase('hud');
          }}
          onAtras={() => setFase('donde')}
          onLog={onLog}
        />
      );
    case 'hud':
      return entorno === 'calle' ? (
        <HUDCalle horizontal={horizontal} escenario={escenario} onSalir={() => setFase('gate')} onLog={onLog} />
      ) : (
        <HUDCinta horizontal={horizontal} onSalir={() => setFase('gate')} onLog={onLog} />
      );
  }
}

/** La guía con su guion: «Buscar mi cinta» → 2,2 s de escaneo → conectada. */
function GuiaCintaConGuion({
  horizontal,
  enlace,
  setEnlace,
  onEmpezar,
  onSinConectar,
  onAtras,
  onLog,
}: {
  horizontal: boolean;
  enlace: EnlaceCinta;
  setEnlace: (e: EnlaceCinta) => void;
  onEmpezar: () => void;
  onSinConectar: () => void;
  onAtras: () => void;
  onLog: (l: string) => void;
}) {
  return (
    <GuiaCinta
      horizontal={horizontal}
      sesion={BLOQUE.titulo}
      enlace={enlace}
      onBuscar={() => {
        setEnlace('buscando');
        onLog('Buscando tu cinta…');
        setTimeout(() => {
          setEnlace('conectada');
          onLog('Cinta conectada · T01_0421');
        }, 2200);
      }}
      onSinConectar={onSinConectar}
      onEmpezar={() => {
        onLog('▶ Empezar en cinta');
        onEmpezar();
      }}
      onAtras={onAtras}
    />
  );
}
