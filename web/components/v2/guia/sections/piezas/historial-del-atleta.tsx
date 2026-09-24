// Piezas de la guía «historial-del-atleta»: los mockups y datos de ejemplo que pinta el
// artículo (../historial-del-atleta.tsx). Viven aparte para que el artículo quede en su texto;
// la verificación contra el código está en la cabecera del artículo.

import type { ReactNode } from 'react';

// Colores de modalidad (nunca se desvían de los tokens v2 vivos).
export const MOD = {
  carrera: 'var(--v2-mod-carrera)',
  fuerza: 'var(--v2-mod-fuerza)',
  circuito: 'var(--v2-mod-circuito)',
  ergo: 'var(--v2-mod-ergo)',
} as const;

// El azul de "en pareja" — el mismo aro azul que marca los entrenos de dobles.
export const PARTNER = 'var(--v2-info)';

type Mark = 'done' | 'pair' | 'rest';

// Una celda del calendario mensual: el número del día + su marca. `done` = punto
// naranja, `pair` = aro azul (entreno con la pareja), `rest` = raya (descanso
// programado). Sin marca = día sin nada.
export function CalCell({ day, mark, today }: { day?: number; mark?: Mark; today?: boolean }) {
  if (!day) return <div />;
  const isPair = mark === 'pair';
  return (
    <div
      style={{
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        borderRadius: '9px',
        border: today ? '1px solid var(--acc)' : '1px solid transparent',
        background: today ? 'var(--elev)' : 'transparent',
      }}
    >
      <span
        style={
          isPair
            ? {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: `2px solid ${PARTNER}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 800,
                color: 'var(--fg)',
              }
            : {
                fontSize: '11px',
                fontWeight: mark === 'done' ? 800 : 600,
                color: mark ? 'var(--fg)' : 'var(--faint)',
              }
        }
      >
        {day}
      </span>
      {mark === 'done' ? (
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--acc)' }} />
      ) : mark === 'rest' ? (
        <span style={{ width: '8px', height: '2px', borderRadius: '2px', background: 'var(--faint)' }} />
      ) : (
        <span style={{ height: '5px' }} />
      )}
    </div>
  );
}

// Una fila de split en el detalle del día: tramo + hecho + veredicto contra el objetivo.
export function SplitRow({
  hue,
  label,
  done,
  verdict,
  tone,
}: {
  hue: string;
  label: string;
  done: string;
  verdict: string;
  tone: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: '9px',
        alignItems: 'center',
        padding: '8px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11.5px',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span className="mdot" style={{ background: hue }} />
        <span style={{ color: 'var(--fg)' }}>{label}</span>
      </span>
      <span className="num" style={{ fontSize: '11px', color: 'var(--muted)' }}>
        {done}
      </span>
      <span
        style={{
          fontSize: '9px',
          fontWeight: 800,
          color: tone,
          border: `1px solid ${tone}`,
          borderRadius: '999px',
          padding: '2px 7px',
          whiteSpace: 'nowrap',
        }}
      >
        {verdict}
      </span>
    </div>
  );
}

// Los siete encabezados de la semana (Barcelona: lunes primero).
export const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

// El mes de ejemplo: julio empieza en martes → una celda vacía de arranque. Cada día
// lleva su marca (o ninguna). Hoy = 13.
export const MONTH: { day?: number; mark?: Mark; today?: boolean }[] = [
  { }, // arranca en martes
  { day: 1, mark: 'done' },
  { day: 2, mark: 'pair' },
  { day: 3, mark: 'rest' },
  { day: 4, mark: 'done' },
  { day: 5, mark: 'done' },
  { day: 6 },
  { day: 7, mark: 'done' },
  { day: 8, mark: 'pair' },
  { day: 9, mark: 'done' },
  { day: 10, mark: 'rest' },
  { day: 11, mark: 'done' },
  { day: 12, mark: 'done' },
  { day: 13, mark: 'pair', today: true },
  { day: 14 },
  { day: 15, mark: 'done' },
  { day: 16, mark: 'done' },
  { day: 17, mark: 'rest' },
  { day: 18, mark: 'done' },
  { day: 19, mark: 'pair' },
  { day: 20 },
  { day: 21, mark: 'done' },
  { day: 22, mark: 'done' },
  { day: 23, mark: 'done' },
  { day: 24, mark: 'rest' },
  { day: 25, mark: 'done' },
  { day: 26, mark: 'pair' },
  { day: 27 },
  { day: 28, mark: 'done' },
  { day: 29, mark: 'done' },
  { day: 30, mark: 'rest' },
  { day: 31, mark: 'done' },
];

// Leyenda del calendario: las tres marcas, tal cual las ve el atleta.
export function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--muted)' }}>
      {swatch}
      {label}
    </span>
  );
}
