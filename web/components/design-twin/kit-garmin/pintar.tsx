'use client';

// EL PINTOR — pinta una `Disposicion` en la pantalla redonda, y nada más.
//
//   GarminContexto / useGarmin   el reloj en el que se pinta: D, tecnología,
//                                el pintor de color (aMip en MIP) y si el
//                                táctil está activo (solo fuera del vivo).
//   PantallaGarmin               el círculo de D × D: fondo, recorte, contexto.
//   Disposicion (componente)     las líneas, el héroe, la pista, el sello, el marco.
//   Cifras                       la cara de marca con cada cifra a 0,46 em
//                                (la fuente no trae `tnum`: tabulares a mano).
//
// Todo color pasa por `pinta` (en MIP, `aMip`). Ningún tamaño se escribe
// aquí: vienen en la disposición, en px, calculados desde fracciones de D.
//
// Qué NO hacer: colocar a mano (eso es `disponer`/`caras`); usar opacidades
// para oscurecer (en MIP no existe la media luz: se calcula el color).

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import type { Disposicion as DisposicionDatos, HeroeG, LineaG, PistaG } from './disponer';
import { PISTA } from './geometria';
import { GLIFO_EM, SOBRA_CURSIVA, avanceCifra, type Pieza, type Tono } from './medir';
import { AIRE, CG, DIBUJO, FUENTE, TAMANOS, TIEMPO, TRAZO, ZONA_APAGADA, pintorDe, sobreNegro, tamanoDe, type Diametro, type Tamano } from './tokens';

// ---------------------------------------------------------------------------
// El reloj en el que se pinta
// ---------------------------------------------------------------------------

export interface EntornoGarmin {
  tamano: Tamano;
  D: number;
  pinta: (hex: string) => string;
  /** ¿Responde la pantalla al dedo? Solo fuera del vivo y en un reloj táctil. */
  tactil: boolean;
}

export const GarminContexto = createContext<EntornoGarmin>({
  tamano: TAMANOS[0]!,
  D: TAMANOS[0]!.D,
  pinta: pintorDe('amoled'),
  tactil: false,
});

export const useGarmin = () => useContext(GarminContexto);

export function entornoDe(D: Diametro, tactil = false): EntornoGarmin {
  const tamano = tamanoDe(D);
  return { tamano, D, pinta: pintorDe(tamano.tec), tactil: tactil && tamano.tactil };
}

/** El color de un tono, ya pintado para esta tecnología. */
export function colorDe(t: Tono, pinta: (hex: string) => string): string {
  if (t === 'tinta') return pinta(CG.tinta);
  if (t === 'tinta2') return pinta(CG.tinta2);
  if (t === 'accion') return pinta(CG.accion);
  return pinta(t.dato);
}

export const KEYFRAMES_GARMIN = `
@keyframes garmin-destello { 0% { opacity: 1 } 40% { opacity: 0 } 60% { opacity: 1 } 100% { opacity: 0 } }
@keyframes garmin-drena { from { transform: scaleX(1) } to { transform: scaleX(0) } }
`;

/**
 * LA PANTALLA — el círculo de D × D. `fondo` es el tinte de zona (solo AMOLED,
 * ya calculado por `tinteDeFondo`); si no, negro.
 */
export function PantallaGarmin({ entorno, fondo, children, onToque }: { entorno: EntornoGarmin; fondo?: string | null; children?: ReactNode; onToque?: () => void }) {
  const { D, pinta } = entorno;
  return (
    <GarminContexto.Provider value={entorno}>
      <div
        onClick={onToque}
        style={{
          position: 'relative',
          width: D,
          height: D,
          borderRadius: '50%',
          overflow: 'hidden',
          background: pinta(fondo ?? CG.fondo),
          color: pinta(CG.tinta),
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
          // Un MIP no funde: cambia de golpe. Solo el AMOLED lleva transición.
          transition: entorno.tamano.tec === 'amoled' ? 'background-color 600ms ease' : undefined,
          flex: '0 0 auto',
        }}
      >
        <style>{KEYFRAMES_GARMIN}</style>
        {children}
      </div>
    </GarminContexto.Provider>
  );
}

// ---------------------------------------------------------------------------
// Las piezas
// ---------------------------------------------------------------------------

/** La cara de marca con cada carácter en su avance fijo: «1:11» y «8:88» miden lo mismo. */
export function Cifras({ texto, cuerpo, color }: { texto: string; cuerpo: number; color: string }) {
  const f = FUENTE.cifras;
  return (
    <span
      style={{
        fontFamily: f.familia,
        fontWeight: f.peso,
        fontStyle: f.cursiva ? 'italic' : 'normal',
        fontSize: cuerpo,
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
        paddingRight: `${SOBRA_CURSIVA}em`,
      }}
    >
      {[...texto].map((ch, k) => (
        <span key={k} style={{ display: 'inline-block', width: `${avanceCifra(ch)}em`, textAlign: 'center' }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Un glifo dentro de su ancho medido (`GLIFO_EM`): el corazón ocupa lo que
 * dice su dibujo (`DIBUJO`) y el resto es aire a su derecha; el punto de
 * estado, centrado.
 */
function Glifo({ p, color, gris }: { p: Pieza; color: string; gris: string }) {
  const ancho = GLIFO_EM[p.glifo!] * p.cuerpo;
  if (p.glifo === 'pulso') {
    const lado = DIBUJO.corazon * p.cuerpo;
    return (
      <svg width={lado} height={lado} viewBox="0 0 24 24" aria-hidden style={{ marginLeft: p.antes, alignSelf: 'center', flex: '0 0 auto', marginRight: ancho - lado }}>
        <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.6h2c.7-1.5 2.2-2.6 4.3-2.6 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21Z" fill={gris} />
      </svg>
    );
  }
  const lleno = p.glifo === 'pendiente' ? 'none' : p.glifo === 'ahora' ? color : gris;
  return (
    <svg width={ancho} height={DIBUJO.punto * p.cuerpo} viewBox="0 0 10 10" aria-hidden style={{ marginLeft: p.antes, alignSelf: 'center', flex: '0 0 auto' }}>
      <circle cx="5" cy="5" r="4" fill={lleno} stroke={p.glifo === 'pendiente' ? gris : 'none'} strokeWidth="1.5" />
    </svg>
  );
}

function PiezaPintada({ p }: { p: Pieza }) {
  const { pinta } = useGarmin();
  const color = colorDe(p.tono, pinta);
  if (p.glifo) return <Glifo p={p} color={color} gris={pinta(CG.tinta2)} />;
  if (p.cara === 'cifras') {
    return (
      <span style={{ marginLeft: p.antes }}>
        <Cifras texto={p.texto} cuerpo={p.cuerpo} color={color} />
      </span>
    );
  }
  const f = FUENTE[p.cara];
  return (
    <span style={{ marginLeft: p.antes, fontFamily: f.familia, fontWeight: f.peso, fontSize: p.cuerpo, lineHeight: 1, color, whiteSpace: 'nowrap' }}>
      {p.texto}
    </span>
  );
}

/** Una línea colocada: su caja (y, alto, ancho útil) y sus piezas en fila por la línea base. */
export function LineaPintada({ l, onToque }: { l: LineaG; onToque?: () => void }) {
  const { D } = useGarmin();
  const extremos = l.reparto === 'extremos';
  return (
    <div
      data-rol={l.rol}
      onClick={onToque}
      style={{
        position: 'absolute',
        top: l.y,
        height: l.alto,
        left: (D - l.anchoUtil) / 2,
        width: l.anchoUtil,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onToque ? 'pointer' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: extremos ? 'space-between' : 'center', width: extremos ? '100%' : undefined, whiteSpace: 'nowrap' }}>
        {l.piezas.map((p, k) => (
          <PiezaPintada key={k} p={extremos && k > 0 ? { ...p, antes: 0 } : p} />
        ))}
      </div>
    </div>
  );
}

/** El héroe: el número (cara de cifras, o la sans si es una palabra: «GO») y su unidad. */
export function HeroePintado({ h }: { h: HeroeG }) {
  const { D, pinta } = useGarmin();
  const color = colorDe(h.tono, pinta);
  const f = FUENTE[h.cara];
  return (
    <div data-rol="heroe" style={{ position: 'absolute', top: h.y, height: h.alto, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
        {h.cara === 'cifras' ? (
          <Cifras texto={h.texto} cuerpo={h.talla.cuerpo} color={color} />
        ) : (
          <span style={{ fontFamily: f.familia, fontWeight: FUENTE.cifras.peso, fontSize: h.talla.cuerpo, lineHeight: 1, color }}>{h.texto}</span>
        )}
        {h.unidad ? (
          <span style={{ marginLeft: AIRE.unidad * D, fontFamily: FUENTE.texto.familia, fontWeight: FUENTE.texto.peso, fontSize: h.talla.cuerpoUnidad, lineHeight: 1, color: pinta(CG.tinta2) }}>
            {h.unidad}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * LA PISTA DE LA BANDA — el calibre: a la izquierda lo suave, a la derecha lo
 * fuerte; la banda del coach y tu marca. Fuera, la marca pasa a ▲/▼ (P3), sin
 * cambiar de color (P6). A zona, el espectro del coach con su zona encendida.
 */
export function PistaPintada({ p }: { p: PistaG }) {
  const { D, pinta, tamano } = useGarmin();
  const b = p.banda;
  const marca = PISTA.marca * D;
  const fuera = b.veredicto != null && b.veredicto !== 'dentro' ? b.veredicto : null;
  const base: CSSProperties = { position: 'absolute', top: 0, height: p.alto, borderRadius: p.alto / 2 };
  return (
    <div data-rol="pista" style={{ position: 'absolute', top: p.y, left: (D - p.ancho) / 2, width: p.ancho, height: p.alto }}>
      <div style={{ ...base, left: 0, right: 0, background: pinta(CG.carril), overflow: 'hidden', display: 'flex', gap: b.zonas ? Math.max(TRAZO.minimoPx.huecoZonas, Math.round(D * TRAZO.huecoZonas)) : 0 }}>
        {b.zonas
          ? b.zonas.colores.map((c, i) => {
              const z = i + 1;
              const en = z >= b.zonas!.objetivo[0] && z <= b.zonas!.objetivo[1];
              return <span key={i} style={{ flex: 1, background: pinta(en ? c : sobreNegro(c, ZONA_APAGADA)) }} />;
            })
          : null}
      </div>
      {!b.zonas ? <div style={{ ...base, left: `${b.desde * 100}%`, width: `${(b.hasta - b.desde) * 100}%`, background: pinta(CG.banda) }} /> : null}
      {b.marca != null ? (
        <svg
          width={marca}
          height={marca}
          viewBox="0 0 16 16"
          aria-hidden
          style={{ position: 'absolute', left: `${b.marca * 100}%`, top: (p.alto - marca) / 2, transform: 'translateX(-50%)', transition: tamano.tec === 'amoled' ? `left ${TIEMPO.marcaMs}ms ease-out` : undefined, overflow: 'visible' }}
        >
          {fuera ? (
            <path d={fuera === 'por-encima' ? 'M8 1.5 15 14.5H1Z' : 'M8 14.5 1 1.5h14Z'} fill={pinta(CG.tinta)} stroke={pinta(CG.fondo)} strokeWidth="1.5" strokeLinejoin="round" />
          ) : (
            <rect x="6" y="0" width="4" height="16" rx="2" fill={pinta(CG.tinta)} stroke={pinta(CG.fondo)} strokeWidth="1.2" />
          )}
        </svg>
      ) : null}
    </div>
  );
}

/** El sello de un final: un círculo y el ✓. */
function Sello({ y, talla }: { y: number; talla: number }) {
  const { pinta } = useGarmin();
  return (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ position: 'absolute', top: y - talla / 2, left: '50%', transform: 'translateX(-50%)' }}>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={pinta(CG.tinta2)} strokeWidth="1.6" />
      <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={pinta(CG.tinta)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pinta una disposición entera. `alTocar` recibe el rol de una línea tocada (menús, fuera del vivo). */
export function PintaDisposicion({ d, alTocar }: { d: DisposicionDatos; alTocar?: (rol: string, k: number) => void }) {
  const { D, pinta, tactil } = useGarmin();
  return (
    <>
      {d.marco ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: d.marco.y,
            height: d.marco.alto,
            left: (D - d.marco.ancho) / 2,
            width: d.marco.ancho,
            borderRadius: d.marco.alto / 2,
            boxShadow: `inset 0 0 0 ${Math.max(TRAZO.minimoPx.marco, Math.round(D * TRAZO.marco))}px ${pinta(CG.accion)}`,
          }}
        />
      ) : null}
      {d.sello ? <Sello y={d.sello.y} talla={d.sello.talla} /> : null}
      {d.lineas.map((l, k) => (
        <LineaPintada key={k} l={l} onToque={tactil && alTocar ? () => alTocar(l.rol, k) : undefined} />
      ))}
      {d.heroe ? <HeroePintado h={d.heroe} /> : null}
      {d.pista ? <PistaPintada p={d.pista} /> : null}
    </>
  );
}

/** Un fondo negro que tapa (las capas a pantalla entera y la franja del deshacer). */
export function Tapa({ y = 0, alto, children }: { y?: number; alto?: number; children?: ReactNode }) {
  const { D, pinta } = useGarmin();
  return <div style={{ position: 'absolute', left: 0, right: 0, top: y, height: alto ?? D - y, background: pinta(CG.fondo) }}>{children}</div>;
}

export const DESTELLO_MS = TIEMPO.destelloMs;
