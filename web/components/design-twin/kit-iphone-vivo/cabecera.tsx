'use client';

// LA CABECERA (I5.1) — dónde estás, cuánto llevas y qué está enlazado.
//
//   fila 1   la POSICIÓN en palabras («Serie 3/6 · 1000 m», «Ronda 2/5 ·
//            Estación 3/4», «A1 · Back Squat · Serie 2/4») y el crono de la
//            sesión (o el crono TOTAL en un circuito: la puntuación, que
//            nunca se va de la pantalla).
//   fila 2   el formato en castellano de box («Series», «EMOM 12′», «For
//            Time · cap 20′») con la marca «Test» si lo es, y los chips de
//            enlace (reloj, GPS, máquina, pulso) que se tocan para abrir
//            Conectividad.
//
// Nunca el título plegado del bloque («Run · SkiErg · …»). Si la posición no
// cabe, pierde partes por el final (el prescrito antes que la posición),
// nunca se trunca con puntos suspensivos.

import type { ChipEnlace } from './enlace';
import { Chip, Etiqueta, Icono, Numeral, useLienzo } from './piezas';
import { ALTO, CI, MARGEN, TI, anchoTexto, type Peso } from './tokens';

/** Las partes que caben en `ancho`, quitando por el final. Siempre queda la primera. */
/** El estimador de SF (anchoTexto) ya redondea hacia arriba con la negrita a 22 pt: medido en el doble, sin holgura extra. */
const HOLGURA_POSICION = 1.0;

export function partesQueCaben(partes: string[], ancho: number, cuerpo: number = TI.posicion.cuerpo, peso: Peso = TI.posicion.peso): string[] {
  let usadas = partes.filter(Boolean);
  const cabe = (x: string[]) => anchoTexto(x.join(' · '), cuerpo, peso) * HOLGURA_POSICION <= ancho;
  while (usadas.length > 1 && !cabe(usadas)) usadas = usadas.slice(0, -1);
  return usadas;
}

/** Lo que ocupa un chip de enlace: icono, hueco, texto y sus márgenes (`Chip`). */
export const anchoChip = (texto: string, buscando: boolean) => 8 + 16 + 6 + (buscando ? 12 : 0) + anchoTexto(texto, TI.chip.cuerpo, TI.chip.peso) + 10;

/** Lo que ocupan los chips de la cabecera con sus huecos: la fila del formato se queda con el resto. */
export const anchoChips = (chips: ChipEnlace[]) => chips.reduce((a, c) => a + anchoChip(c.texto, c.estado === 'buscando'), 0) + 6 * Math.max(0, chips.length - 1);

export interface CabeceraProps {
  /** La posición por partes y por prioridad (de `contextoDe` o de la familia). */
  posicion: string[];
  /**
   * «Series», «EMOM 12′»… (`formatoDe`). Por partes si la familia añade dónde
   * estás («Circuito · Ronda 2/5 · Estación 2/3»): lo que no cabe junto a los
   * chips se quita por el final, nunca se trunca.
   */
  formato: string | string[];
  /** La marca de test: un test no se confunde con un WOD en vivo. */
  test?: boolean;
  /** El crono: el de la sesión, o el total del circuito. */
  crono: { valor: string; etiqueta: 'sesión' | 'total' };
  chips: ChipEnlace[];
  onEnlaces?: (clave: ChipEnlace['clave']) => void;
  /** Salir sin parar (el motor sigue; se vuelve desde el aviso de entreno en curso). Sin él, no hay chevrón. */
  onMinimizar?: () => void;
}

/** El chevrón de minimizar: su ancho tocable (el alto, 44). */
const ANCHO_MINIMIZAR = 28;

export function Cabecera({ posicion, formato, test = false, crono, chips, onEnlaces, onMinimizar }: CabeceraProps) {
  const { ancho } = useLienzo();
  // El crono se lleva su sitio a la derecha; la posición se queda con el resto.
  const anchoCrono = anchoTexto(crono.valor, TI.crono.cuerpo, TI.crono.peso) + (crono.etiqueta === 'total' ? 44 : 8);
  const anchoMin = onMinimizar ? ANCHO_MINIMIZAR + 8 : 0;
  const partes = partesQueCaben(posicion, ancho - 2 * MARGEN - anchoCrono - 16 - anchoMin);
  // La fila del formato comparte sitio con los chips: se queda con el resto.
  const formatoTexto = Array.isArray(formato) ? partesQueCaben(formato, ancho - 2 * MARGEN - anchoChips(chips) - 10, TI.etiqueta.cuerpo, TI.etiqueta.peso).join(' · ') : formato;
  return (
    <header
      style={{
        height: ALTO.cabecera,
        padding: `0 ${MARGEN}px`,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        flex: '0 0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        {onMinimizar ? (
          // Salir SIN parar (el motor sigue): un chevrón hacia abajo, nunca una × (se lee como descartar).
          <button
            type="button"
            aria-label="Salir sin parar"
            onClick={onMinimizar}
            style={{ all: 'unset', cursor: 'pointer', width: ANCHO_MINIMIZAR, height: 44, margin: '-11px -4px -11px 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', color: CI.tinta2 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 9l7 7 7-7" />
            </svg>
          </button>
        ) : null}
        <span
          style={{
            fontSize: TI.posicion.cuerpo,
            fontWeight: TI.posicion.peso,
            color: CI.tinta,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 0,
          }}
        >
          {partes.join(' · ')}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
          {crono.etiqueta === 'total' ? <Etiqueta>total</Etiqueta> : null}
          <Numeral texto={crono.valor} cuerpo={TI.crono.cuerpo} peso={TI.crono.peso} />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {test ? null : <Etiqueta estilo={{ overflow: 'visible' }}>{formatoTexto}</Etiqueta>}
          {test ? (
            <span
              style={{
                fontSize: TI.etiqueta.cuerpo,
                fontWeight: 700,
                color: CI.fondo,
                background: CI.tinta,
                borderRadius: 8,
                padding: '2px 7px',
                lineHeight: 1.1,
                letterSpacing: '0.02em',
              }}
            >
              Test
            </span>
          ) : null}
        </span>
        <span style={{ display: 'inline-flex', gap: 6, flex: '0 0 auto' }}>
          {chips.map((c) => (
            <Chip key={c.clave} texto={c.texto} estado={c.estado} icono={<Icono nombre={c.icono} talla={16} />} onPulsa={() => onEnlaces?.(c.clave)} />
          ))}
        </span>
      </div>
    </header>
  );
}

/** Los puntos de las páginas laterales (Vivo · Estructura · Mapa), bajo la cabecera. */
export function PuntosPaginas({ total, activa }: { total: number; activa: number }) {
  if (total <= 1) return <div style={{ height: ALTO.puntos, flex: '0 0 auto' }} />;
  return (
    <div aria-hidden style={{ height: ALTO.puntos, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: '0 0 auto' }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: i === activa ? 16 : 6, height: 6, borderRadius: 3, background: i === activa ? CI.tinta : CI.carril, transition: 'width 200ms ease' }} />
      ))}
    </div>
  );
}
