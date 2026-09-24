// Piezas de la guía «zonas-de-pulso»: los mockups y datos de ejemplo que pinta el
// artículo (../zonas-de-pulso.tsx). Viven aparte para que el artículo quede en su texto;
// la verificación contra el código está en la cabecera del artículo.

import type { ReactNode } from 'react';

// Rampa de zona baja→alta usando SOLO tokens vivos (nada hardcodeado). Espeja
// ZoneColors.swift: gris · azul · verde · ámbar · rojo. El naranja de marca queda
// fuera a propósito, igual que en la app.
const ZONE_HUES = [
  'var(--v2-muted)',
  'var(--v2-info)',
  'var(--v2-ok)',
  'var(--v2-warn)',
  'var(--v2-danger)',
] as const;

// El ejemplo trabajado de toda la sección: atleta de 44 años sin FC máx medida.
// Tanaka(44) = 177,2 → umbral = 0,88 × 177,2 ≈ 156 ppm. Las bandas de abajo son las
// que devuelve resolveHrZones con ese ancla (verificadas en el test del modelo).
export const EJEMPLO_UMBRAL = '156';

// Una fila de la tabla de referencia del coach: Zn · nombre · fracción del umbral ·
// ppm resueltas. Vive en la crónica clara del documento, así que usa tokens --v2-*.
export function ZoneRow({
  z,
  name,
  fraction,
  bpm,
}: {
  z: number;
  name: string;
  fraction: string;
  bpm: string;
}) {
  const hue = ZONE_HUES[z - 1];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '26px 1fr auto auto',
        gap: '12px',
        alignItems: 'center',
        padding: '9px 2px',
        borderTop: '1px solid var(--v2-border)',
        fontSize: '13px',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          fontWeight: 800,
          color: hue,
          border: `1px solid ${hue}`,
          borderRadius: '5px',
          padding: '2px 0',
          textAlign: 'center',
        }}
      >
        Z{z}
      </span>
      <span style={{ color: 'var(--v2-fg)' }}>{name}</span>
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '11.5px',
          color: 'var(--v2-muted)',
          minWidth: '86px',
          textAlign: 'right',
        }}
      >
        {fraction}
      </span>
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '12.5px',
          fontWeight: 700,
          color: 'var(--v2-fg)',
          minWidth: '74px',
          textAlign: 'right',
        }}
      >
        {bpm}
      </span>
    </div>
  );
}

// Una fila de "Mis zonas · Pulso" tal cual la pinta hrZoneRow en MyZonesView: barra
// de color, código + nombre, y el rango YA formateado por el servidor a la derecha.
export function PulseRow({ z, name, range }: { z: number; name: string; range: string }) {
  const hue = ZONE_HUES[z - 1];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr auto',
        gap: '11px',
        alignItems: 'center',
        padding: '9px 2px',
        borderTop: '1px solid var(--hair)',
      }}
    >
      <span style={{ background: hue, borderRadius: '2px', height: '26px' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>Z{z}</span>
        <span style={{ fontSize: '10px', color: 'var(--faint)' }}>{name}</span>
      </span>
      <span className="num" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
        {range}
      </span>
    </div>
  );
}

// Un peldaño de la cadena de anclas. `strength` pinta el borde: medido (ok) vs
// estimado (neutro punteado), que es exactamente la distinción que importa.
export function AnchorRung({
  n,
  title,
  detail,
  measured,
}: {
  n: string;
  title: string;
  detail: ReactNode;
  measured?: boolean;
}) {
  const tone = measured ? 'var(--v2-ok)' : 'var(--v2-muted)';
  return (
    <div
      style={{
        display: 'flex',
        gap: '13px',
        alignItems: 'flex-start',
        background: 'var(--v2-surface)',
        border: measured ? `1px solid ${tone}` : '1px dashed var(--v2-border)',
        borderRadius: 'var(--v2-r-m)',
        padding: '13px 15px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '12px',
          fontWeight: 800,
          color: tone,
          border: `1px solid ${tone}`,
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: '13.5px',
            fontWeight: 700,
            color: 'var(--v2-fg)',
            marginBottom: '2px',
          }}
        >
          {title}
        </span>
        <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--v2-muted)', lineHeight: 1.5 }}>
          {detail}
        </span>
      </span>
    </div>
  );
}
