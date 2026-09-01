'use client';

// PROPUESTA — semáforo de velocidad de subida en el hierro (fase 3 sensor).
// Grok: modelo de datos + cable. Claude: pintar el HUD en vivo-fuerza / esta pantalla.
// El color es de VELOCIDAD (m/s), no de %1RM. El atleta interpreta el RM.

import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';

export const meta: TwinMeta = {
  id: 'velocidad-serie',
  titulo: 'Velocidad de barra — m/s en la serie',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-08-11',
  descripcion:
    'Durante la sentadilla (móvil delante): m/s de la última rep, pérdida vs la primera, semáforo verde→rojo. Sin %1RM. RIR se sigue pidiendo.',
  fuentes: [
    'docs/plan-reconocer-movimiento.html',
    'shared/domain/strength/velocity-bands.ts',
    'ios/FAHYBRIK/Workout/Vivo/FuerzaVivoView.swift',
  ],
  dispositivo: 'iphone',
  soportaHorizontal: false,
  enApp:
    'El sensor y el cable MirrorWire ya empujan m/s al motor; falta el HUD en FuerzaVivoView (Claude).',
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'limpia',
    titulo: 'Rep limpia · 0,58 m/s',
    descripcion: 'Verde. Primera de la serie, confianza alta.',
  },
  {
    id: 'perdiendo',
    titulo: 'Pérdida 28 % · 0,32 m/s',
    descripcion: 'Naranja. Última rep más lenta que la primera; el atleta decide si es su zona de RM.',
  },
  {
    id: 'dudoso',
    titulo: 'Sin número gordo',
    descripcion: 'Confianza baja cerca del fallo: no se pinta rojo con aplomo.',
  },
];

const BAND: Record<string, { label: string; mps: string; color: string; loss?: string }> = {
  limpia: { label: 'Rápida', mps: '0,58', color: '#2f9e44', loss: '—' },
  perdiendo: { label: 'Lenta', mps: '0,32', color: '#e8590c', loss: '−28 %' },
  dudoso: { label: '—', mps: '—', color: '#868e96', loss: '—' },
};

export function Screen({ escenario }: TwinScreenProps) {
  const b = BAND[escenario] ?? BAND.limpia!;
  return (
    <div className="twin-screen-safe" style={{ background: '#0a0a0a', color: '#f8f9fa', minHeight: '100%' }}>
      <div style={{ padding: '24px 20px', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.55, textTransform: 'uppercase' }}>
          Back squat · serie 3/5 · 100 kg
        </div>
        <div style={{ marginTop: 28, display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: b.color,
              boxShadow: `0 0 18px ${b.color}`,
            }}
          />
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>
            {b.mps}
            <span style={{ fontSize: 22, fontWeight: 500, opacity: 0.7, marginLeft: 6 }}>m/s</span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 15, opacity: 0.75 }}>{b.label}</div>
        <div
          style={{
            marginTop: 32,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <Stat k="Primera" v="0,55 m/s" />
          <Stat k="Pérdida" v={b.loss ?? '—'} />
        </div>
        <p style={{ marginTop: 36, fontSize: 13, opacity: 0.45, lineHeight: 1.45 }}>
          Propuesta. El cable y el sensor ya existen; la UI final del vivo la pinta Claude sobre
          FuerzaVivoView. Sin %1RM. RIR se pregunta al cerrar la serie.
        </p>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: '#161616', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.6 }}>{k}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{v}</div>
    </div>
  );
}
