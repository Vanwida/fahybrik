'use client';

// LA ESFERA Y EL SMART STACK — lo de hoy a un toque (P13; mínimo de mercado:
// empezar desde la esfera en ≤ 2 toques). Hoy no hay complicación ni widget:
// para entrenar hay que abrir la app y bajar hasta Empezar.
//
//   Esfera      Modular: la complicación grande con lo de hoy. Tocarla abre
//               el brief (toque 1); «Empezar» es el toque 2.
//   Smart Stack girando la corona desde la esfera: el widget de hoy arriba.
//
// La tira de colores es el aro de la sesión desenrollado (mismo dato, mismo
// color: naranja = el trabajo de la parte principal, gris = lo demás): la
// forma de la sesión se reconoce antes de leerla.

import { useEffect, useState } from 'react';
import { AOD, C, Corazon, T, arcosDePlan, type PasoBase } from '../../kit-reloj';
import { hoyDe } from './calculo';

// ---------------------------------------------------------------------------
// La tira — el aro desenrollado
// ---------------------------------------------------------------------------

export function Tira({ pasos, alto = 5 }: { pasos: PasoBase[]; alto?: number }) {
  const arcos = arcosDePlan(pasos);
  return (
    <div aria-hidden style={{ display: 'flex', gap: 1.5, width: '100%', height: alto }}>
      {arcos.map((a, i) => (
        <span
          key={i}
          style={{
            flex: `${Math.max(1, a.peso)} 0 0`,
            minWidth: 1,
            borderRadius: alto / 2,
            background: a.trabajo ? C.accion : C.tinta2,
            opacity: a.trabajo ? 1 : 0.38,
          }}
        />
      ))}
    </div>
  );
}

/** Lo que dice la complicación / el widget: hoy, hoy de descanso, o hoy ya hecho. */
export type Hoy =
  | { tipo: 'sesion'; pasos: PasoBase[] }
  | { tipo: 'descanso'; manana: PasoBase[] | null }
  | { tipo: 'hecha'; pasos: PasoBase[]; titulo: string; sub: string };

function Lineas({ hoy }: { hoy: Hoy }) {
  const cabeza = { fontSize: T.nota.cuerpo, fontWeight: 600, color: C.tinta2, lineHeight: 1.15 } as const;
  const titulo = { fontSize: T.tercero.cuerpo, fontWeight: 600, color: C.tinta, lineHeight: 1.1, whiteSpace: 'nowrap' } as const;
  const sub = { fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, lineHeight: 1.15, whiteSpace: 'nowrap' } as const;
  if (hoy.tipo === 'descanso') {
    const m = hoy.manana ? hoyDe(hoy.manana) : null;
    return (
      <>
        <span style={cabeza}>Hoy</span>
        <span style={titulo}>Descanso</span>
        {m ? <span style={sub}>{`Mañana · ${m.titulo}`}</span> : null}
      </>
    );
  }
  if (hoy.tipo === 'hecha') {
    return (
      <>
        <span style={cabeza}>Hoy · hecha</span>
        <span style={titulo}>{hoy.titulo}</span>
        <span style={sub}>{hoy.sub}</span>
        <div style={{ marginTop: 5 }}>
          <Tira pasos={hoy.pasos} />
        </div>
      </>
    );
  }
  const h = hoyDe(hoy.pasos);
  return (
    <>
      <span style={cabeza}>{`Hoy · ${h.dur}`}</span>
      <span style={titulo}>{h.titulo}</span>
      {h.sub ? <span style={sub}>{h.sub}</span> : null}
      <div style={{ marginTop: 5 }}>
        <Tira pasos={hoy.pasos} />
      </div>
    </>
  );
}

/** Un toque visible: la pieza se hunde un instante y luego abre. */
function useToque(onAbrir: () => void, tocarEn?: number) {
  const [pulsado, setPulsado] = useState(false);
  const tocar = () => {
    setPulsado(true);
    setTimeout(onAbrir, 220);
  };
  useEffect(() => {
    if (tocarEn == null) return;
    const t = setTimeout(() => {
      setPulsado(true);
      setTimeout(onAbrir, 220);
    }, tocarEn);
    return () => clearTimeout(t);
    // El guion es fijo por montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { pulsado, tocar };
}

const boton = {
  border: 0,
  padding: 0,
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 2,
  transition: 'transform 140ms ease, background-color 140ms ease',
} as const;

// ---------------------------------------------------------------------------
// La esfera (Modular)
// ---------------------------------------------------------------------------

export function Esfera({ hoy, hora, onAbrir, tocarEn }: { hoy: Hoy; hora: string; onAbrir: () => void; tocarEn?: number }) {
  const { pulsado, tocar } = useToque(onAbrir, tocarEn);
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '14px 16px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 8px 0 10px' }}>
        <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>vie 25</span>
        <span style={{ fontSize: T.segundo.cuerpo, fontWeight: 600, letterSpacing: -0.5 }}>{hora}</span>
      </div>
      <button
        type="button"
        aria-label="Complicación · lo de hoy"
        onClick={(e) => {
          e.stopPropagation();
          tocar();
        }}
        style={{
          ...boton,
          marginTop: 18,
          padding: '8px 10px 10px',
          borderRadius: 16,
          background: pulsado ? C.superficie2 : 'transparent',
          transform: pulsado ? 'scale(0.96)' : 'none',
        }}
      >
        <Lineas hoy={hoy} />
      </button>
      <div style={{ flex: 1 }} />
      <MiniComplicaciones />
    </div>
  );
}

/** Las tres pequeñas de abajo: del sistema, en gris (no son nuestras). */
function MiniComplicaciones() {
  const redonda = { width: 40, height: 40, borderRadius: 20, background: C.superficie, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: T.nota.cuerpo, fontWeight: 600, color: C.tinta2 } as const;
  return (
    <div aria-hidden style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
      <span style={redonda}>18°</span>
      <span style={redonda}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke={C.carril} strokeWidth="3" />
          <circle cx="12" cy="12" r="9" fill="none" stroke={C.tinta2} strokeWidth="3" strokeDasharray="40 57" strokeLinecap="round" transform="rotate(-90 12 12)" />
        </svg>
      </span>
      <span style={{ ...redonda, gap: 3 }}>
        <Corazon talla={11} />
        58
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El Smart Stack
// ---------------------------------------------------------------------------

export function SmartStack({ hoy, hora, onAbrir, tocarEn }: { hoy: Hoy; hora: string; onAbrir: () => void; tocarEn?: number }) {
  const { pulsado, tocar } = useToque(onAbrir, tocarEn);
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '10px 10px 0', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ alignSelf: 'flex-end', marginRight: 22, fontSize: T.contexto.cuerpo, fontWeight: 600 }}>{hora}</span>
      <button
        type="button"
        aria-label="Widget · lo de hoy"
        onClick={(e) => {
          e.stopPropagation();
          tocar();
        }}
        style={{
          ...boton,
          padding: '11px 13px 13px',
          borderRadius: 24,
          background: pulsado ? C.carril : C.superficie2,
          transform: pulsado ? 'scale(0.97)' : 'none',
        }}
      >
        <Lineas hoy={hoy} />
      </button>
      {/* El siguiente widget del sistema asoma por debajo: es una pila. */}
      <div
        aria-hidden
        style={{ borderRadius: 24, background: C.superficie, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 2, opacity: AOD.tinta }}
      >
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: 600, color: C.tinta2 }}>Tiempo</span>
        <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>18° · despejado</span>
      </div>
    </div>
  );
}
