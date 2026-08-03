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

export const meta: TwinMeta = {
  id: 'run-live',
  titulo: 'Correr — calle y cinta',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  actualizado: '2026-08-03',
  descripcion:
    '4×1000 @ 4:35: puerta de bloque, «¿Dónde corres hoy?», y el HUD de calle (GPS, mapa, autopausa) o el de cinta (velocidad manual honesta) — gira el marco en el HUD.',
  fuentes: [
    'ios/FAHYBRIK/Workout/BlockPreviewGate.swift',
    'ios/FAHYBRIK/Workout/RunPreStartFlow.swift',
    'ios/FAHYBRIK/Workout/Outdoor/OutdoorRunHUDView.swift',
    'ios/FAHYBRIK/Workout/Outdoor/RunRouteMapView.swift',
    'ios/FAHYBRIK/Workout/Outdoor/RunAutoPause.swift',
    'ios/FAHYBRIK/Devices/Treadmill/TreadmillHUDView.swift',
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
            onLog('Correr sin conectar → la distancia se apunta a mano');
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
