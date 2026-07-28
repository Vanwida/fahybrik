'use client';

// Benchmark del remo — de la marca al HUD. La pantalla estrella del doble:
// reproduce el flujo real («Probarme ahora» → puerta → conexión → pieza) con la
// regla que motivó todo esto: un benchmark JAMÁS arranca sin monitor, porque la
// marca la mide el monitor. Fases navegables como en la app; lo asíncrono
// (escaneo, programación, caída del enlace) corre por guion determinista.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ErgConnect } from './connect';
import { MARCA, OBJETIVO_S_500, PM5, TIEMPOS, fmtMarca } from './data';
import { ErgHUD } from './hud';
import { BlockGate, MarkDetail } from './phases';

export const meta: TwinMeta = {
  id: 'benchmark-erg',
  titulo: 'Benchmark del remo — de la marca al HUD',
  zona: 'Entreno en vivo',
  estado: 'espejo',
  descripcion:
    'El flujo entero de «Probarme ahora»: detalle de marca, puerta de bloque, conexión obligatoria del monitor y la pieza en vivo — gira el marco para ver la cara horizontal.',
  fuentes: [
    'ios/FAHYBRIK/Marks/MarkDetailView.swift',
    'ios/FAHYBRIK/Marks/BenchmarkLaunch.swift',
    'ios/FAHYBRIK/Workout/BlockPreviewGate.swift',
    'ios/FAHYBRIK/Workout/ActiveWorkoutView.swift',
    'ios/FAHYBRIK/Workout/ErgPreStartFlow.swift',
    'ios/FAHYBRIK/Devices/PM5/PM5LiveStreamView.swift',
    'ios/FAHYBRIK/Devices/PM5/ErgHUDContent.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: true,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'normal',
    titulo: 'PM5 limpio',
    descripcion: 'Escaneo, «USAR ESTE PM5», pieza programada y 500 m completos hasta la marca.',
  },
  {
    id: 'monitor-sucio',
    titulo: 'Monitor con 100 m hechos',
    descripcion: 'El PM5 traía una pieza a medias: la app lo resetea y programa antes de empezar.',
  },
  {
    id: 'cae-conexion',
    titulo: 'Se cae la conexión a mitad',
    descripcion: 'A los ~45 s el enlace se pierde: el HUD se apaga honesto y vuelve al reconectar.',
  },
];

type Fase = 'detalle' | 'gate' | 'conexion' | 'hud';

export function Screen({ orientation, escenario, onLog }: TwinScreenProps) {
  const [fase, setFase] = useState<Fase>('detalle');
  const landscape = orientation === 'landscape';
  const sucio = escenario === 'monitor-sucio';

  const objetivo = `@ ${fmtMarca(OBJETIVO_S_500)} /500m`;

  const cuerpo = (() => {
    switch (fase) {
      case 'detalle':
        return (
          <MarkDetail
            onProbarme={() => {
              onLog('Probarme ahora → Benchmark');
              setFase('gate');
            }}
          />
        );
      case 'gate':
        return (
          <BlockGate
            titulo={MARCA.label}
            fase="BENCHMARK"
            formato={`Benchmark · a batir ${fmtMarca(MARCA.prSegundos)}`}
            trabajo={[{ nombre: MARCA.label, linea: `${MARCA.distanciaM} m ${objetivo}` }]}
            onEmpezar={() => {
              // La puerta del motor: pieza de erg sin monitor → conexión OBLIGADA.
              onLog('EMPEZAR → falta el monitor: se abre «Conecta el remo»');
              setFase('conexion');
            }}
            onSalir={() => setFase('detalle')}
          />
        );
      case 'conexion':
        return (
          <ErgConnect
            sessionTitle={MARCA.label}
            machineWord="el remo"
            isBenchmark
            escaneoMs={TIEMPOS.escaneoMs}
            metrosEnMonitor={sucio ? 100 : 0}
            onUsar={() => {
              if (sucio) onLog('Monitor con pieza a medias → reseteado');
              onLog(`Pieza programada: ${MARCA.distanciaM} m`);
              setFase('hud');
            }}
            onCancel={() => setFase('gate')}
            onLog={onLog}
          />
        );
      case 'hud':
        return (
          <ErgHUD
            landscape={landscape}
            programarMs={sucio ? TIEMPOS.programarSucioMs : TIEMPOS.programarMs}
            conCaida={escenario === 'cae-conexion'}
            onTerminar={() => onLog('TERMINAR → abriría el resumen post-entreno (pendiente en el doble)')}
            onLog={onLog}
          />
        );
    }
  })();

  // Las fases previas al HUD son de retrato en la app; giradas se centran en una
  // columna usable en vez de fingir un layout horizontal que no existe.
  if (landscape && fase !== 'hud') {
    return (
      <div className="twin-screen-safe">
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 520, maxWidth: '100%', height: '100%' }}>{cuerpo}</div>
        </div>
      </div>
    );
  }

  return <div className="twin-screen-safe">{cuerpo}</div>;
}

// El serial vive en data.ts; re-exportado para el panel de dirección si algún
// día se quiere enseñar («PM5 430512345» es el ID del monitor de ejemplo).
export const PM5_EJEMPLO = PM5.nombre;
