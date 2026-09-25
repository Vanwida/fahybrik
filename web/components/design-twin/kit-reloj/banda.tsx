'use client';

// LA BANDA DEL OBJETIVO — el calibre horizontal de P3: la banda del coach, tu
// marca encima, y fuera de ella ▲/▼ con su palabra. Sin cambiar de color (P6).

import type { CSSProperties } from 'react';
import type { BandaVista } from './lamina';
import { C, FILA, T } from './tokens';

/**
 * LA BANDA DEL OBJETIVO — el calibre horizontal. A la izquierda lo suave, a
 * la derecha lo fuerte. La banda del coach, y tu marca encima. Fuera de la
 * banda la marca pasa de raya a triángulo (▲ por encima, ▼ por debajo) y sale
 * la palabra; el color NO cambia (P6). A zona, se dibuja sobre el espectro
 * del coach con la zona objetivo encendida.
 */
export function BandaObjetivo({ banda }: { banda: BandaVista }) {
  const fuera = banda.veredicto != null && banda.veredicto !== 'dentro';
  const palabraVisible = banda.palabra && (fuera || !banda.zonas);
  const pista = 8;
  return (
    <div style={{ width: '100%', height: FILA.banda, flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 2px', lineHeight: 1 }}>
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2, whiteSpace: 'nowrap' }}>
          {banda.rotulo}
        </span>
        {palabraVisible && banda.palabra ? (
          <span
            style={{
              fontSize: T.nota.cuerpo,
              fontWeight: fuera ? 700 : T.nota.peso,
              color: fuera ? C.tinta : C.tinta2,
              whiteSpace: 'nowrap',
            }}
          >
            {banda.palabra.marca ? `${banda.palabra.marca} ` : ''}
            {banda.palabra.texto}
          </span>
        ) : null}
      </div>
      <div style={{ position: 'relative', height: 16, marginTop: 3 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: (16 - pista) / 2, height: pista, borderRadius: pista / 2, overflow: 'hidden', background: C.carril, display: 'flex', gap: banda.zonas ? 2 : 0 }}>
          {banda.zonas
            ? banda.zonas.colores.map((c, i) => {
                const z = i + 1;
                const enObjetivo = z >= banda.zonas!.objetivo[0] && z <= banda.zonas!.objetivo[1];
                return <span key={i} style={{ flex: 1, background: c, opacity: enObjetivo ? 1 : 0.26 }} />;
              })
            : null}
        </div>
        {!banda.zonas ? (
          <div
            style={{
              position: 'absolute',
              top: (16 - pista) / 2,
              height: pista,
              left: `${banda.desde * 100}%`,
              width: `${(banda.hasta - banda.desde) * 100}%`,
              background: '#6B6B70',
              borderRadius: 2,
            }}
          />
        ) : null}
        {banda.marca != null ? (
          <Marca x={banda.marca} fuera={banda.veredicto === 'dentro' ? null : banda.veredicto} />
        ) : null}
      </div>
    </div>
  );
}

function Marca({ x, fuera }: { x: number; fuera: 'por-encima' | 'por-debajo' | null }) {
  const pos: CSSProperties = {
    position: 'absolute',
    left: `${x * 100}%`,
    top: 0,
    transform: 'translateX(-50%)',
    transition: 'left 700ms ease-out',
  };
  if (!fuera) {
    return <span style={{ ...pos, width: 4, height: 16, borderRadius: 2, background: C.tinta, boxShadow: `0 0 0 1.5px ${C.fondo}` }} />;
  }
  const arriba = fuera === 'por-encima';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={pos} aria-hidden>
      <path d={arriba ? 'M8 1.5 15 14.5H1Z' : 'M8 14.5 1 1.5h14Z'} fill={C.tinta} stroke={C.fondo} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

