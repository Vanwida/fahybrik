'use client';

// Las piezas del rechazo que se repiten en más de un sitio de esta pantalla: el
// aviso «Guardado en tu móvil» (al cerrar el resumen y al abrir la fila del
// historial) y los dos glifos que faltan en el kit.
//
// LA REGLA DE TONO, y es la decisión entera: el aviso dice dónde ESTÁ tu
// entreno, no qué falló. Por eso no lleva ni rojo ni ámbar ni triángulo — lo
// único teñido es el check dentro del móvil, que es el hecho que importa (está a
// salvo). Un aviso de error aquí sería mentir en la otra dirección: el atleta no
// ha perdido nada y no tiene nada que arreglar.

import type { CSSProperties } from 'react';
import { IconWarning, RAD, SP } from '../../kit';

// ---------------------------------------------------------------------------
// Glifos — equivalentes a SF Symbols que el kit no tiene
// ---------------------------------------------------------------------------

/**
 * `iphone` con un check dentro: «guardado en este aparato». El check va en
 * `--twin-ok` porque es lo único de la pieza que afirma algo, y lo que afirma es
 * bueno. El contorno, en la tinta del texto: el móvil es el sitio, no el suceso.
 */
export function IconMovilGuardado({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <rect x="6" y="2" width="12" height="20" rx="3.2" fill="none" stroke="var(--twin-fg)" strokeWidth="1.7" />
      <path d="M10.4 4.6h3.2" stroke="var(--twin-fg)" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="m9.2 12.6 2 2 3.8-4.2"
        fill="none"
        stroke="var(--twin-ok)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// El aviso — «Guardado en tu móvil»
// ---------------------------------------------------------------------------

/**
 * El copy es el de Alex (25-09), palabra por palabra: el título dice dónde está,
 * la línea dice qué pasa y que no hay que hacer nada. Sin «error», sin «fallo»,
 * sin un REINTENTAR que no puede funcionar — reintentar un 4xx repite el mismo
 * envío contra el mismo rechazo.
 *
 * Es una superficie en reposo (la de la tarjeta, sin tinte): se lee como una
 * nota del registro, no como una alerta encima de él.
 */
export function AvisoGuardado({ style }: { style?: CSSProperties }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: SP.m,
        padding: `${SP.m + 2}px ${SP.l}px`,
        borderRadius: RAD.l,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        ...style,
      }}
    >
      <span style={{ paddingTop: 1 }}>
        <IconMovilGuardado />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ font: '650 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Guardado en tu móvil</span>
        <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          No se ha podido subir. Lo estamos revisando; no tienes que hacer nada.
        </span>
      </span>
    </div>
  );
}

/**
 * La marca de la fila del historial. Es un chip MÁS del vocabulario que la fila
 * ya tiene (`subChips` de HistoryView.swift: «RPE 7», «en pareja», «ruta» —
 * icono de 8 + texto de 10, un tinte), no una insignia nueva: el aviso pesa lo
 * mismo que decir que corriste con ruta. En `muted`, no en ámbar ni en rojo:
 * el triángulo del kit (`IconWarning`) avisa de que algo es distinto, y el
 * color dice que no es urgente.
 */
export function ChipSinSubir() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--twin-muted)' }}>
      <IconWarning size={9} />
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)' }}>Sin subir</span>
    </span>
  );
}
