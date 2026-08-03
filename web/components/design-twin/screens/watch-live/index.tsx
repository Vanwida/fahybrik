'use client';

// El entreno en la muñeca — la app de Apple Watch, en su marco. Tres guiones:
// la carrera continua (brief → puerta → vivo con las dos presentaciones), la
// fuerza por series con su descanso verde, y los splits post-entreno.

import { useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { DIA_CONTINUO, PUERTA_CARRERA } from './data';
import { ContinuousLive, SetTableLive, Splits } from './live';
import { BlockGate, TodayBrief } from './pre';

export const meta: TwinMeta = {
  id: 'watch-live',
  titulo: 'El entreno en la muñeca',
  zona: 'Conexiones y relojes',
  estado: 'espejo',
  actualizado: '2026-08-03',
  descripcion:
    'La app del Apple Watch: brief del día, puerta de bloque, el vivo que tiñe la zona (y pasa a ritmo cuando el GPS mide), series de fuerza con descanso, y splits.',
  fuentes: [
    'ios/FAHYBRIKWatch/Views/TodayBriefView.swift',
    'ios/FAHYBRIKWatch/Views/BlockGateView.swift',
    'ios/FAHYBRIKWatch/Views/ContinuousLiveView.swift',
    'ios/FAHYBRIKWatch/Views/SetTableLiveView.swift',
    'ios/FAHYBRIKWatch/Views/RestBannerView.swift',
    'ios/FAHYBRIKWatch/Views/SplitsView.swift',
    'ios/FAHYBRIKWatch/WatchTheme.swift',
  ],
  dispositivo: 'watch',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'bloque-continuo',
    titulo: 'Carrera continua',
    descripcion: 'Brief → puerta → vivo: primero tiñe la zona; cuando el GPS mide, el héroe es el ritmo.',
  },
  {
    id: 'fuerza-series',
    titulo: 'Fuerza: series y descanso',
    descripcion: '5×5 de sentadilla: marca una serie y cae el descanso verde con su cuenta atrás real.',
  },
  {
    id: 'splits',
    titulo: 'Parciales',
    descripcion: 'Los splits al acabar 3×1000: el más rápido, en naranja.',
  },
];

type FaseContinuo = 'brief' | 'puerta' | 'vivo';

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [fase, setFase] = useState<FaseContinuo>('brief');

  if (escenario === 'fuerza-series') return <SetTableLive onLog={onLog} />;
  if (escenario === 'splits') return <Splits />;

  switch (fase) {
    case 'brief':
      return (
        <TodayBrief
          eyebrow={DIA_CONTINUO.eyebrow}
          titulo={DIA_CONTINUO.titulo}
          bloques={DIA_CONTINUO.bloques}
          minutos={DIA_CONTINUO.minutos}
          primerBloque={DIA_CONTINUO.primerBloque}
          onStart={() => {
            onLog('Empezar → puerta del bloque 1');
            setFase('puerta');
          }}
        />
      );
    case 'puerta':
      return (
        <BlockGate
          status={PUERTA_CARRERA.status}
          eyebrow={PUERTA_CARRERA.eyebrow}
          titulo={PUERTA_CARRERA.titulo}
          chips={PUERTA_CARRERA.chips}
          onStart={() => {
            onLog('Empezar bloque → en vivo');
            setFase('vivo');
          }}
        />
      );
    case 'vivo':
      return <ContinuousLive onLog={onLog} />;
  }
}
