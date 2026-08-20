'use client';

// EL LENGUAJE DEL ENTRENO EN VIVO — la pieza compartida del §10 del CONTRATO-UI.
//
// Por qué existe: la tanda del 29-jul acertó la ESTRUCTURA (un sujeto por
// formato, según quién gobierna la transición) y falló el LENGUAJE — siete
// pantallas correctas que no se reconocían como la misma app. El tinte de zona
// vivía solo en `vivo-correr`, el numeral tenía cinco implementaciones (una
// clase, cuatro `font:` a mano, con 64 · 72 · 140 · 144 · 152 · 168 px de
// techo), el sujeto caía a una altura distinta en cada pantalla y la acción
// pesaba entre 66 y 96 pt según quién la escribiera.
//
// Aquí vive UNA vez cada una de las cuatro cosas que hacen que se reconozcan:
//
//   Ambiente      — la zona tiñe el lienzo (§10.1)
//   Numeral       — un solo numeral, el del cero rachado (§10.2)
//   MarcoVivo     — el sujeto cae SIEMPRE a la misma altura (§10.3, §10.4)
//   FranjaAccion  — la acción no pesa como el sujeto (§10.5)
//
// Regla de mantenimiento (§0): si dentro de un mes hay que cambiar el tinte, se
// cambia AQUÍ y cambia en las diez. Una pantalla que vuelva a escribir su
// propio `font:` de sujeto o su propio degradado de zona está rompiendo el §10,
// no «adaptándolo a su caso».

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TwinAppearance } from './types';
import { hrZone } from './sim';
import { UMBRAL, reloj } from './datos-reales';

export type Zona = 1 | 2 | 3 | 4 | 5;

const ZONAS: readonly Zona[] = [1, 2, 3, 4, 5];

/** Sin pulso no hay zona: nulo, y nadie pinta un guion (§7). */
export function zonaDe(pulso: number | null | undefined): Zona | null {
  return pulso == null ? null : hrZone(pulso, UMBRAL.ppm);
}

/** El color de una zona. Sin zona, la tinta normal — nunca el naranja de marca. */
export function colorZona(z: Zona | null): string {
  return z == null ? 'var(--twin-fg)' : `var(--twin-z${z})`;
}

// ---------------------------------------------------------------------------
// BandaAnclada — el sujeto cae SIEMPRE en el mismo punto óptico (§10.3), fuera
// de `MarcoVivo`
// ---------------------------------------------------------------------------

/**
 * Ancla el CENTRO del sujeto a la misma altura que las diez vistas en vivo,
 * para las pantallas de «al terminar» que ya no usan `MarcoVivo` (porque
 * scrollean con contenido de verdad debajo) pero quieren el mismo punto óptico.
 *
 * Reservar los 340 pt enteros de `BANDA.sujeto` clava el centro en su sitio,
 * sí, pero deja aire entre el número y lo de debajo cuando el sujeto es corto.
 * Aquí abajo hay contenido de sobra, así que lo correcto es anclar el CENTRO y
 * dejar que lo de debajo empiece justo donde acaba el bloque.
 *
 * Se mide en vivo porque el sujeto no mide lo mismo en cada lectura: «5 de 6»
 * con dos líneas de apoyo y «44:15» con una no ocupan igual, y un número
 * escrito a mano se quedaría obsoleto a la primera línea de copy que cambie.
 * Nació en `lectura-carrera` (12-ago) y sube al kit el 20-ago, la primera vez
 * que una segunda familia («lectura-sesion») lo necesita igual.
 */
export function BandaAnclada({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAlto(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Media banda por encima, menos lo que el propio bloque sube: el centro cae
  // en los mismos 345 pt del lienzo que en las diez vistas en vivo.
  const encima = Math.max(0, BANDA.sujeto / 2 - alto / 2);

  return (
    <div style={{ paddingTop: encima, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §10.1 · Ambiente — la zona tiñe el lienzo. Siempre.
// ---------------------------------------------------------------------------

/**
 * Cuánto color aguanta cada tema. En oscuro el tinte tiene que subir para que
 * se lea a dos metros; en claro, con el mismo porcentaje, el lienzo se
 * emborrona y el texto pierde contraste. Por eso el reparto es por apariencia y
 * no un número único.
 */
const MEZCLA: Record<TwinAppearance, { centro: number; suelo: number }> = {
  dark: { centro: 30, suelo: 14 },
  light: { centro: 17, suelo: 8 },
};

function capa(color: string, m: { centro: number; suelo: number }): string {
  return [
    `radial-gradient(115% 75% at 50% 20%, color-mix(in srgb, ${color} ${m.centro}%, transparent), transparent 70%)`,
    `linear-gradient(to top, color-mix(in srgb, ${color} ${m.suelo}%, transparent), transparent 45%)`,
  ].join(', ');
}

/**
 * El fondo de una vista en vivo ES tu zona de pulso.
 *
 * Una capa por zona y solo la viva a opacidad 1: así el cambio de zona se
 * TRANSICIONA (un degradado no interpola de un color a otro; dos capas sí).
 *
 * Sin ancla de FC no hay tinte y el lienzo queda neutro (§7): el color es un
 * dato, y una pantalla sin pulso teñida de algo estaría inventando intensidad.
 * Esa pantalla no es la versión rota de la buena — es la misma pantalla
 * diciendo la verdad, y por eso conserva banda, numeral y acción intactos.
 *
 * El tinte es AMBIENTE: vive detrás de todo, no tiñe el texto y no compite con
 * el sujeto. Y el naranja de marca NO es un color de zona (§9.1): `acento` se
 * reserva para el instante en que algo se logra, nunca para un estado sostenido.
 */
export function Ambiente({
  zona,
  appearance,
  acento = false,
}: {
  zona: Zona | null;
  appearance: TwinAppearance;
  /** Tiñe de naranja: SOLO el instante en que algo se logra. */
  acento?: boolean;
}) {
  const m = MEZCLA[appearance];
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {ZONAS.map((z) => (
        <div
          key={z}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: !acento && zona === z ? 1 : 0,
            transition: 'opacity 1100ms ease',
            background: capa(`var(--twin-z${z})`, m),
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: acento ? 1 : 0,
          transition: 'opacity 500ms ease',
          background: capa('var(--twin-accent)', m),
        }}
      />
    </div>
  );
}

/** Fogonazo al cruzar el hito: nace encendido y se apaga solo. */
export function Fogonazo({ activo, tono = 'var(--twin-ok)' }: { activo: boolean; tono?: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundColor: `color-mix(in srgb, ${tono} 42%, transparent)`,
        opacity: activo ? 1 : 0,
        transition: 'opacity 620ms ease-out',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// §10.2 · Un solo numeral, y es el del cero rachado
// ---------------------------------------------------------------------------

/**
 * La escala del numeral. UNA, y con dos peldaños vivos:
 *
 *   sujeto  — el número que gobierna la pantalla
 *   segundo — el trabajo, que es lo SEGUNDO más importante (§10.6)
 *
 * Escala con el LIENZO (unidades de contenedor), no con el viewport: dentro del
 * marco del doble el alto de la ventana no dice nada del alto del teléfono, y
 * con `vh` el número encoge en un portátil bajo aunque en el móvil sobre sitio.
 * Tres pantallas usaban `vh` y por eso su sujeto estaba clavado en el techo del
 * clamp sin que nadie lo notara. `MarcoVivo` abre el contenedor de consulta.
 *
 * Con el lienzo del iPhone 17 Pro (781 pt útiles en vertical) el 16 % sale a
 * ~125 pt: se lee de pie, a dos metros y con el móvil en el suelo.
 */
const ESCALA: Record<'sujeto' | 'segundo', Record<'portrait' | 'landscape', string>> = {
  sujeto: { portrait: 'clamp(64px, 16cqh, 140px)', landscape: 'clamp(64px, 16cqw, 140px)' },
  segundo: { portrait: 'clamp(30px, 7cqh, 56px)', landscape: 'clamp(30px, 7cqw, 56px)' },
};

/**
 * EL PRESUPUESTO DE ANCHO — la escala de arriba solo mira el ALTO, y con eso no
 * basta.
 *
 * `139`, `0:21` y `1:54` caben de sobra a 125 pt; `5 × 100` son siete avances
 * de la mono (0,6 em cada uno) = 525 pt sobre un lienzo de 378, y se sale del
 * teléfono. `vivo-erg` lo tenía resuelto con un `maxPx` por sujeto y esta pieza
 * lo dejó fuera al generalizarla — con el resultado de que la fuerza tuvo que
 * partir su prescripción en dos peldaños y «5 × 100» dejó de leerse como UNA
 * cosa, que es justo lo que el atleta tiene delante.
 *
 * Así que el tamaño es el MENOR de los dos techos: el del alto y el que deja el
 * ancho. Solo muerde cuando la cifra es larga — un sujeto de 3 o 4 glifos no se
 * entera de que esto existe.
 *
 * 94cqw y no 100: el numeral respira contra los bordes del lienzo.
 */
const AVANCE_MONO = 0.6;

/** Lo que ocupa la unidad: va en `t-readout-label` (11 px) más su hueco de 8. */
const AVANCE_UNIDAD_PT = 7;

function techoDeAncho(texto: ReactNode, unidad?: string): string | null {
  if (typeof texto !== 'string' && typeof texto !== 'number') return null;
  const glifos = String(texto).length;
  if (glifos <= 4) return null;
  // LA UNIDAD CUENTA. Vive en la MISMA línea que la cifra, así que el ancho
  // disponible es el del lienzo MENOS ella. Sin descontarla, «10 × 82,5» pide sus
  // 355 pt, la unidad no cabe en los 23 que quedan y el `flexWrap` la manda a la
  // línea de abajo — donde se lee como un pie de foto y no como los kilos de la
  // cifra. Se vio en la propuesta del hierro el 11-ago, y es del numeral, no de
  // la pantalla: cualquier sujeto con unidad y cifra larga lo hacía.
  const unidadPt = unidad ? unidad.length * AVANCE_UNIDAD_PT + 8 : 0;
  return `calc((94cqw - ${unidadPt}px) / ${(AVANCE_MONO * glifos).toFixed(2)})`;
}

/**
 * TODO número grande de una vista en vivo pasa por aquí.
 *
 * Mono recto 800 tabular — la cara de instrumento con el cero rachado, la que
 * se lee sudando y en movimiento. Nada de tres tratamientos distintos para el
 * 139 del pulso, el 0:25 del reloj y el 5×100 de la serie: un numeral para
 * toda la app.
 *
 * `tono` existe porque el pulso SÍ se pinta del color de su zona; el resto de
 * los sujetos van en la tinta normal y dejan el color al ambiente.
 */
export function Numeral({
  children,
  horizontal = false,
  escala = 'sujeto',
  tono = 'var(--twin-fg)',
  unidad,
  style,
}: {
  children: ReactNode;
  horizontal?: boolean;
  escala?: 'sujeto' | 'segundo';
  tono?: string;
  unidad?: string;
  style?: CSSProperties;
}) {
  const alto = ESCALA[escala][horizontal ? 'landscape' : 'portrait'];
  const ancho = techoDeAncho(children, unidad);
  return (
    // `wrap` porque la ranura de unidad no siempre recibe una unidad: el erg le
    // pasa «sin lecturas», que es una nota de honestidad (§7) y no cabe en la
    // misma línea. Sin esto se recorta contra el borde y se lee «01:35 LE».
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        justifyContent: 'center',
        flexWrap: 'wrap',
        maxWidth: '100%',
        ...style,
      }}
    >
      <span
        className="t-readout-hero"
        style={{
          fontSize: ancho ? `min(${alto}, ${ancho})` : alto,
          color: tono,
          lineHeight: 0.95,
          whiteSpace: 'nowrap',
          transition: 'color 600ms linear',
        }}
      >
        {children}
      </span>
      {unidad && (
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
          {unidad}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §10.3 y §10.4 · El sujeto cae siempre a la misma altura, y manda
// ---------------------------------------------------------------------------

/**
 * LA BANDA DEL SUJETO — el reparto del alto, en pt del lienzo lógico.
 *
 * En una familia de vistas que se turnan durante el MISMO entreno el sujeto no
 * puede bailar: si en una está centrado y en la siguiente 200 pt más abajo, el
 * atleta reencuadra cada vez que cambia el formato. Se fija la banda y todas la
 * respetan, sea cual sea el dato que caiga dentro.
 *
 * Las filas se reservan aunque vengan vacías — ahí está el truco: una pantalla
 * sin franja de contexto sigue empujando el sujeto a la misma altura que una
 * que sí la tiene, y por eso el numeral no se mueve al cambiar de formato.
 *
 * Cuadre sobre el lienzo del iPhone 17 Pro (874 pt, safe 59/34 → 781 útiles):
 *
 *   safe top                 59
 *   + relleno                12
 *   + CROMO 34 + hueco 12    46
 *   + CONTEXTO 46 + hueco 12 58
 *   + media banda           170
 *   ------------------------------
 *   centro del sujeto       345 pt   ← el mismo en las diez
 *
 * 345 pt es donde ya caía el 140 de `vivo-correr`, que es la que Alex aprobó:
 * la banda no reinventa una altura, fija la que funcionaba.
 *
 * Lo que sobra va a APOYOS (≈213 pt), nunca a una cola debajo (§6.1).
 */
export const BANDA = {
  /** Salir, pausa, en qué serie vas. */
  cromo: 34,
  /** La franja que no desaparece jamás: el minuto, el crono-puntuación, la ventana. */
  contexto: 46,
  /** Donde vive el sujeto. Fija. */
  sujeto: 340,
  /** La acción: se alcanza con una mano y NO compite (§10.5). */
  accion: 76,
  /** Relleno y hueco entre filas (Theme.Spacing.m). */
  hueco: 12,
} as const;

/** El lienzo del iPhone 17 Pro son 874 pt y los safe areas se llevan 59 + 34. */
const LIENZO_UTIL_PT = 874 - 59 - 34;

/** Y de ancho, 402 menos el relleno del marco por los dos lados. */
export const ANCHO_UTIL_PT = 402 - 2 * BANDA.hueco;

/**
 * EL HUECO REAL DE LOS APOYOS — lo que queda del lienzo cuando el marco ya ha
 * repartido cromo, contexto, sujeto y acción, con sus cuatro huecos y su relleno.
 *
 * Vive aquí y no en una pantalla porque es una propiedad del MARCO, no de quien
 * lo monta: `vivo-rondas` derivó de él su umbral de contador el 10-ago y
 * `vivo-fuerza` deriva de él su cascada de apoyos. Escrito dos veces se
 * desincroniza en cuanto alguien toque `BANDA` — que es exactamente el bug que
 * el §0 del kit vino a cortar.
 */
export const APOYOS_PT =
  LIENZO_UTIL_PT -
  (BANDA.cromo + BANDA.contexto + BANDA.sujeto + BANDA.accion + 4 * BANDA.hueco + 2 * BANDA.hueco);

/**
 * El marco de toda vista en vivo. Cinco filas, y el sujeto siempre en la tercera.
 *
 * Abre además el contenedor de consulta (`containerType: 'size'`) del que
 * cuelga la escala del numeral: sin él las unidades `cqh` no resuelven y el
 * número se queda en el suelo del clamp.
 *
 * `contexto` y `apoyos` admiten `null` — la fila se reserva igual. Eso es lo
 * que mantiene la banda quieta entre formatos.
 */
export function MarcoVivo({
  cromo,
  contexto,
  sujeto,
  apoyos,
  accion,
  horizontal = false,
}: {
  cromo?: ReactNode;
  contexto?: ReactNode;
  sujeto: ReactNode;
  apoyos?: ReactNode;
  accion?: ReactNode;
  horizontal?: boolean;
}) {
  // En horizontal el alto es 402 pt y una banda de 340 no cabe: ahí el marco
  // degrada a `centra` (§6.1) y reparte, que es lo que la regla manda cuando la
  // estrategia ya no puede sostenerse. La voz (tinte, numeral, acción) no cambia.
  const filas = horizontal
    ? `auto auto minmax(0, 1fr) auto ${BANDA.accion}px`
    : `${BANDA.cromo}px ${BANDA.contexto}px ${BANDA.sujeto}px minmax(0, 1fr) ${BANDA.accion}px`;

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'grid',
        gridTemplateRows: filas,
        // UNA columna, y del ANCHO DEL TELÉFONO. La columna implícita que sale
        // sola es `auto`, y `auto` crece hasta el max-content de lo que caiga
        // dentro: basta una línea larga con `nowrap` (la clave de un ejercicio)
        // para que la rejilla mida 901 pt sobre un lienzo de 402 y se salgan
        // TODAS las filas a la vez, el sujeto y la acción incluidos. Es el mismo
        // fallo que el numeral ya tenía resuelto con su presupuesto de ancho
        // (§10.2), un piso más arriba. `minmax(0, 1fr)` deja que lo que no cabe
        // se recorte dentro, que es lo que cada fila sabe hacer.
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: BANDA.hueco,
        padding: BANDA.hueco,
        boxSizing: 'border-box',
        containerType: 'size',
      }}
    >
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{cromo}</div>
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{contexto}</div>
      <BandaSujeto>{sujeto}</BandaSujeto>
      <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
        {apoyos}
      </div>
      <div style={{ minHeight: 0 }}>{accion}</div>
    </div>
  );
}

/**
 * El sujeto, dentro de la banda y centrado en ella.
 *
 * Sin superficie: el número manda DIRECTO sobre el lienzo teñido. Si una
 * pantalla necesita superficie bajo el sujeto, la regla del §10.4 es que esa
 * superficie sea la DOMINANTE de la pantalla (`dominante`), no una caja que
 * pese lo mismo que las tarjetas de debajo — que es justo lo que convertía el
 * «5» del AMRAP en un ítem más de la lista.
 */
export function BandaSujeto({
  children,
  dominante = false,
  onClick,
  etiquetaAccesible,
}: {
  children: ReactNode;
  /** La superficie que ES la pantalla: ocupa la banda entera y la corona el acento. */
  dominante?: boolean;
  /** Cuando el propio sujeto es lo que se toca (la ronda del AMRAP). */
  onClick?: () => void;
  etiquetaAccesible?: string;
}) {
  const contenido = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        textAlign: 'center',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );

  const piel: CSSProperties = dominante
    ? {
        position: 'relative',
        borderRadius: 20,
        overflow: 'hidden',
        // Nace del lienzo y se levanta apenas: es la superficie que manda, no
        // una tarjeta más. La regla de acento arriba es la que la corona.
        background: 'color-mix(in srgb, var(--twin-surface) 62%, transparent)',
        boxShadow: 'inset 0 1px 0 var(--twin-hairline-strong)',
      }
    : {};

  // Misma regla que el marco: una columna del ancho del lienzo, no del ancho de
  // lo más largo que caiga dentro. Sin esto, una línea de texto sin corte dentro
  // del sujeto arrastra la banda entera fuera del teléfono.
  const columna = 'minmax(0, 1fr)';

  const cuerpo = (
    <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: columna, placeItems: 'center', ...piel }}>
      {dominante && (
        <div
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--twin-accent)' }}
        />
      )}
      {contenido}
    </div>
  );

  if (!onClick) return cuerpo;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiquetaAccesible}
      style={{
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: columna,
        placeItems: 'center',
        border: 0,
        padding: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        ...piel,
      }}
    >
      {dominante && (
        <div
          aria-hidden
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--twin-accent)' }}
        />
      )}
      {contenido}
    </button>
  );
}

/** La etiqueta del sujeto — micro-versales, encima del numeral. */
export function EtiquetaSujeto({ children, tono = 'var(--twin-muted)' }: { children: ReactNode; tono?: string }) {
  return (
    <span
      className="t-readout-label"
      style={{ color: tono, letterSpacing: '0.16em', transition: 'color 600ms linear' }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// §10.6 · Lo que de verdad haces no va en gris
// ---------------------------------------------------------------------------

/**
 * EL TRABAJO — lo segundo más importante de la pantalla.
 *
 * En un EMOM el sujeto es el minuto drenando, pero lo que de verdad haces es
 * «10 de 12 cal». Hoy eso estaba más pequeño que el reloj y metido en un panel
 * gris aparte, como si fuera servicio. Lo secundario se pliega (§6, regla 4),
 * pero el trabajo no es secundario: va en el numeral `segundo`, en la tinta
 * normal y dentro de la banda, pegado al sujeto que lo gobierna.
 */
export function Trabajo({
  nombre,
  hecho,
  objetivo,
  unidad,
  tono = 'var(--twin-fg)',
}: {
  nombre: string;
  /** Nulo = no hay nada que lo cuente. Entonces manda el nombre y no se finge un 0 (§7). */
  hecho?: number | null;
  objetivo?: number | null;
  unidad?: string;
  tono?: string;
}) {
  const contable = hecho != null && objetivo != null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span
        style={{
          font: 'italic 800 20px/1.15 var(--twin-font-sans)',
          letterSpacing: '-0.01em',
          color: 'var(--twin-fg)',
        }}
      >
        {nombre}
      </span>
      {contable && (
        <Numeral escala="segundo" tono={tono} unidad={unidad}>
          {`${hecho} de ${objetivo}`}
        </Numeral>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La comparación honesta — lo que `vivo-erg` hacía bien y nadie más copiaba
// ---------------------------------------------------------------------------

/**
 * La diferencia contra el objetivo. Verde = vas mejor, y punto.
 *
 * Es la pieza que convierte un número suelto en una lectura: «1:54» obliga al
 * atleta a acordarse de su objetivo y restar de cabeza a 170 ppm; «+2 s vs
 * objetivo» ya está interpretado. Siempre se dice CONTRA QUÉ se compara —
 * un delta sin referente es un número que miente por omisión.
 */
export function Delta({
  valor,
  unidad,
  mejorEs,
  sufijo,
  textoNulo,
}: {
  valor: number | null;
  unidad: string;
  /** En ritmo, menos es mejor; en vatios, más. */
  mejorEs: 'menos' | 'mas';
  /** «vs objetivo» · «vs tu serie 1». Siempre se dice contra qué. */
  sufijo: string;
  /** Qué se lee cuando la diferencia es cero. Depende de contra qué compares. */
  textoNulo: string;
}) {
  if (valor == null) return null;
  const nulo = Math.abs(valor) < 0.5;
  const mejor = mejorEs === 'menos' ? valor < 0 : valor > 0;
  const color = nulo ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-danger)';
  const signo = valor > 0 ? '+' : '−';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 999,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        transition: 'background-color 400ms linear',
      }}
    >
      {/* Una cifra va en la voz de instrumento; «en el objetivo» NO es una
          cifra y monoespaciarla la disfraza de medida (§4). */}
      {nulo ? (
        <span style={{ font: '600 15px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{textoNulo}</span>
      ) : (
        <span className="t-readout-s" style={{ color, transition: 'color 400ms linear' }}>
          {`${signo}${Math.abs(Math.round(valor))} ${unidad}`}
        </span>
      )}
      <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{sufijo}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// §10.5 · La acción no pesa como el sujeto
// ---------------------------------------------------------------------------

/**
 * LA FRANJA DE ACCIÓN — anclada abajo, a una mano, y en su sitio de la jerarquía.
 *
 * «Terminar rodaje» o «Serie hecha» son la ACCIÓN: el sujeto es lo que MIRAS,
 * la acción es lo que TOCAS. Por eso el contorno es el estado normal y el
 * relleno naranja es la excepción — no al revés, que es como estaba y por lo
 * que 96 pt de naranja macizo eran la mayor mancha de color de la pantalla.
 *
 * `unicaSalida` = el relleno se gana SOLO cuando el toque es lo único que puede
 * cerrar el tramo (la fuerza la cierras tú; el rodaje lo cierra el hito). Así
 * el color deja de ser decoración y pasa a decir quién gobierna la transición,
 * que es exactamente la variable que separa estas vistas.
 */
export function FranjaAccion({
  titulo,
  onClick,
  unicaSalida = false,
  nota,
  style,
}: {
  titulo: string;
  onClick: () => void;
  /** El toque es lo ÚNICO que cierra el tramo: ahí, y solo ahí, manda el relleno. */
  unicaSalida?: boolean;
  /** Una línea bajo el rótulo, para lo que el botón sella. */
  nota?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={unicaSalida ? 'tw-btn-primary' : 'tw-btn-secondary'}
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 3,
        // 17 px es el tamaño de la CTA de la app. El EMOM la escribía a 26 y por
        // eso su acción gritaba más que el trabajo que anunciaba.
        fontSize: 17,
        fontStyle: 'italic',
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderRadius: 14,
        ...style,
      }}
    >
      <span>{titulo}</span>
      {nota && (
        <span
          style={{
            font: '600 10px/1 var(--twin-font-sans)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.7,
          }}
        >
          {nota}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// El cromo y la franja de contexto — lo que envuelve al sujeto y no se va nunca
// ---------------------------------------------------------------------------
//
// Nacieron privados en `screens/vivo-fortime/atoms.tsx` y subieron aquí el
// 10-ago, la primera vez que una SEGUNDA familia (el contador de muchas
// rondas) los necesitó: es la regla del kit, y es la que evitó que la app
// acabara con seis relojes y tres grafías del ritmo. Al subir, el rótulo del
// formato dejó de estar cableado a «FOR TIME» — un metcon por rondas y una
// simulación de carrera no se llaman igual, y el cromo no es quién para
// decidirlo.

function IconPausa({ reanudar }: { reanudar: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" aria-hidden>
      {reanudar ? (
        <path d="M4.5 3 13 8l-8.5 5V3Z" fill="currentColor" />
      ) : (
        <g fill="currentColor">
          <rect x="4" y="3" width="2.6" height="10" rx="1" />
          <rect x="9.4" y="3" width="2.6" height="10" rx="1" />
        </g>
      )}
    </svg>
  );
}

/**
 * La fila de cromo: pausar, de qué formato es esto y en qué tramo vas. Todo en
 * una línea de 34 pt (`BANDA.cromo`), con el mismo botón redondo en todas las
 * vistas, para que dos formatos del mismo entreno no tengan dos cromos.
 */
export function CromoFormato({
  formato,
  posicion,
  pausado,
  onPausa,
}: {
  /** El rótulo del formato, en versales: «FOR TIME» · «POR RONDAS». */
  formato: string;
  posicion: string;
  pausado: boolean;
  onPausa: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
      <button
        type="button"
        onClick={onPausa}
        aria-label={pausado ? 'Reanudar el entreno' : 'Pausar el entreno'}
        style={{
          width: BANDA.cromo,
          height: BANDA.cromo,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          color: 'var(--twin-muted)',
          cursor: 'pointer',
          padding: 0,
          flex: '0 0 auto',
        }}
      >
        <IconPausa reanudar={pausado} />
      </button>
      <span
        style={{
          font: 'italic 800 10px/1 var(--twin-font-sans)',
          letterSpacing: '0.12em',
          color: 'var(--twin-accent-text)',
          flex: '0 0 auto',
        }}
      >
        {formato}
      </span>
      <span
        style={{
          font: '600 12px/1 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pausado ? 'En pausa' : posicion}
      </span>
      <span style={{ flex: 1 }} />
    </div>
  );
}

/**
 * UN TIEMPO QUE DRENA, en la franja de contexto. El tope de un metcon es el caso
 * que lo estrenó; el descanso prescrito de una serie es el segundo, y es el
 * MISMO objeto: un total, lo que queda y si urge. Por eso no nace una segunda
 * barra —serían tres en la tanda contando la del rodaje— sino que esta admite
 * cómo se llama lo que drena.
 */
export interface CapEstado {
  totalS: number;
  restanteS: number;
  /** Último minuto: el contexto se pone naranja y lo dice. */
  urgente: boolean;
  /**
   * Qué es lo que drena, para el pie de la cifra. «de cap» por defecto, que es
   * de donde viene.
   *
   * `null` = la barra va SIN cifra, y es el caso del descanso de una serie: ahí
   * lo que queda ya gobierna la banda en el numeral, y escribir el mismo número
   * dos veces en la misma pantalla es como empiezan las tres grafías del ritmo
   * (§2). La barra sigue haciendo falta porque dice la FORMA —cuánto de lo
   * prescrito llevas— y eso el numeral no lo dice.
   */
  pie?: string | null;
}

/**
 * La franja que no desaparece jamás. El crono va en `t-readout-s` (22 pt): la
 * misma voz de instrumento que el sujeto, un escalón por debajo.
 *
 * El aviso del último minuto NO se escribe en una línea aparte — se dice en la
 * etiqueta del propio crono. Una sola redacción para las dos caras: la misma
 * frase escrita dos veces es como empiezan las tres grafías del ritmo (§2).
 */
export function ContextoFormato({ scoreS, cap }: { scoreS: number; cap?: CapEstado }) {
  const urgente = cap?.urgente ?? false;
  // «Último minuto» solo mientras QUEDA cap. Con el cap agotado el crono ya no
  // avisa de nada: es lo que tardaste, y la barra de al lado dice el resto.
  const avisa = urgente && (cap?.restanteS ?? 0) > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
        <span className="t-readout-s" style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)' }}>
          {reloj(scoreS)}
        </span>
        <span
          className="t-readout-label"
          style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-muted)', letterSpacing: '0.1em' }}
        >
          {avisa ? 'último minuto' : 'tu tiempo'}
        </span>
      </span>
      {cap ? <BarraCap {...cap} /> : <span style={{ flex: 1 }} />}
    </div>
  );
}

/**
 * El cap es lo único que se pinta como progreso, y puede: es tiempo, y el
 * tiempo se mide. Las repeticiones no llevan barra por la misma razón.
 */
function BarraCap({ totalS, restanteS, urgente, pie = 'de cap' }: CapEstado) {
  const usado = Math.min(1, Math.max(0, (totalS - restanteS) / totalS));
  const tinte = urgente ? 'var(--twin-accent)' : 'var(--twin-muted)';
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        role="img"
        aria-label={`${pie == null ? 'Descanso' : 'Cap'} de ${reloj(totalS)}. Quedan ${reloj(restanteS)}.`}
        style={{
          flex: 1,
          minWidth: 0,
          height: 4,
          borderRadius: 6,
          background: 'var(--twin-surface-sunken)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${usado * 100}%`, height: '100%', background: tinte, transition: 'width 500ms linear' }} />
      </div>
      {pie != null && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, flex: '0 0 auto' }}>
          <span className="t-readout-s" style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)' }}>
            {reloj(restanteS)}
          </span>
          <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{pie}</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apoyos — el tercer nivel, y el último
// ---------------------------------------------------------------------------

/**
 * Celda de servicio. Va en `t-readout-s` (22 px) y no más: tres o cuatro se
 * reparten 378 pt de ancho, y un cronómetro en `t-readout-m` se sale de su caja.
 * El dato sigue pesando más que su etiqueta (§4).
 */
export function Apoyo({
  etiqueta,
  valor,
  ausente,
  tono = 'var(--twin-fg)',
  pie,
}: {
  etiqueta: string;
  /** Nulo = el dato no se sabe todavía, y entonces manda `ausente` (§7). */
  valor: string | null;
  /**
   * Qué se lee cuando no hay dato: «sin reloj» · «aún no». Va en la voz de TEXTO
   * y no en la de instrumento — monoespacear lo que no se ha medido lo disfraza
   * de medida (§4). Es lo que `ApoyoVivo` ya hacía en Swift y al kit del doble le
   * faltaba: la fila del hierro tiene tres celdas y dos pueden llegar vacías.
   */
  ausente?: string;
  tono?: string;
  pie?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 6px',
        borderRadius: 10,
        // Translúcida: el tinte de zona tiene que verse DEBAJO de los apoyos,
        // o el ambiente se corta en una línea recta a media pantalla.
        background: 'color-mix(in srgb, var(--twin-surface) 78%, transparent)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      {valor != null ? (
        <span className="t-readout-s" style={{ color: tono, transition: 'color 600ms linear' }}>
          {valor}
        </span>
      ) : (
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {ausente ?? 'no se sabe'}
        </span>
      )}
      <span
        className="t-readout-label"
        style={{ color: 'var(--twin-muted)', textAlign: 'center', letterSpacing: '0.1em' }}
      >
        {etiqueta}
      </span>
      {/* El pie solo cuando hay dato: «ppm» debajo de «sin reloj» no dice nada. */}
      {pie && valor != null && (
        <span style={{ font: '500 10px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{pie}</span>
      )}
    </div>
  );
}

/** La fila de apoyos: tres celdas a lo ancho, que es lo que cabe legible. */
export function FilaApoyos({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>{children}</div>;
}
