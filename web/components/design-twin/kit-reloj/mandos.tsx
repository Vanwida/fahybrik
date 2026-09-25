'use client';

// LOS MANDOS SIMULADOS — lo que en el reloj de verdad es un dedo, una muñeca
// o un botón físico, y que en el doble hay que poder provocar.
//
// Viven FUERA del lienzo del reloj, a propósito: se montan por portal debajo
// del marco (en el escenario del estudio), con su propio aspecto de estudio.
// Lo que sale dentro del lienzo es la app; lo de debajo, la mano del atleta.
//
// La corona es la excepción: se arrastra sobre la corona que DeviceFrame ya
// dibuja en el bisel (portal al bisel), y la rueda del ratón sobre la esfera
// hace de corona, como en el simulador de Xcode.

import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { VOCABULARIO, fmtHaptico, type Emision } from './eventos';

export type Area = 'controles' | 'vivo' | 'musica';

const NOMBRE_AREA: Record<Area, string> = { controles: 'Controles', vivo: 'Vivo', musica: 'Ahora suena' };

export interface MandosProps {
  destino: HTMLElement;
  /** Pantalla completa: sin estudio alrededor, los mandos van fijos abajo. */
  suelto: boolean;
  area: Area;
  pagina: number;
  paginas: string[];
  muneca: 'arriba' | 'abajo';
  ultimo: Emision | null;
  onArea: (a: Area) => void;
  onCorona: (dir: 1 | -1) => void;
  onDobleToque: () => void;
  onAccion: () => void;
  onMuneca: () => void;
}

const S = {
  barra: {
    position: 'absolute',
    left: '50%',
    top: 'calc(50% + 152px)',
    transform: 'translateX(-50%)',
    width: 'min(560px, calc(100% - 24px))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    zIndex: 4,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  fila: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: {
    padding: '7px 11px',
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: '#d6d6d6',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  activo: { borderColor: 'rgba(240,106,42,0.7)', color: '#f5f3f0', background: 'rgba(240,106,42,0.12)' },
  lector: {
    fontSize: 12,
    color: '#9b9b9b',
    textAlign: 'center',
    lineHeight: 1.45,
    maxWidth: '100%',
  },
} satisfies Record<string, CSSProperties>;

export function Mandos(p: MandosProps) {
  const chip = (texto: string, f: () => void, activo = false, titulo?: string) => (
    <button type="button" title={titulo} onClick={f} style={{ ...S.chip, ...(activo ? S.activo : null) }}>
      {texto}
    </button>
  );
  const vibra = p.ultimo?.vibra ? VOCABULARIO[p.ultimo.vibra] : null;
  const barra = (
    <div style={p.suelto ? { ...S.barra, position: 'fixed', top: 'auto', bottom: 12, zIndex: 60 } : S.barra}>
      <div style={S.fila}>
        {chip('◀ Controles', () => p.onArea('controles'), p.area === 'controles')}
        {chip('Vivo', () => p.onArea('vivo'), p.area === 'vivo')}
        {chip('Ahora suena ▶', () => p.onArea('musica'), p.area === 'musica')}
        {chip('Corona ▲', () => p.onCorona(-1), false, 'Página anterior (o la rueda del ratón sobre la esfera)')}
        {chip('Corona ▼', () => p.onCorona(1), false, 'Página siguiente (o arrastra la corona del lateral)')}
      </div>
      <div style={S.fila}>
        {chip('Doble toque', p.onDobleToque, false, 'Series 9 / Ultra 2 en adelante')}
        {chip('Botón Acción', p.onAccion, false, 'Solo Ultra')}
        {chip(p.muneca === 'arriba' ? 'Bajar muñeca' : 'Subir muñeca', p.onMuneca, p.muneca === 'abajo', 'Abajo = Always-On')}
      </div>
      <div style={S.lector}>
        <span style={{ color: '#ececec' }}>
          {NOMBRE_AREA[p.area]}
          {p.area === 'vivo' ? ` · ${p.pagina + 1}/${p.paginas.length} ${p.paginas[p.pagina] ?? ''}` : ''}
          {p.muneca === 'abajo' ? ' · Always-On' : ''}
        </span>
        {p.ultimo ? (
          <>
            {' — '}
            {vibra ? `vibra ${fmtHaptico(vibra)}` : 'sin vibración'}
            {p.ultimo.voz ? ` · voz: «${p.ultimo.voz}»` : ''}
          </>
        ) : null}
      </div>
    </div>
  );
  return createPortal(barra, p.destino);
}

/**
 * LA CORONA, sobre la del bisel: un blanco invisible encima de la que dibuja
 * DeviceFrame. Arrastrar en vertical = girar; cada 18 px, un paso.
 */
export function CoronaBisel({ destino, onCorona }: { destino: HTMLElement; onCorona: (dir: 1 | -1) => void }) {
  const origen = useRef<number | null>(null);
  const abajo = (e: ReactPointerEvent<HTMLDivElement>) => {
    origen.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mueve = (e: ReactPointerEvent) => {
    if (origen.current == null) return;
    const dy = e.clientY - origen.current;
    if (Math.abs(dy) >= 18) {
      onCorona(dy > 0 ? 1 : -1);
      origen.current = e.clientY;
    }
  };
  const suelta = () => {
    origen.current = null;
  };
  return createPortal(
    <div
      role="slider"
      aria-label="Corona digital: arrastra en vertical"
      aria-valuenow={0}
      title="Corona digital — arrastra arriba o abajo"
      onPointerDown={abajo}
      onPointerMove={mueve}
      onPointerUp={suelta}
      onPointerCancel={suelta}
      onWheel={(e) => {
        e.stopPropagation();
        if (Math.abs(e.deltaY) > 4) onCorona(e.deltaY > 0 ? 1 : -1);
      }}
      style={{
        position: 'absolute',
        right: -12,
        top: 52,
        width: 22,
        height: 58,
        cursor: 'ns-resize',
        touchAction: 'none',
        borderRadius: 6,
        zIndex: 3,
      }}
    />,
    destino,
  );
}
