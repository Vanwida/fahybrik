'use client';

// LAS PIEZAS — los átomos del vivo del iPhone. Ninguna escribe un tamaño o un
// color que no salga de `tokens.ts`, y ninguna decide QUÉ se pinta: eso lo
// dicen `laminaDelPaso`, `heroeDeFamilia` y `metricasDelPaso` (kit-reloj).
//
//   LienzoContexto / useLienzo   el ancho real del lienzo (390–430) y si es horizontal
//   Numeral                       toda cifra del vivo (UN token)
//   Etiqueta                      15 pt en tinta2, el suelo
//   Boton / BotonRedondo          ≥ 44 pt; naranja SOLO si es la acción primaria
//   Chip                          un enlace (reloj, GPS, máquina, pulso): forma + palabra, sin color nuevo
//   Icono                         trazos propios, sin librería
//   Corazon, ChipZona             los de la muñeca (mismo glifo, misma zona)

import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CI, LIENZO, RADIO, TI, estiloNumeral, type Peso } from './tokens';

export { ChipZona, Corazon } from '../kit-reloj/piezas';

// ---------------------------------------------------------------------------
// El lienzo
// ---------------------------------------------------------------------------

export interface Lienzo {
  ancho: number;
  alto: number;
  horizontal: boolean;
}

export const LienzoContexto = createContext<Lienzo>({ ancho: LIENZO.ancho, alto: LIENZO.alto, horizontal: false });

export function useLienzo(): Lienzo {
  return useContext(LienzoContexto);
}

/**
 * Mide el lienzo de verdad: el marco del doble lo pinta a 402 pt, la pantalla
 * completa a lo que mida el móvil (390 o 430). Determinista en servidor
 * (el ancho del marco) y ajustado en el cliente antes de pintar.
 */
export function useMedidaLienzo(): { ref: (el: HTMLDivElement | null) => void; lienzo: Lienzo } {
  const [lienzo, setLienzo] = useState<Lienzo>({ ancho: LIENZO.ancho, alto: LIENZO.alto, horizontal: false });
  const el = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const nodo = el.current;
    if (!nodo) return;
    const medir = () => {
      const r = nodo.getBoundingClientRect();
      // El marco escala el lienzo con `transform`: se mide en pt lógicos, no en px de pantalla.
      const ancho = nodo.clientWidth || r.width;
      const alto = nodo.clientHeight || r.height;
      if (ancho > 0 && alto > 0) setLienzo({ ancho, alto, horizontal: ancho > alto });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, []);
  return {
    ref: (n) => {
      el.current = n;
    },
    lienzo,
  };
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Toda cifra del vivo. `tono` en tinta por defecto; nunca naranja (el naranja es acción). */
export function Numeral({ texto, cuerpo, peso, tono = CI.tinta, estilo }: { texto: string; cuerpo: number; peso?: Peso; tono?: string; estilo?: CSSProperties }) {
  return <span style={{ ...estiloNumeral(cuerpo, peso), color: tono, whiteSpace: 'nowrap', ...estilo }}>{texto}</span>;
}

/** Etiqueta o unidad: 15 pt semibold en tinta2. El suelo. */
export function Etiqueta({ children, tono = CI.tinta2, estilo }: { children: ReactNode; tono?: string; estilo?: CSSProperties }) {
  return (
    <span style={{ fontSize: TI.etiqueta.cuerpo, fontWeight: TI.etiqueta.peso, color: tono, lineHeight: 1.2, whiteSpace: 'nowrap', ...estilo }}>
      {children}
    </span>
  );
}

/** Una línea de cuerpo (17 pt): «Luego ·», «Viene:», la hoja. Puede partirse en dos líneas; nunca se trunca. */
export function Cuerpo({ children, tono = CI.tinta, peso = TI.cuerpo.peso, estilo }: { children: ReactNode; tono?: string; peso?: Peso; estilo?: CSSProperties }) {
  return (
    <span style={{ fontSize: TI.cuerpo.cuerpo, fontWeight: peso, color: tono, lineHeight: 1.25, textWrap: 'balance', ...estilo }}>
      {children}
    </span>
  );
}

/** La nota de honestidad: 15 pt en tinta2, centrada, en dos líneas si hace falta. */
export function Nota({ children, tono = CI.tinta2 }: { children: ReactNode; tono?: string }) {
  return (
    <span style={{ fontSize: TI.nota.cuerpo, fontWeight: TI.nota.peso, color: tono, lineHeight: 1.25, textAlign: 'center', textWrap: 'balance' }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

export type VarianteBoton = 'primaria' | 'superficie' | 'sutil';

const fondoBoton = (v: VarianteBoton, desactivado: boolean) =>
  desactivado ? CI.desactivadoFondo : v === 'primaria' ? CI.accion : v === 'superficie' ? CI.superficie2 : 'transparent';
const tintaBoton = (v: VarianteBoton, desactivado: boolean) => (desactivado ? CI.desactivadoTinta : v === 'primaria' ? CI.sobreAccion : CI.tinta);

/**
 * Un botón de la franja (64 pt) o menor (44 pt). Naranja SOLO si es la acción
 * primaria del momento; lo demás, superficie. Desactivado = superficie y
 * tinta2, y se dice por qué en la etiqueta («Empezar · sin GPS»).
 */
export function Boton({
  etiqueta,
  onPulsa,
  variante = 'superficie',
  alto = TI.boton.alto,
  desactivado = false,
  icono,
  ancho,
  estilo,
}: {
  etiqueta: string;
  onPulsa: () => void;
  variante?: VarianteBoton;
  alto?: number;
  desactivado?: boolean;
  icono?: ReactNode;
  ancho?: number | string;
  estilo?: CSSProperties;
}) {
  const grande = alto >= TI.boton.alto;
  return (
    <button
      type="button"
      disabled={desactivado}
      aria-disabled={desactivado}
      onClick={(e) => {
        e.stopPropagation();
        if (!desactivado) onPulsa();
      }}
      style={{
        height: alto,
        minWidth: alto,
        width: ancho ?? '100%',
        padding: `0 ${grande ? 22 : 16}px`,
        border: 0,
        borderRadius: RADIO.boton,
        background: fondoBoton(variante, desactivado),
        color: tintaBoton(variante, desactivado),
        fontFamily: 'inherit',
        fontSize: grande ? TI.boton.cuerpo : TI.botonMenor.cuerpo,
        fontWeight: grande ? TI.boton.peso : TI.botonMenor.peso,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        cursor: desactivado ? 'default' : 'pointer',
        transition: 'background-color 160ms ease, transform 80ms ease',
        ...estilo,
      }}
    >
      {icono}
      {etiqueta}
    </button>
  );
}

/** Un botón redondo de la franja (Pausa, Terminar): 64 × 64, icono de 28 pt y su nombre para el lector. */
export function BotonRedondo({
  nombre,
  icono,
  onPulsa,
  variante = 'superficie',
  talla = TI.boton.alto,
  children,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: {
  nombre: string;
  icono: ReactNode;
  onPulsa?: () => void;
  variante?: VarianteBoton;
  talla?: number;
  children?: ReactNode;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={nombre}
      title={nombre}
      onClick={(e) => {
        e.stopPropagation();
        onPulsa?.();
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      style={{
        position: 'relative',
        width: talla,
        height: talla,
        flex: '0 0 auto',
        border: 0,
        borderRadius: '50%',
        background: fondoBoton(variante, false),
        color: tintaBoton(variante, false),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {icono}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chips de enlace (I10): forma + palabra, nunca un color nuevo
// ---------------------------------------------------------------------------

export type EstadoChip = 'ok' | 'buscando' | 'perdido' | 'apagado';

/**
 * Un chip de enlace. `ok`: relleno en superficie2 con la tinta. `buscando`:
 * borde y punto que late. `perdido`: borde y la palabra «sin señal».
 * `apagado`: borde, en tinta2, con lo que hay que hacer («Conectar»).
 */
export function Chip({ texto, estado, icono, onPulsa }: { texto: string; estado: EstadoChip; icono: ReactNode; onPulsa?: () => void }) {
  const relleno = estado === 'ok';
  const tono = estado === 'apagado' ? CI.tinta2 : CI.tinta;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPulsa?.();
      }}
      aria-label={texto}
      style={{
        height: TI.chip.alto,
        padding: '0 10px 0 8px',
        border: relleno ? 0 : `1.5px solid ${CI.carril}`,
        borderRadius: RADIO.chip,
        background: relleno ? CI.superficie2 : 'transparent',
        color: tono,
        fontFamily: 'inherit',
        fontSize: TI.chip.cuerpo,
        fontWeight: TI.chip.peso,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      <span style={{ display: 'inline-flex', opacity: estado === 'apagado' ? 0.7 : 1 }}>{icono}</span>
      {estado === 'buscando' ? <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: CI.tinta, animation: 'iphone-late 1.1s ease-in-out infinite' }} /> : null}
      {texto}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Iconos — trazos propios (el lienzo del vivo no carga librerías)
// ---------------------------------------------------------------------------

export type NombreIcono = 'pausa' | 'reanudar' | 'terminar' | 'reloj' | 'gps' | 'maquina' | 'pulso' | 'mapa' | 'mas' | 'menos' | 'check' | 'estructura';

export function Icono({ nombre, talla = 24, tono = 'currentColor' }: { nombre: NombreIcono; talla?: number; tono?: string }) {
  const p = { fill: 'none', stroke: tono, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const svg = (hijo: ReactNode) => (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto', display: 'block' }}>
      {hijo}
    </svg>
  );
  switch (nombre) {
    case 'pausa':
      return svg(
        <>
          <rect x="6" y="4.5" width="4" height="15" rx="1.3" fill={tono} />
          <rect x="14" y="4.5" width="4" height="15" rx="1.3" fill={tono} />
        </>,
      );
    case 'reanudar':
      return svg(<path d="M7.5 4.5v15l12-7.5Z" fill={tono} />);
    case 'terminar':
      return svg(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...p} strokeWidth={2.6} />);
    case 'reloj':
      return svg(
        <>
          <rect x="6.5" y="6" width="11" height="12" rx="3.5" {...p} />
          <path d="M9 6V3.5h6V6M9 18v2.5h6V18" {...p} />
        </>,
      );
    case 'gps':
      return svg(<path d="M20 4 4 11l7.5 1.5L13 20Z" {...p} />);
    case 'maquina':
      return svg(<path d="M3.5 12c2.5-3 4.5-3 7 0s4.5 3 7 0 3-3 3-3M3.5 17c2.5-3 4.5-3 7 0s4.5 3 7 0" {...p} />);
    case 'pulso':
      return svg(
        <path d="M12 20.5s-7.5-4.6-9.5-9.2C1 7.9 3.1 4.3 6.8 4.3c2 0 3.5 1.1 4.2 2.6h2c.7-1.5 2.2-2.6 4.2-2.6 3.7 0 5.8 3.6 4.3 7-2 4.6-9.5 9.2-9.5 9.2Z" fill={tono} />,
      );
    case 'mapa':
      return svg(<path d="M3.5 6.5v13l5.5-2.5 6 2.5 5.5-2.5v-13L15 6.5 9 4Zm5.5-2.5v13M15 6.5v13" {...p} />);
    case 'mas':
      return svg(<path d="M12 5v14M5 12h14" {...p} strokeWidth={2.8} />);
    case 'menos':
      return svg(<path d="M5 12h14" {...p} strokeWidth={2.8} />);
    case 'check':
      return svg(<path d="M5 12.5 9.5 17 19 7.5" {...p} strokeWidth={2.8} />);
    case 'estructura':
      return svg(<path d="M4 7h16M4 12h10M4 17h13" {...p} />);
  }
}

// ---------------------------------------------------------------------------
// Superficie
// ---------------------------------------------------------------------------

/** Una superficie sobre el negro (celda, tarjeta de anotación). */
export function Superficie({ children, estilo, padding = 14 }: { children: ReactNode; estilo?: CSSProperties; padding?: number }) {
  return (
    <div style={{ background: CI.celda, borderRadius: RADIO.superficie, padding, boxSizing: 'border-box', ...estilo }}>{children}</div>
  );
}

/** Las animaciones del kit, una vez en el lienzo. */
export const KEYFRAMES_IPHONE = `
@keyframes iphone-late { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes iphone-entra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes iphone-sube { from { transform: translateY(100%); } to { transform: none; } }
@keyframes iphone-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes iphone-drena { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes iphone-destello { from { opacity: 0.2; } to { opacity: 0; } }
`;
