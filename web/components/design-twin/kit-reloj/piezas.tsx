'use client';

// LAS PIEZAS — los átomos que pintan una lámina. Ninguna escribe un tamaño o
// un color que no salga de `tokens.ts`, y ninguna decide QUÉ se pinta: eso lo
// dice `laminaDelPaso`. Aquí solo se decide CÓMO.
//
// Cinturón de seguridad: toda línea se mide con las métricas de SF (sin DOM,
// igual en servidor y en cliente) y, además, `useCabe` comprueba en el
// navegador que no desborda. Si el navegador no tiene SF (Linux, capturas),
// la línea se escala lo justo; en el Mac de Alex el cinturón no actúa.

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { HeroeVista, LineaVista } from './lamina';
import {
  ANCHO_CABEZA,
  ANCHO_HEROE,
  ANCHO_UTIL,
  C,
  FILA,
  HUECO_UNIDAD,
  T,
  anchoTexto,
  cuerpoQueCabe,
  tallaHeroe,
} from './tokens';

// ---------------------------------------------------------------------------
// El contexto de la muñeca: modelo de reloj y Always-On
// ---------------------------------------------------------------------------

/**
 * Qué gesto de cierre tiene el reloj. Doble toque: Series 9 / Ultra 2 en
 * adelante. Botón Acción: Ultra. En el resto, un botón visible y acotado
 * (≥ 44 pt). Modelo, «dónde puede fallar».
 */
export type ModeloReloj = 'doble-toque' | 'boton-accion' | 'sin-gesto';

export interface EntornoReloj {
  modelo: ModeloReloj;
  aod: boolean;
  /**
   * El aviso de deshacer ocupa la franja del pie (5 s). Una cara cuyo héroe
   * va justo encima de la última fila le deja el sitio (`HuecoPie`) en vez de
   * quedar rebanada: el aviso nunca tapa el héroe.
   */
  pieOcupado?: boolean;
}

export const RelojContexto = createContext<EntornoReloj>({ modelo: 'doble-toque', aod: false });

export function useReloj(): EntornoReloj {
  return useContext(RelojContexto);
}

/**
 * La acción del momento, tal como la ejecuta la carcasa: con su aviso de
 * deshacer. Un botón en pantalla («Empezar ya», «Estación hecha») la toma de
 * aquí para que cerrar con el dedo deje los mismos 5 s que el doble toque.
 */
export const PrimariaContexto = createContext<(() => void) | null>(null);

export function usePrimaria(): (() => void) | null {
  return useContext(PrimariaContexto);
}

// ---------------------------------------------------------------------------
// El cinturón: que nada se salga del reloj
// ---------------------------------------------------------------------------

/** Si el elemento es más ancho que su padre, lo escala. Solo actúa sin SF. */
export function useCabe<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const padre = el?.parentElement;
    if (!el || !padre) return;
    el.style.transform = '';
    const cabe = padre.clientWidth;
    const mide = el.scrollWidth;
    if (cabe > 0 && mide > cabe + 0.5) el.style.transform = `scale(${cabe / mide})`;
  });
  return ref;
}

const linea: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  whiteSpace: 'nowrap',
  transformOrigin: 'center',
  fontVariantNumeric: 'tabular-nums',
};

const fila: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  flex: '0 0 auto',
};

// ---------------------------------------------------------------------------
// Contexto, nota, instrucción
// ---------------------------------------------------------------------------

/**
 * LA LÍNEA DE CONTEXTO — dónde estás, a 16 pt semibold. Recibe las partes por
 * prioridad y quita por el final hasta que cabe: «Tanda 2/3 · Serie 4/6 · 1′»
 * pierde el «1′» antes que la posición.
 */
export function ContextoLinea({ partes, tono = C.tinta }: { partes: string[]; tono?: string }) {
  const ref = useCabe<HTMLSpanElement>();
  // Primero baja de 16 a 15 pt (el suelo); solo si ni así cabe, quita partes
  // por el final: «Tanda 2/3 · Serie 4/6 · 1′» pierde el «1′» antes que la posición.
  let usadas = partes.filter(Boolean);
  const cabe = (x: string[]) => anchoTexto(x.join(' · '), T.suelo, T.contexto.peso) <= ANCHO_CABEZA;
  while (usadas.length > 1 && !cabe(usadas)) usadas = usadas.slice(0, -1);
  const texto = usadas.join(' · ');
  const cuerpo = cuerpoQueCabe(texto, T.contexto.cuerpo, ANCHO_CABEZA, T.contexto.peso);
  return (
    <div style={{ ...fila, height: FILA.contexto, alignItems: 'center' }}>
      <div style={{ maxWidth: ANCHO_CABEZA, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <span ref={ref} style={{ ...linea, fontSize: cuerpo, fontWeight: T.contexto.peso, color: tono, lineHeight: 1 }}>
          {texto}
        </span>
      </div>
    </div>
  );
}

/** ¿En cuántas líneas va una nota? Una si cabe en el ancho útil; si no, dos (nunca se encoge por debajo de 15 pt). */
export function lineasDeNota(texto: string, ancho: number = ANCHO_UTIL): 1 | 2 {
  return anchoTexto(texto, T.nota.cuerpo, T.nota.peso) <= ancho * HOLGURA_ESTIMA ? 1 : 2;
}

/**
 * El estimador de anchos es conservador (redondea SF hacia arriba). Una línea
 * que se pasa menos de un 4 % se deja en una línea: en SF cabe, y el cinturón
 * (`useCabe`) la ajusta si el navegador no tiene SF.
 */
const HOLGURA_ESTIMA = 1.04;

/**
 * La nota: honestidad, procedencia o el cue del coach. 15 pt, el suelo. Si
 * no cabe en una línea, va en DOS (equilibradas) antes que encoger: una nota
 * de honestidad que no se lee no cumple su función. `ancho` la estrecha
 * cuando va pegada a las esquinas de abajo (`ANCHO_PIE`).
 */
export function Nota({
  children,
  tono = C.tinta2,
  ancho = ANCHO_UTIL,
  prefijo,
}: {
  children: string;
  tono?: string;
  ancho?: number;
  /** Un arranque en tinta2 delante del texto: «Luego ·», «Viene:». */
  prefijo?: string;
}) {
  const ref = useCabe<HTMLSpanElement>();
  const completo = prefijo ? `${prefijo} ${children}` : children;
  const cabeza = prefijo ? <span style={{ color: C.tinta2, marginRight: '0.3em' }}>{prefijo}</span> : null;
  if (lineasDeNota(completo, ancho) === 2) {
    return (
      <div style={{ ...fila, height: FILA.nota2, alignItems: 'center' }}>
        <span
          style={{
            maxWidth: ancho,
            fontSize: T.nota.cuerpo,
            fontWeight: T.nota.peso,
            color: tono,
            lineHeight: `${FILA.nota2 / 2}px`,
            textAlign: 'center',
            textWrap: 'balance',
          }}
        >
          {cabeza}
          {children}
        </span>
      </div>
    );
  }
  return (
    <div style={{ ...fila, height: FILA.nota, alignItems: 'center' }}>
      <div style={{ maxWidth: ancho, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <span ref={ref} style={{ ...linea, fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: tono, lineHeight: 1 }}>
          {cabeza}
          {children}
        </span>
      </div>
    </div>
  );
}

/** Lo que no es un número vivo pero manda: «RPE 7 · fuerte». 22 pt, en tinta. */
export function Instruccion({ texto, tono = C.tinta }: { texto: string; tono?: string }) {
  const ref = useCabe<HTMLSpanElement>();
  const cuerpo = cuerpoQueCabe(texto, T.tercero.cuerpo, ANCHO_UTIL);
  return (
    <div style={{ ...fila, height: FILA.instruccion, alignItems: 'center' }}>
      <span ref={ref} style={{ ...linea, fontSize: cuerpo, fontWeight: 600, color: tono, lineHeight: 1 }}>
        {texto}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El héroe
// ---------------------------------------------------------------------------

/**
 * EL NÚMERO GRANDE. Ajustado al ancho útil (44–96 pt) y al alto que dejan las
 * filas presentes (`altoMax`, que calcula `altoHeroe`). SF recto, cifras fijas.
 */
export function Heroe({
  heroe,
  altoMax,
  tono = C.tinta,
  ancho = ANCHO_HEROE,
}: {
  heroe: HeroeVista;
  altoMax: number;
  tono?: string;
  ancho?: number;
}) {
  const ref = useCabe<HTMLSpanElement>();
  const conEtiqueta = heroe.etiqueta != null;
  const alto = altoMax - (conEtiqueta ? FILA.etiquetaHeroe : 0);
  const talla = tallaHeroe(heroe.texto, heroe.unidad, ancho, alto);
  return (
    <div style={{ ...fila, flexDirection: 'column', alignItems: 'center' }}>
      {conEtiqueta ? (
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2, lineHeight: `${FILA.etiquetaHeroe}px` }}>
          {heroe.etiqueta}
        </span>
      ) : null}
      <div style={{ ...fila }}>
        <span ref={ref} style={{ ...linea, lineHeight: T.heroe.caja }}>
          <span
            style={{
              fontSize: talla.cuerpo,
              fontWeight: T.heroe.peso,
              color: tono,
              letterSpacing: 0,
              transition: 'font-size 240ms ease-out',
            }}
          >
            {heroe.texto}
          </span>
          {heroe.unidad ? (
            <span
              style={{
                marginLeft: HUECO_UNIDAD,
                fontSize: talla.cuerpoUnidad,
                fontWeight: T.unidad.peso,
                color: C.tinta2,
              }}
            >
              {heroe.unidad}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las líneas de apoyo
// ---------------------------------------------------------------------------

/** El corazón del pulso. En tinta2: el rojo es de la zona 5, no del pulso. */
export function Corazon({ talla = 13, tono = C.tinta2 }: { talla?: number; tono?: string }) {
  return (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ alignSelf: 'center', flex: '0 0 auto' }}>
      <path
        d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.6h2c.7-1.5 2.2-2.6 4.3-2.6 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21Z"
        fill={tono}
      />
    </svg>
  );
}

/** Una marca de zona: «Z4» en el color de su zona. El espectro es el único color de dato. */
export function ChipZona({ n, color }: { n: number; color: string }) {
  return (
    <span style={{ fontSize: T.nota.cuerpo, fontWeight: 700, color, marginLeft: 6 }}>
      Z{n}
    </span>
  );
}

/**
 * UNA LÍNEA DE DATO — segundo (30 pt) o tercero (22 pt). Etiqueta y unidad
 * a 15 pt en tinta2; el valor en tinta. Si no cabe, baja el valor (nunca de
 * 15 pt) antes que salirse.
 */
export function Linea({
  linea: l,
  cuerpo,
  ancho = ANCHO_UTIL,
}: {
  linea: LineaVista;
  cuerpo: 30 | 22;
  /** `ANCHO_PIE` si es la última fila (las esquinas de abajo). */
  ancho?: number;
}) {
  const ref = useCabe<HTMLSpanElement>();
  const extra =
    (l.etiqueta ? anchoTexto(l.etiqueta, T.nota.cuerpo) + 6 : 0) +
    (l.glifo ? 18 : 0) +
    (l.unidad ? anchoTexto(l.unidad, T.nota.cuerpo) + 3 : 0) +
    (l.tendencia ? 14 : 0) +
    (l.zona ? 28 : 0) +
    (l.aviso ? anchoTexto(`${l.aviso.marca} ${l.aviso.texto}`, T.nota.cuerpo) + 8 : 0);
  const c = cuerpoQueCabe(l.valor, cuerpo, ancho - extra);
  const alto = cuerpo === 30 ? FILA.segundo : FILA.tercero;
  const chico: CSSProperties = { fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2 };
  return (
    <div style={{ ...fila, height: alto, alignItems: 'center' }}>
      <div style={{ maxWidth: ancho, width: '100%', display: 'flex', justifyContent: 'center' }}>
      <span ref={ref} style={{ ...linea, gap: 0, lineHeight: 1 }}>
        {l.etiqueta ? <span style={{ ...chico, marginRight: 6 }}>{l.etiqueta}</span> : null}
        {l.glifo === 'pulso' ? (
          <span style={{ marginRight: 5, display: 'inline-flex' }}>
            <Corazon talla={cuerpo === 30 ? 16 : 14} />
          </span>
        ) : null}
        <span style={{ fontSize: c, fontWeight: 600, color: C.tinta }}>{l.valor}</span>
        {l.unidad ? <span style={{ ...chico, marginLeft: 3 }}>{l.unidad}</span> : null}
        {l.tendencia ? (
          <span style={{ ...chico, marginLeft: 3, color: C.tinta }}>{l.tendencia === 'baja' ? '↓' : '↑'}</span>
        ) : null}
        {l.zona ? <ChipZona n={l.zona.n} color={l.zona.color} /> : null}
        {l.aviso ? (
          <span style={{ ...chico, color: C.tinta, fontWeight: 600, marginLeft: 8 }}>
            {l.aviso.marca} {l.aviso.texto}
          </span>
        ) : null}
      </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Botones y la pista de la acción del momento
// ---------------------------------------------------------------------------

/** Un botón acotado: ≥ 44 pt de alto. Naranja SOLO si es la acción del momento. */
export function BotonAccion({
  etiqueta,
  onPulsa,
  variante = 'accion',
  ancho = '100%',
  icono,
}: {
  etiqueta: string;
  onPulsa: () => void;
  variante?: 'accion' | 'superficie';
  ancho?: number | string;
  icono?: ReactNode;
}) {
  const accion = variante === 'accion';
  // Con ancho fijo, la etiqueta se ajusta (sin bajar de 15 pt) para no salirse del botón.
  const cuerpo = typeof ancho === 'number' ? cuerpoQueCabe(etiqueta, T.boton.cuerpo, ancho - 16, T.boton.peso) : T.boton.cuerpo;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPulsa();
      }}
      style={{
        width: ancho,
        minHeight: T.boton.alto,
        padding: typeof ancho === 'number' ? '0 8px' : '0 12px',
        flex: '0 0 auto',
        border: 0,
        borderRadius: T.boton.alto / 2,
        background: accion ? C.accion : C.superficie2,
        color: accion ? C.sobreAccion : C.tinta,
        fontSize: cuerpo,
        fontWeight: T.boton.peso,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {icono}
      {etiqueta}
    </button>
  );
}

/**
 * LA ACCIÓN DEL MOMENTO, dicha según el reloj: «doble toque · empezar ya» en
 * un Series 9+, «botón Acción · …» en un Ultra, y un botón de verdad en el
 * resto. Un toque en la pantalla nunca es el gesto; dos seguidos (el doble
 * toque de Apple Entreno) sí, en todo reloj: lo reconoce la carcasa.
 */
export function PistaAccion({ accion, onPulsa }: { accion: string; onPulsa?: () => void }) {
  const { modelo } = useReloj();
  const primaria = usePrimaria();
  if (modelo === 'sin-gesto') {
    const mayus = accion.charAt(0).toUpperCase() + accion.slice(1);
    return (
      <div style={{ width: '100%', padding: '0 8px', boxSizing: 'border-box' }}>
        <BotonAccion etiqueta={mayus} onPulsa={onPulsa ?? primaria ?? (() => undefined)} />
      </div>
    );
  }
  return <Nota>{`${modelo === 'boton-accion' ? 'botón Acción' : 'doble toque'} · ${accion}`}</Nota>;
}

/** Lo que ocupa la acción del momento según el reloj: una pista (18 pt) o un botón (48 pt). */
export function useFilaAccion(): 'pista' | 'boton' {
  return useReloj().modelo === 'sin-gesto' ? 'boton' : 'pista';
}

/**
 * EL DATO VIEJO (§3): el campo que depende del móvil y no llega en 5 s se
 * pinta «—» con esta nota. Nunca se congela en silencio.
 */
export function DatoViejo() {
  return <Nota>sin enlace · la muñeca sigue grabando</Nota>;
}
