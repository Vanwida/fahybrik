'use client';

// EL LIENZO DE LA MUÑECA — un solo sitio donde se decide cuánto mide cada cosa.
//
// Las nueve vistas no dibujan: DECLARAN sus páginas (`PaginaReloj[]`) y el
// lienzo hace la aritmética. Eso es lo que impide que salgan nueve escalas
// distintas del mismo número, que es exactamente lo que pasó en el dashboard.
//
// Lo que el lienzo hace cumplir, y por eso ninguna vista puede saltárselo:
//
//  1. **El modo manda sobre el formato.** En `ojeada` la franja de acción NO SE
//     PINTA aunque la vista la declare: corriendo no hay controles, y esos 15 pt
//     vuelven al sujeto. En `ciego` la acción se pinta ATENUADA — es una oferta
//     en reposo, no una petición.
//  2. **El tamaño del sujeto lo calcula `altoSujeto`,** restando los apoyos que
//     la página declara y aplicando el límite del ancho. Ninguna vista escribe
//     un tamaño de fuente.
//  3. **Sin ancla de FC no hay tinte.** El color es un dato (§7, §10.1).
//  4. **Un sujeto por página y un segundo nivel. No hay tercero.** Lo que no
//     cabe no encoge: se va a la página siguiente, y el deslizamiento es
//     material de diseño, no un último recurso.
//
// LA PANTALLA ES EL BOTÓN: el reloj de hoy gasta 52 pt de alto (el 21 % del
// lienzo) en un botón grande, y por eso su héroe se queda en 54 px. Aquí el
// gesto lo recoge toda el área de contenido y esos 52 pt vuelven al sujeto.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Numeral, SegundoNivel, Versales, sinMovimiento } from './numeral';
import {
  PERMITE,
  altoSujeto,
  apoyosDe,
  type EstadoDestello,
  type Modo,
  type PaginaReloj,
} from './modelo';
import { W } from '../screens/watch-live/theme';

export * from './modelo';
export * from './bisel';
export * from './paginas';
export { Numeral, SegundoNivel, Versales, versales, sinMovimiento, estimarSans, anchoVersales } from './numeral';

/**
 * Los tokens y los formateadores del reloj se reexportan DESDE AQUÍ, y las
 * nueve vistas no importan otra cosa que este kit.
 *
 * Viven en `screens/watch-live/` porque son el espejo literal de
 * `WatchTheme.swift` y de `WatchFormat`, y ahí es donde tienen que estar para
 * que se vea que espejan algo. Pero si nueve vistas tiran de una PANTALLA para
 * conseguir sus colores, mover ese espejo rompe nueve ficheros. Reexportando,
 * la flecha fea es UNA y está aquí.
 */
export { W, zoneColor, URGENT_THRESHOLD_S } from '../screens/watch-live/theme';
// Los formateadores van por `./formato`, que corrige la coma decimal que el
// espejo de Swift escribe como punto. Ver la cabecera de ese fichero.
export * from './formato';

export interface RelojProps {
  paginas: PaginaReloj[];
  /**
   * El tinte del lienzo: TU ZONA, a sangre. `null` = no hay ancla de FC, y
   * entonces el fondo es negro y no se insinúa ninguna zona.
   */
  tinte: string | null;
  /** El progreso, dibujado en el bisel. Cuesta cero altura de contenido. */
  bisel?: ReactNode;
  /** Sube `n` para un golpe de luz a pantalla completa (una transición). */
  destello?: EstadoDestello;
  onLog: (linea: string) => void;
}

// ---------------------------------------------------------------------------
// El lienzo
// ---------------------------------------------------------------------------

/** Tope del tinte de zona. Por encima el aro y las versales pierden contraste. */
const TINTE_MAX = 38;

export function tinte(color: string, pct = TINTE_MAX): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${W.bg})`;
}

/** Deslizamiento mínimo, en px, para que un arrastre cuente como cambio de página. */
const DESLIZ_MIN = 24;

export function Reloj({ paginas, tinte: color, bisel, destello, onLog }: RelojProps) {
  const [i, setI] = useState(0);
  // La página activa se acota en vez de indexar a lo loco: una vista puede
  // reducir sus páginas en marcha (se desempareja la máquina, se acaba el
  // descanso) y el índice se quedaría fuera de rango un render.
  const activa = Math.min(i, paginas.length - 1);
  const p = paginas[activa]!;

  const ir = useCallback(
    (destino: number) => {
      const n = ((destino % paginas.length) + paginas.length) % paginas.length;
      setI(n);
      onLog(`Página ${n + 1} de ${paginas.length}: ${paginas[n]!.contexto}`);
    },
    [paginas, onLog],
  );

  // ¿Qué se pinta de verdad? El MODO decide, no la vista. En `ojeada` el gesto
  // SIGUE existiendo (la pantalla entera es un blanco: no hay que apuntar y no
  // cuesta un punto de alto), pero no se anuncia — y esos 15 pt son del sujeto.
  const franja = PERMITE[p.modo].franja ? p.accion : undefined;
  const varias = paginas.length > 1;
  const alto = altoSujeto(p.sujeto.texto, apoyosDe(p, varias), p.sujeto.unidad);

  const interactivo = p.accion != null || varias;

  return (
    <div style={{ position: 'absolute', inset: 0, background: W.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: color ? tinte(color) : W.bg,
          transition: 'background-color 700ms ease',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: DEGRADADO }} />
      {bisel}
      <Destello n={destello?.n ?? 0} color={destello?.color ?? W.orangeSoft} />

      <div style={{ position: 'absolute', inset: 0, padding: RELLENO, boxSizing: 'border-box' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <AreaPrincipal
            interactivo={interactivo}
            etiqueta={p.accion?.etiqueta ?? p.contexto}
            onToca={p.accion?.onToca}
            onDesliz={(dir) => ir(activa + dir)}
          >
            <Versales tono="rgba(255,255,255,0.85)">{p.contexto}</Versales>
            {/* El sobrante crece PRIMERO en el sujeto (hasta su techo) y sólo
                después se reparte en aire simétrico arriba y abajo. Es el §10.3
                aplicado: el centro óptico no baila de una vista a otra. */}
            <span style={{ flex: 1 }} />
            <Numeral
              texto={p.sujeto.texto}
              unidad={p.sujeto.unidad}
              alto={alto}
              color={p.sujeto.tono}
              latido={p.sujeto.latido}
            />
            <span style={{ flex: 1 }} />
            {p.segundo ? (
              <SegundoNivel
                etiqueta={p.segundo.etiqueta}
                valor={p.segundo.valor}
                color={p.segundo.tono}
              />
            ) : null}
            {franja ? <FranjaAccion etiqueta={franja.etiqueta} modo={p.modo} /> : null}
            {p.nota ? <Versales arriba={3}>{p.nota}</Versales> : null}
          </AreaPrincipal>

          {varias ? <Puntos total={paginas.length} activa={activa} onIr={ir} /> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * El área de contenido. Es el botón cuando hay algo que tocar, y un simple
 * lienzo cuando no lo hay — que es el caso de `ojeada`: corriendo, la pantalla
 * no ofrece nada porque no se puede usar nada.
 *
 * El deslizamiento y el toque conviven por umbral de movimiento: un arrastre de
 * más de 24 px es paginar, y entonces el toque NO se dispara. Sin eso, cambiar
 * de página en un AMRAP sumaría una ronda que no hiciste.
 */
function AreaPrincipal({
  interactivo,
  etiqueta,
  onToca,
  onDesliz,
  children,
}: {
  interactivo: boolean;
  etiqueta: string;
  onToca?: () => void;
  onDesliz: (dir: 1 | -1) => void;
  children: ReactNode;
}) {
  const origen = useRef<{ x: number; y: number } | null>(null);
  const deslizo = useRef(false);

  const abajo = (e: ReactPointerEvent) => {
    origen.current = { x: e.clientX, y: e.clientY };
    deslizo.current = false;
  };
  const arriba = (e: ReactPointerEvent) => {
    const o = origen.current;
    origen.current = null;
    if (!o) return;
    const dx = e.clientX - o.x;
    if (Math.abs(dx) >= DESLIZ_MIN && Math.abs(dx) > Math.abs(e.clientY - o.y)) {
      deslizo.current = true;
      onDesliz(dx < 0 ? 1 : -1);
    }
  };

  if (!interactivo) return <div style={areaPrincipal}>{children}</div>;

  return (
    <button
      type="button"
      aria-label={etiqueta}
      onPointerDown={abajo}
      onPointerUp={arriba}
      onClick={() => {
        // Un deslizamiento ya ha cambiado de página: el click que el navegador
        // dispara detrás no puede además ejecutar la acción.
        if (deslizo.current) {
          deslizo.current = false;
          return;
        }
        onToca?.();
      }}
      style={{ ...areaPrincipal, ...botonReset, cursor: onToca ? 'pointer' : 'grab' }}
    >
      {children}
    </button>
  );
}

/**
 * LA FRANJA DE ACCIÓN. La acción es lo que TOCAS; el sujeto es lo que MIRAS, y
 * no compiten en peso (§10.5). Por eso es una etiqueta en versales sobre un
 * blanco del tamaño de la pantalla, y no un botón que se coma 52 pt de alto.
 *
 * En `ciego` la misma etiqueta se pinta atenuada: durante una serie de fuerza
 * el reloj no PIDE nada, y una acción a plena luz es pedir.
 */
function FranjaAccion({ etiqueta, modo }: { etiqueta: string; modo: Modo }) {
  const enReposo = PERMITE[modo].atenuada;
  return (
    <Versales arriba={4} tono={enReposo ? 'rgba(255,255,255,0.42)' : W.ink}>
      {etiqueta}
    </Versales>
  );
}

/**
 * Los puntos de página. Son la única pieza de cromo que gana su sitio en las
 * tres modalidades: dicen que hay más, que es lo que hace del deslizamiento un
 * material de diseño y no un secreto.
 */
function Puntos({
  total,
  activa,
  onIr,
}: {
  total: number;
  activa: number;
  onIr: (n: number) => void;
}) {
  return (
    <div style={bandaPuntos}>
      {Array.from({ length: total }, (_, n) => (
        <button
          key={n}
          type="button"
          onClick={() => onIr(n)}
          aria-label={`Página ${n + 1} de ${total}`}
          aria-current={n === activa ? 'true' : undefined}
          style={{ ...botonReset, padding: 3, cursor: 'pointer', lineHeight: 0 }}
        >
          <span
            style={{
              display: 'block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: n === activa ? W.ink : 'rgba(255,255,255,0.28)',
              transition: 'background-color 200ms ease',
            }}
          />
        </button>
      ))}
    </div>
  );
}

/** El golpe de luz de las transiciones: entra de golpe y se va en medio segundo. */
export function Destello({ n, color }: { n: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (n === 0) return;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || sinMovimiento()) return;
    const luz = el.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    return () => luz.cancel();
  }, [n]);
  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, background: color, opacity: 0, pointerEvents: 'none' }}
    />
  );
}

/**
 * El tinte vive en una banda central. Negro arriba (donde corre el aro) y negro
 * abajo (donde viven las versales atenuadas y donde el OLED no gasta).
 */
const DEGRADADO =
  'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.80) 14%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.72) 74%, #000 100%)';

/** Los safe areas del reloj los fija DeviceFrame; a los lados, 2 pt más por el aro. */
const RELLENO =
  'var(--twin-safe-top) calc(var(--twin-safe-right) + 2px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 2px)';

const areaPrincipal: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '100%',
  textAlign: 'center',
  color: W.ink,
};

const botonReset: CSSProperties = {
  padding: 0,
  border: 0,
  background: 'transparent',
  font: 'inherit',
  appearance: 'none',
};

const bandaPuntos: CSSProperties = {
  flex: '0 0 auto',
  height: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  width: '100%',
};
