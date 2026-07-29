'use client';

// Lo que comparten los cuatro estados de «Correr» y NO es del lenguaje común:
// la cabecera, el velo de pausa y las dos cosas que hacen que la pantalla se
// sienta VIVA (el destello de un hito y el aviso que anuncia un parcial).
//
// El reparto del alto y el sitio de la acción ya NO se deciden aquí: los pone
// `MarcoVivo` + `FranjaAccion` de `../../kit-vivo`, para que el sujeto caiga a
// la misma altura en las diez vistas en vivo y no solo en las cuatro de correr
// (§10.3). Aquí había un `Escena` y un `AccionPrincipal` propios; eran la
// versión de correr de lo que ahora es de todos.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CTA, Display, Label, RAD, RoundButton, SP } from '../../kit';
import { BANDA, MarcoVivo } from '../../kit-vivo';
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
// La capa: el marco del §10 más lo que va POR ENCIMA de él
// ---------------------------------------------------------------------------

/**
 * `MarcoVivo` reparte el alto, pero el destello, el aviso y el velo de pausa no
 * son filas: flotan sobre el lienzo. Esta capa es solo el contexto de
 * posicionamiento que necesitan, dentro del safe area y no del marco del móvil
 * (un velo que tape el notch tapa también la hora).
 */
export function CapaVivo({ marco, velo, sobreimpreso }: { marco: ReactNode; velo?: ReactNode; sobreimpreso?: ReactNode }) {
  return (
    <div className="twin-screen-safe">
      <div style={{ position: 'relative', height: '100%' }}>
        {marco}
        {velo}
        {sobreimpreso}
      </div>
    </div>
  );
}

/**
 * EL MARCO DE CORRER — `MarcoVivo` en vertical, dos columnas al girar.
 *
 * En vertical no hay nada propio: la banda, el numeral y la acción son las del
 * §10 y el sujeto cae a los mismos 345 pt que en el ergo.
 *
 * Girado sí hay algo propio, y por la misma razón que el ergo tiene su cara de
 * monitor: con 402 pt de alto la banda de 340 no cabe, y la degradación a una
 * columna que hace `MarcoVivo` deja al sujeto ~50 pt y lo monta encima de los
 * apoyos. Aquí el sujeto se va a su columna y la derecha se lleva los apoyos y
 * la acción, que es lo que ya hacía esta pantalla. Lo que NO cambia al girar es
 * la voz: mismo tinte, mismo numeral, misma franja de acción.
 */
export function MarcoCorrer({
  horizontal,
  cromo,
  contexto,
  sujeto,
  apoyos,
  accion,
}: {
  horizontal: boolean;
  cromo?: ReactNode;
  contexto?: ReactNode;
  sujeto: ReactNode;
  apoyos?: ReactNode;
  accion?: ReactNode;
}) {
  if (!horizontal) {
    return <MarcoVivo cromo={cromo} contexto={contexto} sujeto={sujeto} apoyos={apoyos} accion={accion} />;
  }
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: BANDA.hueco,
        padding: BANDA.hueco,
        // El numeral escala con el LIENZO, y aquí no hay `MarcoVivo` que abra
        // el contenedor de consulta: lo abre este marco (§10.2).
        containerType: 'size',
      }}
    >
      {cromo}
      {contexto}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: SP.l, alignItems: 'stretch' }}>
        <div style={{ flex: '1.25 1 0', minWidth: 0, display: 'grid', placeItems: 'center' }}>{sujeto}</div>
        <div
          style={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: SP.s,
          }}
        >
          {apoyos}
          {accion && <div style={{ height: BANDA.accion, flex: '0 0 auto' }}>{accion}</div>}
        </div>
      </div>
    </div>
  );
}
