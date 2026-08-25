'use client';

// PEGATINA DE SERIES — recorte del recap, en una esquina.
//
// Card 132, corte 25-ago. No es compartir-entreno. No hay Instagram, ni
// conmutador de marca, ni pegatina del día. Los números salen de
// `projectSeriesSticker` sobre el mismo recap del escenario recap-lleno.

import { useEffect } from 'react';
import { projectSeriesSticker } from '@fahybrid/shared/domain/recap-sticker';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { ESCENAS } from '../lectura-sesion/datos';
import { recapDesdeBloques } from '../lectura-sesion/modelo';
import { Parciales } from '../lectura-sesion/piezas';
import { STORY } from './lienzo';

export const meta: TwinMeta = {
  id: 'pegatina-series',
  titulo: 'Pegatina de series — recorte del recap',
  zona: 'Entreno en vivo',
  estado: 'construida',
  actualizado: '2026-08-25',
  descripcion:
    'Card 132. Los parciales del recap, en una esquina del vídeo. No es un cartel a pantalla completa. Sin marca. Sin Meta.',
  fuentes: [
    'shared/domain/recap-sticker.ts',
    'ios/FAHYBRIK/Workout/PostWorkout/PegatinaSeriesView.swift',
  ],
  enApp: 'PegatinaSeriesView. Recorte de RecapLayout. Sin Meta. El envío a Instagram lo lleva otra sesión.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'vo2max',
    titulo: 'VO2max · los parciales',
    descripcion:
      'El recorte del recap lleno: ocho tiempos y ritmos. Cabe en una esquina. Si se mueve un número del recap, se mueve aquí.',
  },
];

export function Screen({ onLog }: TwinScreenProps) {
  const sesion = ESCENAS['recap-lleno']!;
  const sticker = projectSeriesSticker(recapDesdeBloques(sesion.bloques));

  useEffect(() => {
    onLog(sticker ? `${sticker.label} · ${sticker.splits.length} parciales` : 'Sin tanda');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="twin-screen-safe" style={{ background: '#0b0b0c', height: '100%', position: 'relative' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 80% at 40% 30%, rgba(80,80,88,0.45), transparent 55%), linear-gradient(180deg, #1a1a1e 0%, #0b0b0c 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 28,
          width: `calc(${(STORY.tarjetaAncho / STORY.ancho) * 100}% - 8px)`,
          maxWidth: 260,
        }}
      >
        {sticker && (
          <div
            data-pegatina="series"
            style={{
              borderRadius: 16,
              background: 'rgba(20,20,22,0.92)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', color: '#f5f3f0' }}>
                {sticker.label}
              </span>
              {sticker.pauta && (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#9a938b' }}>{sticker.pauta}</span>
              )}
            </div>
            <Parciales series={sticker} />
          </div>
        )}
      </div>
    </div>
  );
}
