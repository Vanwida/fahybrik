'use client';

// El armazón que comparten los cuatro estados de «Correr»: la caja que reparte
// el alto, la cabecera, la acción anclada, el velo de pausa y las dos cosas que
// hacen que la pantalla se sienta VIVA (el destello de un hito y el aviso que
// anuncia un parcial).
//
// Está aquí y no dentro de cada escena porque el sujeto cambia cuatro veces
// (zona, metros que faltan, cuenta atrás, espera) pero el reparto del alto y el
// sitio de la acción NO pueden cambiar: si el botón se mueve entre estados, a
// 3:50 y con una mano se falla.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CTA, Display, Label, RAD, RoundButton, SP } from '../../kit';
import { useTicker } from '../../sim';
import { IconoPausa, IconoPlay } from './atoms';
import type { Evento, EventoEnT } from './guion';

// ---------------------------------------------------------------------------
// Relojes y momentos
// ---------------------------------------------------------------------------

/**
 * Los segundos que llevas mirando, PAUSABLES. `useElapsed` del kit no sirve
 * aquí: cuenta desde que arrancó el ticker, así que al reanudar volvería a
 * cero. Aquí la pausa congela y la reanudación sigue donde estaba, que es lo
 * único que un cronómetro puede hacer.
 */
export function useRelojPausable(corriendo: boolean): number {
  const [t, setT] = useState(0);
  const base = useRef(0);
  const vivo = useRef(0);

  // Latest-ref en efecto: el compiler de React prohíbe escribir refs al pintar.
  useEffect(() => {
    vivo.current = t;
  });

  // El ticker es el compartido; lo único que se añade es el anclaje.
  useTicker(corriendo, (s) => setT(base.current + s));

  useEffect(() => {
    if (!corriendo) base.current = vivo.current;
  }, [corriendo]);

  return t;
}

/**
 * Un «momento»: algo que aparece, se ve y se va solo. Vale para el destello de
 * un hito y para el aviso de un parcial; la única diferencia es cuánto dura.
 * El `id` que añade sirve de `key`, que es lo que hace que la entrada se
 * reproduzca aunque el contenido sea idéntico dos veces seguidas.
 */
function useMomento<T extends object>(ms: number): [(T & { id: number }) | null, (v: T) => void] {
  const [momento, setMomento] = useState<(T & { id: number }) | null>(null);
  const contador = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lanzar = useCallback(
    (v: T) => {
      contador.current += 1;
      setMomento({ ...v, id: contador.current });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMomento(null), ms);
    },
    [ms],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return [momento, lanzar];
}

/** Un frame de margen para que la transición de entrada se vea de verdad. */
function useEntrada(): boolean {
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setDentro(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return dentro;
}

// ---------------------------------------------------------------------------
// El destello del hito
// ---------------------------------------------------------------------------

export interface Hito {
  /** La palabra que se queda un instante: «DESCANSO», «SERIE 4». */
  palabra: string;
  tono: string;
}

export function useDestello(): [(Hito & { id: number }) | null, (h: Hito) => void] {
  return useMomento<Hito>(1400);
}

/**
 * Cruzar los metros no es un cambio de pantalla cualquiera: es LO que gobierna
 * el entreno. Por eso se anuncia con un velo que baña el lienzo entero y una
 * palabra, y no con una transición discreta que se pierde mirando el suelo.
 */
export function Destello({ hito }: { hito: (Hito & { id: number }) | null }) {
  if (!hito) return null;
  return <VeloHito key={hito.id} palabra={hito.palabra} tono={hito.tono} />;
}

function VeloHito({ palabra, tono }: { palabra: string; tono: string }) {
  const ido = useEntrada();
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        background: `color-mix(in srgb, ${tono} 55%, transparent)`,
        opacity: ido ? 0 : 1,
        transition: 'opacity 1100ms ease-out',
      }}
    >
      <span
        style={{
          font: 'italic 800 46px/1 var(--twin-font-sans)',
          letterSpacing: '0.02em',
          color: 'var(--twin-fg)',
          transform: ido ? 'scale(1.18)' : 'scale(1)',
          transition: 'transform 1100ms ease-out',
        }}
      >
        {palabra}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El aviso del parcial
// ---------------------------------------------------------------------------

export interface Anuncio {
  titulo: string;
  dato: string;
  pie?: string;
}

export function useAnuncio(): [(Anuncio & { id: number }) | null, (a: Anuncio) => void] {
  return useMomento<Anuncio>(4200);
}

export function Aviso({ anuncio }: { anuncio: (Anuncio & { id: number }) | null }) {
  if (!anuncio) return null;
  return <AvisoVivo key={anuncio.id} anuncio={anuncio} />;
}

function AvisoVivo({ anuncio }: { anuncio: Anuncio }) {
  const dentro = useEntrada();
  return (
    <div
      style={{
        position: 'absolute',
        // Justo DEBAJO de la cabecera: un aviso que tape la pausa durante
        // cuatro segundos deja de cumplir «la pausa está siempre».
        top: 54,
        left: SP.m,
        right: SP.m,
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: RAD.l,
        background: 'var(--twin-surface-elevated)',
        border: '1px solid color-mix(in srgb, var(--twin-accent-text) 40%, transparent)',
        boxShadow: 'var(--twin-shadow-card)',
        opacity: dentro ? 1 : 0,
        transform: dentro ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 260ms ease-out, transform 260ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <Label size={10} color="var(--twin-accent-text)">
        {anuncio.titulo}
      </Label>
      <span style={{ flex: 1 }} />
      <span className="t-readout-s">{anuncio.dato}</span>
      {anuncio.pie && (
        <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{anuncio.pie}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabecera y acción
// ---------------------------------------------------------------------------

export function Cabecera({
  titulo,
  detalle,
  chips,
  pausado = false,
  onPausa,
  accion,
}: {
  titulo: string;
  detalle?: string;
  chips?: ReactNode;
  pausado?: boolean;
  /** Ausente = no hay nada corriendo que pausar (la espera de antes de empezar). */
  onPausa?: () => void;
  /** Lo que ocupa el sitio de la pausa cuando no hay pausa. */
  accion?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, flex: '0 0 auto', minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span
          style={{
            font: 'italic 800 13px/1 var(--twin-font-sans)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--twin-fg)',
            whiteSpace: 'nowrap',
          }}
        >
          {titulo}
        </span>
        {detalle && (
          <span style={{ font: '500 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
            {detalle}
          </span>
        )}
      </div>
      <span style={{ flex: 1 }} />
      {chips}
      {/* La pausa está SIEMPRE, en el mismo sitio, en todos los estados vivos. */}
      {onPausa && (
        <RoundButton onClick={onPausa} label={pausado ? 'Reanudar' : 'Pausar'}>
          {pausado ? <IconoPlay /> : <IconoPausa />}
        </RoundButton>
      )}
      {accion}
    </div>
  );
}

/**
 * Dispara cada evento UNA vez. La simulación se recalcula entera en cada tick
 * (es pura), así que la lista llega repetida y hay que acordarse de lo ya
 * anunciado. No vale filtrar por «los del último segundo»: al cerrar un tramo a
 * mano el evento nace en un segundo que ya pasó por aquí, y se perdería.
 */
export function useEventos(eventos: readonly EventoEnT[], manejar: (ev: Evento) => void): void {
  const vistos = useRef<Set<string>>(new Set());
  const manejarRef = useRef(manejar);
  useEffect(() => {
    manejarRef.current = manejar;
  });
  useEffect(() => {
    for (const e of eventos) {
      const clave = e.ev.tipo === 'km' ? `${e.t}:km:${e.ev.km}` : `${e.t}:cierra:${e.ev.idx}`;
      if (vistos.current.has(clave)) continue;
      vistos.current.add(clave);
      manejarRef.current(e.ev);
    }
  }, [eventos]);
}

/** La acción principal: 66 pt, ancha, y con estado apagado de verdad. */
export function AccionPrincipal({
  titulo,
  onClick,
  activo = true,
}: {
  titulo: string;
  onClick: () => void;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={activo ? onClick : undefined}
      disabled={!activo}
      className="tw-btn-primary"
      style={{
        width: '100%',
        height: 66,
        letterSpacing: '0.06em',
        background: activo ? 'var(--twin-accent)' : 'color-mix(in srgb, var(--twin-accent) 26%, transparent)',
        color: activo ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
        boxShadow: activo ? 'var(--twin-shadow-card)' : 'none',
        cursor: activo ? 'pointer' : 'default',
      }}
    >
      {titulo}
    </button>
  );
}

// ---------------------------------------------------------------------------
// El velo de pausa
// ---------------------------------------------------------------------------

export function VeloPausa({ nota, onReanudar }: { nota: string; onReanudar: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--twin-scrim)',
        padding: SP.l,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m, maxWidth: 300, textAlign: 'center' }}>
        <Display size={30}>EN PAUSA</Display>
        <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{nota}</span>
        <CTA title="REANUDAR" onClick={onReanudar} height={54} style={{ minWidth: 220 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La caja: cómo se reparte el alto (§6.1 · gobierna)
// ---------------------------------------------------------------------------

/**
 * Un dato manda y ESCALA hasta llenar; el resto se subordina. En vertical el
 * sujeto se queda con todo el centro y los apoyos son una tira baja. En
 * horizontal el sujeto se va a su columna y la derecha se lleva los apoyos y la
 * acción, para que el número siga siendo enorme con 402 pt de alto.
 */
export function Escena({
  horizontal,
  cabecera,
  sujeto,
  apoyos,
  accion,
  velo,
  sobreimpreso,
}: {
  horizontal: boolean;
  cabecera: ReactNode;
  sujeto: ReactNode;
  apoyos?: ReactNode;
  accion?: ReactNode;
  /** Velo de pausa: tapa el lienzo entero cuando está. */
  velo?: ReactNode;
  /** Destellos y avisos, que van por encima de todo y no capturan toques. */
  sobreimpreso?: ReactNode;
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: SP.m,
        padding: `${SP.s}px ${SP.m}px ${SP.m}px`,
        // El sujeto escala con el LIENZO gracias a esto (ver `Cifra`).
        containerType: 'size',
      }}
    >
      {cabecera}
      {horizontal ? (
        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: SP.l, alignItems: 'stretch' }}>
          <div style={{ flex: '1.25 1 0', minWidth: 0, display: 'grid', placeItems: 'center' }}>{sujeto}</div>
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: SP.s }}>
            {apoyos}
            {accion}
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>{sujeto}</div>
          {apoyos}
          {accion}
        </>
      )}
      {velo}
      {sobreimpreso}
    </div>
  );
}
