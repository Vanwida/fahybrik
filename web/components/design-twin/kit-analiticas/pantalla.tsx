'use client';

// LA PANTALLA DE ANALÍTICAS — el cascarón de todas las del iPhone con el diseño
// de «Hoy · El día»: sobretítulo de acento y título en cursiva pesada (como
// Plan y Carreras), el selector de ventana que se pega arriba al bajar (una
// sola ventana rige la pestaña, A4, y siempre se ve cuál), el SUJETO a todo el
// ancho y debajo las secciones. Altura `llena` (CONTRATO-UI §6.1): el sobrante
// entra en el sujeto, jamás en una cola muerta.
//
//   PantallaAnaliticas   sobretítulo + título + ventana + sujeto + secciones + barra de pestañas
//   SelectorVentana      7 d · 4 sem · 12 sem · 6 m · 1 a · Todo
//   Segmento             el mismo conmutador para Carga · Horas, Remo · Ski · Bici…
//   Seccion              título de sección de «El día» + la pregunta + «›» al detalle
//   Glosa / useGlosa     la hoja del glosario (A5), a un toque

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pantalla, TabBar } from '../kit-composicion/chrome';
import { IcoChevron } from '../kit-dia/iconos';
import { Etiqueta as EtiquetaMayus, Pastilla, TituloSeccion } from '../kit-dia/piezas';
import { fuente, MARGEN, RADIO, TABULAR, TAM, TOQUE, velo } from '../kit-dia/tokens';
import { VENTANAS, VENTANA_ETIQUETA, VENTANA_FRASE, type Ventana } from './contrato';
import { EstilosAnaliticas } from './estilos';
import { unirUnidades } from './fmt';
import { GLOSARIO } from './metodo';
import { Cuerpo, Etiqueta } from './piezas';
import { ENTRE_SECCIONES } from './tokens';

// ---------------------------------------------------------------------------
// El conmutador
// ---------------------------------------------------------------------------

/**
 * Un conmutador de contorno con el elegido en el acento del club (el mismo
 * segmentado de Carreras). Cada opción nace del ancho de su texto más su aire y
 * crece a partes iguales con lo que sobra: a 390 pt «12 sem» cabe entero.
 * `completo` lo estira a lo ancho; sin él ocupa lo que ocupan sus textos. `compacto` recorta el aire de cada opción
 * (seis periodos a 390 pt): ninguna baja de 44 pt de ancho. Si aun así no caben, la tira se desliza.
 */
export function Segmento<V extends string>({ items, valor, onCambio, etiqueta, completo = false, compacto = false }: { items: Array<{ id: V; texto: string }>; valor: V; onCambio: (v: V) => void; etiqueta: string; completo?: boolean; compacto?: boolean }) {
  const cinta = useRef<HTMLDivElement>(null);
  // Si la tira se desliza, la opción elegida se mantiene a la vista (solo en horizontal: la página no se mueve).
  useEffect(() => {
    const c = cinta.current;
    const b = c?.querySelector<HTMLElement>('[aria-checked=true]');
    if (!c || !b || c.scrollWidth <= c.clientWidth) return;
    const rc = c.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (rb.left < rc.left) c.scrollLeft += rb.left - rc.left - 8;
    else if (rb.right > rc.right) c.scrollLeft += rb.right - rc.right + 8;
  }, [valor]);
  return (
    <div
      ref={cinta}
      role="radiogroup"
      aria-label={etiqueta}
      className="an-cinta"
      style={{
        display: completo ? 'flex' : 'inline-flex',
        gap: 4,
        padding: 4,
        boxSizing: 'border-box',
        maxWidth: '100%',
        // Si las opciones no caben (cuatro ejercicios con nombre propio), la tira se desliza; nunca ensancha la pantalla.
        overflowX: 'auto',
        borderRadius: RADIO.fila,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline-strong)',
      }}
    >
      {items.map((it, i) => {
        const activo = it.id === valor;
        return (
          <button
            key={it.id}
            type="button"
            className="hd-toque an-radio"
            role="radio"
            aria-checked={activo}
            // Patrón de radio de ARIA: un solo tope en el Tab (el elegido) y las flechas mueven la elección.
            tabIndex={activo ? 0 : -1}
            onKeyDown={(e) => {
              const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!paso) return;
              e.preventDefault();
              const j = (i + paso + items.length) % items.length;
              onCambio(items[j]!.id);
              (e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=radio]')[j])?.focus();
            }}
            onClick={() => onCambio(it.id)}
            style={{
              width: 'auto',
              flex: completo ? '1 1 auto' : '0 0 auto',
              minWidth: 44,
              minHeight: 44,
              padding: compacto ? '0 8px' : '0 14px',
              boxSizing: 'border-box',
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              background: activo ? 'var(--twin-accent)' : 'transparent',
              color: activo ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
              ...fuente(700, TAM.suelo, 1),
              ...TABULAR,
            }}
          >
            {it.texto}
          </button>
        );
      })}
    </div>
  );
}

function SelectorVentana({ valor, onCambio }: { valor: Ventana; onCambio: (v: Ventana) => void }) {
  return <Segmento items={VENTANAS.map((v) => ({ id: v, texto: VENTANA_ETIQUETA[v] }))} valor={valor} onCambio={onCambio} etiqueta="Periodo" completo compacto />;
}

/** Si el selector está pegado arriba (el contenido pasa por debajo): entonces lleva su raya. */
function usePegado() {
  const ref = useRef<HTMLDivElement>(null);
  const [pegado, setPegado] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // El selector se pega a -1 px: pegado, queda 1 px por encima del borde y deja de verse entero.
    const io = new IntersectionObserver(([e]) => setPegado(e!.intersectionRatio < 1), { threshold: [1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, pegado };
}

// ---------------------------------------------------------------------------
// La pantalla
// ---------------------------------------------------------------------------

/** El cromo de un detalle: «‹ Analíticas» a la izquierda, fijo. Un detalle no lleva la barra de pestañas. */
function Atras({ texto, onTap }: { texto: string; onTap: () => void }) {
  return (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
      <button
        type="button"
        className="hd-toque"
        onClick={onTap}
        aria-label={`Volver a ${texto}`}
        style={{ width: 'auto', minHeight: TOQUE, padding: '0 14px 0 8px', borderRadius: RADIO.pastilla, display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--twin-accent-text)', ...fuente(700, TAM.cuerpo, 1) }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 5-7 7 7 7" />
        </svg>
        {texto}
      </button>
    </div>
  );
}

export function PantallaAnaliticas({
  titulo,
  sobretitulo,
  ventana,
  onVentana,
  sujeto,
  atras,
  children,
  pestana = 'Analíticas',
  sinVentana = false,
  hoja = null,
}: {
  titulo: string;
  /** Encima del título, en el acento del club. Sin él, la ventana dicha en una frase. */
  sobretitulo?: string;
  ventana: Ventana;
  onVentana: (v: Ventana) => void;
  /** LO ÚNICO GRANDE de la pantalla (el Estado en la portada; la marca clave en un detalle). Absorbe el sobrante de altura. */
  sujeto?: ReactNode;
  /** Un detalle lleva «‹ Analíticas» y no la barra de pestañas. */
  atras?: { texto: string; onTap: () => void };
  children: ReactNode;
  /** Cómo se llama la pestaña en la barra (§11.1: «Analíticas» o «Progreso»). */
  pestana?: string;
  /** Una sesión es un día: no obedece a la ventana y no la enseña. */
  sinVentana?: boolean;
  /** Una hoja modal abierta: la pantalla queda inerte debajo. */
  hoja?: ReactNode;
}) {
  const { ref: refPega, pegado } = usePegado();
  return (
    <div className="twin-screen-safe an-raiz">
      <EstilosAnaliticas />
      <div inert={hoja != null} aria-hidden={hoja != null ? true : undefined} style={{ height: '100%' }}>
        <Pantalla
          estrategia="llena"
          cabecera={atras ? <Atras texto={atras.texto} onTap={atras.onTap} /> : undefined}
          tabBar={!atras ? <TabBar activa="Analíticas" renombrar={pestana !== 'Analíticas' ? { Analíticas: pestana } : undefined} /> : undefined}
        >
          <div style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 22, padding: `${atras ? 0 : 6}px ${MARGEN}px 32px` }}>
            <header className="hd-sube" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <EtiquetaMayus color="var(--twin-accent-text)">{sobretitulo ?? (sinVentana ? '' : VENTANA_FRASE[ventana])}</EtiquetaMayus>
              <h1 style={{ margin: 0, ...fuente(800, TAM.saludo, 1.1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', textWrap: 'balance' }}>{unirUnidades(titulo)}</h1>
            </header>

            {!sinVentana ? (
              <div ref={refPega} className="an-pega" data-pegado={pegado} style={{ margin: `-10px -${MARGEN}px`, padding: `10px ${MARGEN}px`, top: -1, background: 'var(--twin-bg)' }}>
                <SelectorVentana valor={ventana} onCambio={onVentana} />
              </div>
            ) : null}

            {sujeto ? (
              <div className="hd-sube" style={{ '--i': 1, display: 'flex', flexDirection: 'column', flex: '1 0 auto' } as CSSProperties}>
                {sujeto}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: ENTRE_SECCIONES }}>{children}</div>
          </div>
        </Pantalla>
      </div>
      {hoja}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La sección
// ---------------------------------------------------------------------------

/**
 * Título de sección de «El día» (24 px, cursiva pesada) + la pregunta que
 * responde + «›» al detalle cuando lo hay. El accesorio (un conmutador) va en
 * su propia fila: nunca robándole sitio al título (que se partía en dos líneas).
 */
export function Seccion({ titulo, pregunta, onAbrir, children, accesorio }: { titulo: string; pregunta?: string; onAbrir?: () => void; children: ReactNode; accesorio?: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <TituloSeccion
          aparte={
            onAbrir ? (
              <button
                type="button"
                className="hd-toque"
                onClick={onAbrir}
                aria-label={`Abrir ${titulo}`}
                style={{ width: 44, height: 44, margin: '-6px -6px -6px 0', borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--twin-muted)' }}
              >
                <IcoChevron tam={20} />
              </button>
            ) : undefined
          }
        >
          {titulo}
        </TituloSeccion>
        {pregunta ? <Etiqueta>{pregunta}</Etiqueta> : null}
      </div>
      {accesorio ? <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{accesorio}</div> : null}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// La glosa (A5): a un toque, en una hoja
// ---------------------------------------------------------------------------

/**
 * La hoja del glosario: nombres nuestros con la sigla de TrainingPeaks al lado.
 * Modal de verdad: foco al cerrar, Escape cierra, tocar el velo cierra y el
 * fondo queda inerte (lo hace `PantallaAnaliticas` con `hoja`).
 */
export function Glosa({ onCerrar }: { onCerrar: () => void }) {
  const id = useId();
  const cierre = useRef<HTMLButtonElement>(null);
  const cerrar = useRef(onCerrar);
  // Quién tenía el foco ANTES de abrir, tomado en el primer render: en un efecto llegaría tarde (al abrirse la
  // hoja, la pantalla queda inerte y el foco ya se ha ido al cuerpo de la página).
  const [previo] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    cerrar.current = onCerrar;
  });
  useEffect(() => {
    cierre.current?.focus({ preventScroll: true });
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar.current();
      }
    };
    document.addEventListener('keydown', alTecla, true);
    return () => {
      document.removeEventListener('keydown', alTecla, true);
      previo?.focus?.({ preventScroll: true });
    };
  }, [previo]);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button type="button" tabIndex={-1} aria-hidden onClick={onCerrar} className="an-velo" style={{ position: 'absolute', inset: 0, border: 0, padding: 0, margin: 0, background: 'var(--twin-scrim)', cursor: 'default' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="an-hoja"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92%',
          boxSizing: 'border-box',
          background: 'var(--twin-bg)',
          borderRadius: `${RADIO.grande}px ${RADIO.grande}px 0 0`,
          border: '1px solid var(--twin-hairline-strong)',
          borderBottom: 0,
          boxShadow: 'var(--twin-shadow-hero)',
          overflow: 'hidden',
        }}
      >
        <span aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8, background: velo('var(--twin-fg)', 24) }} />
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 8px 4px 20px', minHeight: 56 }}>
          <h2 id={id} style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>
            Qué significa cada número
          </h2>
          <button ref={cierre} type="button" className="hd-toque" onClick={onCerrar} aria-label="Cerrar" style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'var(--twin-fg)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, padding: `0 ${MARGEN}px calc(var(--twin-safe-bottom) + 20px)`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ borderRadius: RADIO.tarjeta, background: 'var(--twin-surface)', border: '1px solid var(--twin-hairline)', overflow: 'hidden' }}>
            {GLOSARIO.map((g, i) => (
              <div key={g.termino} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: i > 0 ? '1px solid var(--twin-hairline)' : undefined }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cuerpo fuerte>{g.termino}</Cuerpo>
                  {g.sigla ? (
                    <Pastilla fondo={velo('var(--twin-fg)', 7)} tinta="var(--twin-muted)" borde={velo('var(--twin-fg)', 16)}>
                      {g.sigla}
                    </Pastilla>
                  ) : null}
                </span>
                <Cuerpo tono="var(--twin-muted)">{g.que_es}</Cuerpo>
              </div>
            ))}
          </div>
          <Etiqueta>Los días de forma y fatiga, las bandas y los umbrales los fija tu coach.</Etiqueta>
        </div>
      </div>
    </div>
  );
}

/** El gancho de la glosa: quién la abre y quién la cierra, para no repetirlo en cada pantalla. */
export function useGlosa(onLog?: (l: string) => void) {
  const [abierta, setAbierta] = useState(false);
  return {
    abierta,
    abrir: () => {
      setAbierta(true);
      onLog?.('Glosa abierta: Forma, Fatiga, Frescura, Carga, Motor, Disposición');
    },
    cerrar: () => setAbierta(false),
  };
}
