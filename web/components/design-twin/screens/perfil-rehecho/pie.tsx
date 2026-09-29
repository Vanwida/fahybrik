'use client';

// EL PIE — cerrar sesión y la versión.
//
// «Cerrar sesión» pesa lo mínimo: sin borde, sin fondo, solo texto (Swift lo pinta
// con un contorno rojo de ancho completo, y eso lo convierte en una acción que
// compite con las cifras). El peligro va en el TEXTO y en nada más; sigue siendo
// un objetivo de 48 pt. Como en Swift, cierra al momento, sin «¿seguro?».
//
// La versión lleva el gesto escondido: siete toques seguidos abren el
// «Diagnóstico del reloj» (DECISIONS: no es producto, no tiene espejo). No se
// insinúa que existe: la versión se lee como una versión.

import { useRef } from 'react';
import { fuente, TAM, TOQUE } from '../../kit-dia/tokens';

/** Toques seguidos que abren el diagnóstico (`onTapGesture(count: 7)` en ProfileView). */
const TOQUES_DIAGNOSTICO = 7;
/** Tiempo máximo entre dos toques para que cuenten como seguidos (el multitoque de iOS ronda 0,3 s). */
const ENTRE_TOQUES_MS = 700;

export function Pie({
  version,
  onLog,
  onDiagnostico,
}: {
  version: string | null;
  onLog: (linea: string) => void;
  onDiagnostico: () => void;
}) {
  const cuenta = useRef({ n: 0, t: 0 });
  const toca = () => {
    const ahora = Date.now();
    cuenta.current.n = ahora - cuenta.current.t > ENTRE_TOQUES_MS ? 1 : cuenta.current.n + 1;
    cuenta.current.t = ahora;
    if (cuenta.current.n >= TOQUES_DIAGNOSTICO) {
      cuenta.current.n = 0;
      onLog('Versión ×7 → pantalla escondida «Diagnóstico del reloj»');
      onDiagnostico();
    }
  };
  return (
    <footer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        className="hd-toque"
        onClick={() => onLog('Cerrar sesión → volvería a la pantalla de acceso')}
        style={{
          width: 'auto',
          minHeight: TOQUE,
          padding: '0 28px',
          display: 'inline-flex',
          alignItems: 'center',
          ...fuente(700, TAM.cuerpo, 1.2),
          color: 'var(--twin-danger)',
        }}
      >
        Cerrar sesión
      </button>
      {version ? (
        <button
          type="button"
          className="hd-toque"
          onClick={toca}
          aria-label={version}
          style={{
            width: 'auto',
            minHeight: TOQUE,
            padding: '0 24px',
            display: 'inline-flex',
            alignItems: 'center',
            ...fuente(500, TAM.suelo, 1.2),
            color: 'var(--twin-muted)',
          }}
        >
          {version}
        </button>
      ) : null}
    </footer>
  );
}
