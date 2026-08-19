'use client';

// (5) Bloqueo por sudor y agua — y cómo se sale.
//
// No existe: cero referencias a Water Lock en todo el proyecto. Con sudor,
// lluvia o un cubo de agua, cualquier roce avanza el bloque o marca una serie
// sin querer. El lienzo bloqueado ignora el toque a propósito — es la única
// pantalla del kit donde tocar NO hace nada — y se sale girando la corona,
// como en el resto de watchOS: el gesto se simula arrastrando verticalmente
// el disco de la derecha, en el mismo sitio donde `DeviceFrame` dibuja la
// corona de verdad.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { W } from '../watch-live/theme';
import { Contexto, Cuerpo, Lienzo } from './atomos';

const UMBRAL_GIRO = 70;

type Estado = 'bloqueado' | 'girando' | 'listo';

export function Agua({ onLog }: { onLog: (linea: string) => void }) {
  const [estado, setEstado] = useState<Estado>('bloqueado');
  const [giro, setGiro] = useState(0);
  const acumulado = useRef(0);
  const origen = useRef<number | null>(null);

  const abajo = (e: ReactPointerEvent) => {
    if (estado !== 'bloqueado') return;
    origen.current = e.clientY;
  };
  const mueve = (e: ReactPointerEvent) => {
    if (origen.current == null || estado !== 'bloqueado') return;
    const dy = origen.current - e.clientY;
    origen.current = e.clientY;
    acumulado.current = Math.min(UMBRAL_GIRO, acumulado.current + Math.abs(dy));
    setGiro((g) => g + dy);
    if (acumulado.current >= UMBRAL_GIRO) {
      origen.current = null;
      setEstado('girando');
      onLog('Corona girada → expulsando agua');
      setTimeout(() => {
        setEstado('listo');
        onLog('Desbloqueado — háptico de confirmación');
      }, 850);
    }
  };
  const suelta = () => {
    origen.current = null;
  };

  if (estado === 'listo') {
    return (
      <Lienzo>
        <span style={{ flex: 1 }} />
        <Contexto escala="nuevo">Desbloqueado</Contexto>
        <span style={{ marginTop: 10 }}>
          <CheckGlyph />
        </span>
        <span style={{ flex: 1 }} />
      </Lienzo>
    );
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={abajo}
      onPointerMove={mueve}
      onPointerUp={suelta}
      onPointerLeave={suelta}
    >
      <Lienzo>
        <span style={{ flex: 1 }} />
        <CandadoGlyph animando={estado === 'girando'} />
        <Contexto escala="nuevo">{estado === 'girando' ? 'Expulsando' : 'Bloqueado'}</Contexto>
        <span style={{ marginTop: 6 }}>
          <Cuerpo escala="nuevo">
            {estado === 'girando' ? 'Un momento…' : 'Nada toca. Gira la corona para salir.'}
          </Cuerpo>
        </span>
        <span style={{ flex: 1 }} />
      </Lienzo>
      {/* La corona simulada: el mismo sitio donde DeviceFrame dibuja la de
          verdad, por fuera del lienzo lógico (border derecho). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: `translateY(-50%) rotate(${giro * 1.4}deg)`,
          width: 30,
          height: 30,
          borderRadius: '50%',
          border: `2px solid ${estado === 'girando' ? W.orangeSoft : 'rgba(255,255,255,0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: estado === 'girando' ? 'border-color 200ms ease' : undefined,
        }}
      >
        <span style={{ width: 2, height: 12, background: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
      </div>
    </div>
  );
}

function CandadoGlyph({ animando }: { animando: boolean }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden style={{ opacity: animando ? 0.6 : 1 }}>
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="none" stroke={W.ink} strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke={W.ink} strokeWidth="1.8" />
      <circle cx="12" cy="15" r="1.6" fill={W.ink} />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={W.zoneGreen} strokeWidth="1.8" />
      <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={W.zoneGreen} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
