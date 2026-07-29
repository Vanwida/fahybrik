'use client';

// Los átomos de la familia AMRAP.
//
// El número de la ronda ya NO se escribe aquí a mano. Vivía a `Mono size={144}`
// —el doble del techo de la escala de twin.css— con un comentario explicando
// por qué se saltaba la escala, y el sellado usaba 96 y 72 en otros dos sitios:
// cuatro tamaños para el mismo marcador. Ahora todo pasa por `Numeral`
// (§10.2), que escala con el lienzo y tiene DOS peldaños: `sujeto` cuando la
// ronda gobierna y `segundo` cuando cede ante el monitor. Ceder de tamaño sin
// desaparecer sigue siendo la regla; lo que cambia es que el tamaño lo pone la
// escala y no cada cara.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconClose, Label, RAD } from '../../kit';
import { BandaSujeto, EtiquetaSujeto, Numeral } from '../../kit-vivo';

// ---------------------------------------------------------------------------
// La confirmación gorda — «la pantalla late» al sumar una ronda
// ---------------------------------------------------------------------------

/**
 * Verdadero a partir del primer fotograma pintado. Sirve para arrancar un
 * elemento en su estado tenso y dejar que la transición lo relaje: dos
 * `requestAnimationFrame` porque un `useEffect` disparado por un toque se
 * ejecuta ANTES de que el navegador pinte, y entonces no habría transición
 * ninguna (los dos estilos caerían en el mismo fotograma).
 *
 * Quien lo usa se remonta con `key`, así cada ronda vuelve a tensar.
 */
function useTrasPintar(): boolean {
  const [pintado, setPintado] = useState(false);
  useEffect(() => {
    let interno = 0;
    const externo = requestAnimationFrame(() => {
      interno = requestAnimationFrame(() => setPintado(true));
    });
    return () => {
      cancelAnimationFrame(externo);
      cancelAnimationFrame(interno);
    };
  }, []);
  return pintado;
}

/** El latido: un golpe de luz naranja sobre TODO el lienzo. Se ve de reojo. */
export function Destello() {
  const ido = useTrasPintar();
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: RAD.xl,
        background:
          'radial-gradient(120% 70% at 50% 50%, color-mix(in srgb, var(--twin-accent) 38%, transparent), transparent 72%)',
        opacity: ido ? 0 : 1,
        transition: 'opacity 560ms ease-out',
      }}
    />
  );
}

/** El golpe del número: entra grande y se asienta. Remonta con `key`. */
export function Golpe({ children }: { children: ReactNode }) {
  const asentado = useTrasPintar();
  return (
    <span
      style={{
        display: 'inline-block',
        transform: asentado ? 'scale(1)' : 'scale(1.16)',
        transition: 'transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cromo — salir se mantiene pulsado, pausar es un toque
// ---------------------------------------------------------------------------

/**
 * Salir de un AMRAP a mitad borra el marcador, y el botón vive a un palmo de
 * una zona de toque enorme que se aporrea con la mano sudada. Así que no se
 * toca: se mantiene. El relleno naranja crece durante la pulsación y es la
 * única confirmación que hace falta.
 */
function BotonMantener({
  label,
  onCompletar,
  ms = 700,
  children,
}: {
  label: string;
  onCompletar: () => void;
  ms?: number;
  children: ReactNode;
}) {
  const [pulsando, setPulsando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const soltar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setPulsando(false);
  }, []);

  useEffect(() => soltar, [soltar]);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => {
        setPulsando(true);
        temporizador.current = setTimeout(() => {
          soltar();
          onCompletar();
        }, ms);
      }}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      // Con teclado sale directo: lo que se defiende es el roce del dedo
      // sudado contra el borde, no la pulsación deliberada de una tecla.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onCompletar();
      }}
      style={{
        position: 'relative',
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        color: pulsando ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        flex: '0 0 auto',
        transition: 'color 200ms linear',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--twin-accent)',
          transform: pulsando ? 'scale(1)' : 'scale(0)',
          transition: `transform ${pulsando ? ms : 160}ms linear`,
        }}
      />
      <span style={{ position: 'relative', display: 'inline-flex' }}>{children}</span>
    </button>
  );
}

export function TopCromo({
  pausado,
  ventanaTotal,
  onPausa,
  onSalir,
}: {
  pausado: boolean;
  /** La ventana entera, no la que queda: es la prescripción, no el estado. */
  ventanaTotal: string;
  onPausa: () => void;
  onSalir: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flex: '0 0 auto' }}>
      <BotonMantener label="Mantén pulsado para salir del entreno" onCompletar={onSalir}>
        <IconClose size={13} />
      </BotonMantener>
      <button
        type="button"
        aria-label={pausado ? 'Seguir el entreno' : 'Pausar el entreno'}
        onClick={onPausa}
        style={{
          width: 34,
          height: 34,
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
          font: '700 15px/1 var(--twin-font-sans)',
        }}
      >
        {pausado ? '▶' : '‖'}
      </button>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span
          style={{
            font: 'italic 800 9px/1.1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            color: 'var(--twin-accent-text)',
          }}
        >
          AMRAP
        </span>
        {/* «AMRAP 12:00» es el lead canónico de la prescripción
            (shared/domain/prescription/to-text.ts): el formato y su ventana. */}
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.08em' }}>
          {ventanaTotal}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La ventana, en número — la fila de contexto
// ---------------------------------------------------------------------------

/**
 * El aro ya dice cuánto queda de un vistazo; esto es para cuando quieres el
 * dato exacto. Va en la fila `contexto` de `MarcoVivo`, en la misma voz y el
 * mismo escalón que el crono del For Time: la ventana gobierna el entreno, pero
 * no es el sujeto — el sujeto es la ronda, porque es lo que decide si aprietas.
 *
 * Ya no crece de 34 a 48 a 72 según aprieta. Crecer era su manera de gritar
 * cuando no había ambiente que lo dijera; ahora lo dicen el aro caliente, el
 * naranja y el aliento, y el sujeto se queda quieto en su banda (§10.3).
 */
export function VentanaReadout({
  texto,
  caliente,
  aliento,
}: {
  texto: string;
  caliente: boolean;
  aliento: string | null;
}) {
  const tinte = caliente ? 'var(--twin-accent-text)' : 'var(--twin-fg)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', minWidth: 0 }}>
      <span className="t-readout-s" style={{ color: tinte, transition: 'color 500ms linear' }}>
        {texto}
      </span>
      <span
        className="t-readout-label"
        style={{
          color: caliente ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
          letterSpacing: '0.1em',
          flex: '0 0 auto',
        }}
      >
        quedan
      </span>
      {aliento && (
        <span
          style={{
            font: '600 13px/1.2 var(--twin-font-sans)',
            color: 'var(--twin-accent-text)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {aliento}
        </span>
      )}
      <span style={{ flex: 1 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El marcador — y es el botón
// ---------------------------------------------------------------------------

/**
 * La superficie DOMINANTE del §10.4: ocupa la banda entera, la corona la regla
 * de acento y se toca. Ese es el trato — un contenedor alrededor del
 * protagonista solo se gana si manda sobre todo lo demás en tamaño y en
 * jerarquía, y aquí se gana porque en un AMRAP el sujeto ES el botón: la ronda
 * se cierra tocando el marcador con el móvil en el suelo.
 *
 * El envoltorio existe porque `MarcoVivo` mete el `sujeto` dentro de su propia
 * `BandaSujeto` sin superficie; para que la dominante llene la banda hay que
 * darle el alto y el ancho de la fila antes de entrar en ella.
 */
export function MarcadorTocable({
  onClick,
  etiqueta,
  children,
}: {
  onClick: () => void;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'grid' }}>
      <BandaSujeto dominante onClick={onClick} etiquetaAccesible={etiqueta}>
        {children}
      </BandaSujeto>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El núcleo de la ronda — el mismo en las dos caras
// ---------------------------------------------------------------------------

/**
 * Lo que se toca y lo que dice el marcador. Vive aquí, y no dentro de cada
 * cara, porque vertical y horizontal tienen que enseñar la MISMA ronda: si se
 * escribiera dos veces, girar el móvil acabaría cambiando el número de sitio,
 * de tamaño y de redacción, que es como se pierde la confianza en un marcador.
 *
 * `cede` es lo único que cambia entre caras, y cambia por una razón: la ronda
 * baja al peldaño `segundo` cuando manda el monitor, y no desaparece. Ceder el
 * tamaño no es ceder el sitio.
 */
export function NucleoRonda({
  rondas,
  repsMarcadas,
  compara,
  cede = false,
  horizontal = false,
}: {
  rondas: number;
  repsMarcadas: number;
  compara: { indice: number; texto: string; deltaS: number } | null;
  /** El monitor gobierna esta cara: la ronda baja un peldaño. */
  cede?: boolean;
  horizontal?: boolean;
}) {
  return (
    <>
      <EtiquetaSujeto>Rondas</EtiquetaSujeto>
      <Golpe key={rondas}>
        <Numeral horizontal={horizontal} escala={cede ? 'segundo' : 'sujeto'}>
          {rondas}
        </Numeral>
      </Golpe>

      {repsMarcadas > 0 && (
        <span className="t-readout-s" style={{ color: 'var(--twin-accent-text)' }}>
          +{repsMarcadas} reps
        </span>
      )}

      {compara && (
        <span
          style={{
            font: '500 13px/1.3 var(--twin-font-sans)',
            color: 'var(--twin-muted)',
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          {`ronda ${compara.indice} · `}
          <span style={{ color: compara.deltaS > 0 ? 'var(--twin-warning)' : 'var(--twin-ok)', fontWeight: 700 }}>
            {compara.texto}
          </span>
        </span>
      )}
    </>
  );
}

/** El reloj parado, encima de todo. Igual en las dos caras. */
export function CapaPausa({ onSeguir }: { onSeguir: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--twin-scrim)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
    >
      <Label size={11}>En pausa</Label>
      <span style={{ font: 'italic 800 28px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        El reloj está parado
      </span>
      <button type="button" onClick={onSeguir} className="tw-btn-primary" style={{ width: '100%', height: 64 }}>
        SEGUIR
      </button>
    </div>
  );
}
