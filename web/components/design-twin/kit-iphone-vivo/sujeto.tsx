'use client';

// EL SUJETO, LA BANDA Y EL TRABAJO (I5.2–I5.4) — lo que se mira.
//
//   Sujeto         el héroe a 72–176 pt, ajustado al ancho útil y al alto de SU
//                  banda, que es FIJA (§10.3): el centro óptico cae a la misma
//                  altura en todas las familias. Su etiqueta («quedan», «lo
//                  dices tú», «total») va encima, a 17 pt; la unidad, pegada.
//   BandaObjetivo  el calibre del objetivo (P3): la banda del coach, tu marca
//                  encima, ▲▼ y la palabra fuera. A zona, sobre el espectro.
//   Trabajo        lo que falta del paso y la dosis, a 40 pt y en tinta
//                  (§10.6: lo que de verdad haces no va en gris).
//   CuentaAtras    LA cuenta atrás: una para todas las familias (3-2-1 y GO).
//
// Qué se pinta lo deciden `heroeDeFamilia`, `laminaDelPaso` y `trabajoDe`
// (kit-reloj). Aquí solo se decide cómo.

import type { CSSProperties } from 'react';
import type { BandaVista, HeroeVista } from '../kit-reloj/lamina';
import type { PasoBase } from '../kit-reloj/paso';
import { contextoDe, fmtObjetivo, principal } from '../kit-reloj/reglas';
import { Etiqueta, Numeral, Nota, useLienzo } from './piezas';
import { ALTO, CI, MARGEN, TI, anchoUtil, estiloNumeral, tallaHeroe } from './tokens';

// ---------------------------------------------------------------------------
// El sujeto
// ---------------------------------------------------------------------------

/**
 * EL NÚMERO GRANDE. Fijo en alto (`ALTO.sujeto`), centrado: no baila entre
 * familias. `nota` es la honestidad bajo el número («sin señal del remo»),
 * que ocupa su fila dentro de la banda sin moverlo.
 */
export function Sujeto({ heroe, nota, alto = ALTO.sujeto, ancho }: { heroe: HeroeVista; nota?: string | null; alto?: number; ancho?: number }) {
  const lienzo = useLienzo();
  const util = ancho ?? anchoUtil(lienzo.ancho);
  const etiqueta = heroe.etiqueta ?? (heroe.zona ? `Z${heroe.zona.n}` : null);
  const altoNumeral = alto - TI.etiquetaSujeto.alto - (nota ? 24 : 0) - 16;
  const talla = tallaHeroe(heroe.texto, heroe.unidad, util, altoNumeral, TI.sujeto);
  return (
    <div
      style={{
        height: alto,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `0 ${MARGEN}px`,
        boxSizing: 'border-box',
        gap: 4,
      }}
    >
      <span style={{ height: TI.etiquetaSujeto.alto, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {etiqueta ? (
          <span style={{ fontSize: TI.etiquetaSujeto.cuerpo, fontWeight: TI.etiquetaSujeto.peso, color: heroe.zona ? heroe.zona.color : CI.tinta2, lineHeight: 1 }}>
            {etiqueta}
          </span>
        ) : null}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
        <Numeral texto={heroe.texto} cuerpo={talla.cuerpo} estilo={{ transition: 'font-size 240ms ease-out' }} />
        {heroe.unidad ? (
          <span style={{ marginLeft: 6, fontSize: Math.max(TI.suelo, talla.cuerpoUnidad), fontWeight: 600, color: CI.tinta2, lineHeight: 1 }}>{heroe.unidad}</span>
        ) : null}
      </span>
      {nota ? (
        <span style={{ height: 24, display: 'inline-flex', alignItems: 'center' }}>
          <Nota>{nota}</Nota>
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La banda del objetivo
// ---------------------------------------------------------------------------

/**
 * LA BANDA DEL OBJETIVO. A la izquierda lo suave, a la derecha lo fuerte. La
 * banda del coach y tu marca. Fuera, la marca pasa de raya a triángulo y la
 * palabra sale en negrita («▲ rápido»); el color NO cambia (I8). A zona, el
 * espectro del coach con la zona objetivo encendida. Sin objetivo, no hay
 * banda (el pintor no la monta).
 */
export function BandaObjetivo({ banda }: { banda: BandaVista }) {
  const fuera = banda.veredicto != null && banda.veredicto !== 'dentro';
  const palabra = banda.palabra;
  const pista = TI.banda.pista;
  return (
    <div style={{ height: ALTO.banda, flex: '0 0 auto', padding: `0 ${MARGEN}px`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', lineHeight: 1 }}>
        <Etiqueta>{banda.rotulo}</Etiqueta>
        {palabra ? (
          <span style={{ fontSize: TI.banda.palabra, fontWeight: fuera ? 700 : 600, color: fuera ? CI.tinta : CI.tinta2, whiteSpace: 'nowrap' }}>
            {palabra.marca ? `${palabra.marca} ` : ''}
            {palabra.texto}
          </span>
        ) : (
          <Etiqueta>sin lectura</Etiqueta>
        )}
      </div>
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: (18 - pista) / 2, height: pista, borderRadius: pista / 2, overflow: 'hidden', background: CI.carril, display: 'flex', gap: banda.zonas ? 2 : 0 }}>
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
              top: (18 - pista) / 2,
              height: pista,
              left: `${banda.desde * 100}%`,
              width: `${(banda.hasta - banda.desde) * 100}%`,
              background: CI.tinta2,
              borderRadius: 3,
            }}
          />
        ) : null}
        {banda.marca != null ? <Marca x={banda.marca} fuera={banda.veredicto === 'dentro' ? null : banda.veredicto} /> : null}
      </div>
    </div>
  );
}

function Marca({ x, fuera }: { x: number; fuera: 'por-encima' | 'por-debajo' | null }) {
  const pos: CSSProperties = { position: 'absolute', left: `${x * 100}%`, top: 0, transform: 'translateX(-50%)', transition: 'left 700ms ease-out' };
  if (!fuera) return <span style={{ ...pos, width: 5, height: 18, borderRadius: 2.5, background: CI.tinta, boxShadow: `0 0 0 2px ${CI.fondo}` }} />;
  const arriba = fuera === 'por-encima';
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" style={pos} aria-hidden>
      <path d={arriba ? 'M8 1.5 15 14.5H1Z' : 'M8 14.5 1 1.5h14Z'} fill={CI.tinta} stroke={CI.fondo} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// El trabajo
// ---------------------------------------------------------------------------

export interface TrabajoVista {
  etiqueta: string;
  valor: string;
  unidad?: string;
  /** Un valor que no es cifra (la dosis de fuerza «5 × 100 kg · RIR 2»): en texto, sin numeral. */
  texto?: boolean;
}

/** LO QUE DE VERDAD HACES (§10.6): a 40 pt y en tinta, nunca en gris. `extra`: «+30 s» en el descanso. */
export function Trabajo({ trabajo, extra }: { trabajo: TrabajoVista; extra?: React.ReactNode }) {
  return (
    <div style={{ minHeight: ALTO.trabajo, flex: '0 0 auto', padding: `0 ${MARGEN}px`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <Etiqueta>{trabajo.etiqueta}</Etiqueta>
        {trabajo.texto ? (
          <span style={{ fontSize: TI.datoTexto.cuerpo + 4, fontWeight: 700, color: CI.tinta, lineHeight: 1.1, textWrap: 'balance' }}>{trabajo.valor}</span>
        ) : (
          <Numeral texto={trabajo.valor} cuerpo={TI.trabajo.cuerpo} />
        )}
        {trabajo.unidad ? <Etiqueta>{trabajo.unidad}</Etiqueta> : null}
      </span>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA cuenta atrás (una para todas las familias)
// ---------------------------------------------------------------------------

/**
 * 3-2-1 y GO a pantalla completa antes de un paso de trabajo. Arriba, a qué
 * entras (la posición y el nombre); en el centro el número; debajo, contra
 * qué. `n = 0` es el GO. Es LA cuenta atrás del vivo: ninguna familia
 * dibuja otra.
 */
export function CuentaAtras({ n, paso }: { n: number; paso: PasoBase }) {
  const contexto = contextoDe(paso);
  const o = principal(paso);
  const obj = o ? fmtObjetivo(o, paso.maquina) : null;
  const nombre = paso.nombre && !contexto.some((c) => c.includes(paso.nombre!)) ? paso.nombre : null;
  const contra = [nombre, obj && !contexto.includes(obj) ? `a ${obj}` : null].filter(Boolean).join(' · ') || null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: CI.fondo,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: `0 ${MARGEN}px`,
        animation: 'iphone-aparece 160ms ease-out',
      }}
    >
      <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: TI.posicion.peso, color: CI.tinta2, textAlign: 'center', lineHeight: 1.15 }}>{contexto.join(' · ')}</span>
      <span style={{ ...estiloNumeral(n > 0 ? 200 : 160, 700), color: CI.tinta }}>{n > 0 ? String(n) : 'GO'}</span>
      {contra ? <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: 600, color: CI.tinta, textAlign: 'center', lineHeight: 1.15, textWrap: 'balance' }}>{contra}</span> : null}
    </div>
  );
}

/** El km recién cerrado, unos segundos sobre el vivo. Sin háptico propio: ya vibró la vuelta. */
export function AvisoVuelta({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: MARGEN,
        right: MARGEN,
        top: `calc(var(--twin-safe-top) + ${ALTO.cabecera + 12}px)`,
        borderRadius: 24,
        background: CI.superficie2,
        padding: '14px 18px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 18px 40px rgba(0,0,0,0.6)',
        animation: 'iphone-entra 220ms ease-out',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Etiqueta>{titulo}</Etiqueta>
        <Etiqueta tono={CI.tinta}>{pie}</Etiqueta>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        <Numeral texto={valor} cuerpo={44} />
      </span>
    </div>
  );
}
