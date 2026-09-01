'use client';

// PROPUESTA — contador de reps precargado por sensor (fase 2).
// El botón de «toca para sumar» no desaparece: deja de arrancar en cero.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'contador-reps',
  titulo: 'Contador de reps — precargado por sensor',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-11',
  descripcion:
    'Tres estados: contado (confianza alta), dudoso, no lo sé. Siempre se ve quién contó.',
  fuentes: [
    'docs/plan-reconocer-movimiento.html',
    'ios/FAHYBRIKCore/Sensor/RepCounter.swift',
    'ios/FAHYBRIK/Workout/Vivo/FuerzaVivoView.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  enApp:
    'El motor precarga reps desde el sensor; falta el chip de procedencia en el vivo (Claude).',
};

export const escenarios: TwinEscenario[] = [
  { id: 'contado', titulo: '10 reps · sensor', descripcion: 'Confianza alta; precargado, atleta confirma.' },
  { id: 'dudoso', titulo: '¿9 o 10?', descripcion: 'Baja confianza: no se entrega con aplomo.' },
  { id: 'manual', titulo: 'Tocado por el atleta', descripcion: 'sensor_corrected o athlete_tap.' },
];

export function Screen({ escenario }: TwinScreenProps) {
  const map: Record<string, { n: string; src: string; tone: string }> = {
    contado: { n: '10', src: 'Sensor · alta', tone: '#2f9e44' },
    dudoso: { n: '—', src: 'Sensor · dudoso', tone: '#fab005' },
    manual: { n: '9', src: 'Tú (corrigió al sensor)', tone: '#f8f9fa' },
  };
  const s = map[escenario] ?? map.contado!;
  return (
    <div className="twin-screen-safe" style={{ background: '#0a0a0a', color: '#f8f9fa', minHeight: '100%' }}>
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 12, opacity: 0.5, letterSpacing: 1, textTransform: 'uppercase' }}>
          Wall balls · ronda 2
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 24, letterSpacing: -2 }}>{s.n}</div>
        <div style={{ marginTop: 8, fontSize: 14, color: s.tone }}>{s.src}</div>
        <p style={{ marginTop: 40, fontSize: 13, opacity: 0.45, lineHeight: 1.45 }}>
          Propuesta. El contador en motor ya se precarga desde el sensor; la UI de
          procedencia la pinta Claude en el vivo.
        </p>
      </div>
    </div>
  );
}
