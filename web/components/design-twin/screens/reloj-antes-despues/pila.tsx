'use client';

// LA PILA — la carcasa de ANTES y DESPUÉS del vivo (brief, RPE, resumen,
// esfera): la corona recorre una pila vertical de páginas, el doble toque (o
// el botón Acción) hace la acción del momento y la muñeca abajo atenúa. Es la
// gramática de `Muneca` sin lo que solo tiene sentido corriendo: sin Controles
// a la izquierda (Pausa, Water Lock, Terminar) ni Ahora suena a la derecha,
// que antes de empezar o con la sesión ya guardada no significan nada.
//
// Se monta con las piezas de la carcasa del kit (los mandos simulados, la
// corona del bisel, los puntos de la pila): se ve y se toca igual que el vivo.
// Candidata al kit — ver «Para el kit» en el index.
//
// `corona` convierte la corona en VALOR (el RPE): girar cambia el número y no
// la página, como el selector de esfuerzo de Apple.
// `fija` es la barra de abajo de watchOS 10: no se desliza con la corona.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  AOD,
  C,
  PrimariaContexto,
  RelojContexto,
  type AccionPrimaria,
  type Emision,
  type GestoGuion,
  type ModeloReloj,
  type PaginaVivo,
} from '../../kit-reloj';
import { KEYFRAMES, PuntosVerticales } from '../../kit-reloj/carcasa';
import { CoronaBisel, Mandos } from '../../kit-reloj/mandos';

export interface PilaProps {
  paginas: PaginaVivo[];
  fija?: ReactNode;
  corona?: (dir: 1 | -1) => void;
  accion?: AccionPrimaria | null;
  /** La última emisión (háptico + voz) para el lector de debajo del reloj. */
  ultimo: Emision | null;
  /** Sin puntos (la esfera: la pila del Smart Stack no los lleva). */
  puntos?: boolean;
  inicial?: { pagina?: number; muneca?: 'arriba' | 'abajo' };
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  modelo?: ModeloReloj;
  /** Lo que dice la cronología si se intenta ir a los lados (aquí no hay Controles ni Ahora suena). */
  sinLados: string;
  onPagina?: (i: number) => void;
  onLog: (linea: string) => void;
}

const DESLIZ = 30;

export function Pila(p: PilaProps) {
  const { paginas, onLog, accion, modelo = 'doble-toque' } = p;
  const [pagina, setPagina] = useState(p.inicial?.pagina ?? 0);
  const [muneca, setMuneca] = useState<'arriba' | 'abajo'>(p.inicial?.muneca ?? 'arriba');
  const [movido, setMovido] = useState(0);
  const [destinos, setDestinos] = useState<{ bisel: HTMLElement | null; escena: HTMLElement; suelto: boolean } | null>(null);
  const rueda = useRef({ acumulado: 0, ultimo: 0 });
  const toque = useRef<{ x: number; y: number } | null>(null);
  const gestos = useRef<(g: GestoGuion) => void>(() => undefined);
  const activa = Math.min(pagina, Math.max(0, paginas.length - 1));
  const aod = muneca === 'abajo';

  const raiz = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const escena = el.closest<HTMLElement>('.studio-stage');
    const lienzo = el.closest<HTMLElement>('.twin-root');
    setDestinos({ bisel: escena ? (lienzo?.parentElement ?? null) : null, escena: escena ?? document.body, suelto: !escena });
  }, []);

  const irPagina = (n: number) => {
    setPagina(n);
    setMovido((m) => m + 1);
    p.onPagina?.(n);
    onLog(`Corona → página ${n + 1}/${paginas.length} · ${paginas[n]!.titulo}`);
  };

  const girar = (dir: 1 | -1) => {
    if (aod) {
      setMuneca('arriba');
      onLog('Muñeca arriba');
      return;
    }
    if (p.corona) {
      p.corona(dir);
      return;
    }
    const n = Math.min(paginas.length - 1, Math.max(0, activa + dir));
    if (n !== activa) irPagina(n);
  };

  const primario = (origen: 'Doble toque' | 'Botón Acción' | 'Botón en pantalla') => {
    if (origen === 'Doble toque' && modelo !== 'doble-toque') {
      onLog('Este reloj no tiene doble toque — la acción está en pantalla');
      return;
    }
    if (origen === 'Botón Acción' && modelo === 'sin-gesto') {
      onLog('Este reloj no tiene botón Acción — la acción está en pantalla');
      return;
    }
    if (aod) {
      onLog(`${origen} con la muñeca abajo — no hace nada`);
      return;
    }
    if (!accion) {
      onLog(`${origen} — aquí no hay acción`);
      return;
    }
    onLog(`${origen} → ${accion.etiqueta}`);
    accion.hacer();
  };

  const alternarMuneca = () => {
    const nueva = aod ? 'arriba' : 'abajo';
    setMuneca(nueva);
    onLog(nueva === 'abajo' ? 'Muñeca abajo → Always-On (tinta al 60 %)' : 'Muñeca arriba');
  };

  const abajo = (e: ReactPointerEvent) => {
    toque.current = { x: e.clientX, y: e.clientY };
  };
  const arriba = (e: ReactPointerEvent) => {
    const o = toque.current;
    toque.current = null;
    if (!o || aod) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (Math.abs(dx) >= DESLIZ && Math.abs(dx) > Math.abs(dy)) onLog(p.sinLados);
    else if (Math.abs(dy) >= DESLIZ) girar(dy < 0 ? 1 : -1);
  };

  const onWheel = (e: ReactWheelEvent) => {
    const r = rueda.current;
    const ahora = Date.now();
    r.acumulado += e.deltaY;
    if (Math.abs(r.acumulado) >= 40 && ahora - r.ultimo > 220) {
      girar(r.acumulado > 0 ? 1 : -1);
      r.acumulado = 0;
      r.ultimo = ahora;
    }
  };

  // El guion pasa por el MISMO camino que los mandos, con el estado más reciente.
  useEffect(() => {
    gestos.current = (g: GestoGuion) => {
      if (g === 'doble-toque') primario('Doble toque');
      else if (g === 'accion') primario('Botón Acción');
      else if (g === 'corona-abajo') girar(1);
      else if (g === 'corona-arriba') girar(-1);
      else if (g === 'bajar' && !aod) alternarMuneca();
      else if (g === 'subir' && aod) alternarMuneca();
      else if (g === 'controles' || g === 'vivo') onLog(p.sinLados);
    };
  });
  const guion = p.guion;
  useEffect(() => {
    if (!guion) return;
    const t = guion.map((x) => setTimeout(() => gestos.current(x.gesto), x.en));
    return () => t.forEach(clearTimeout);
    // El guion es fijo por montaje (cada escenario remonta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RelojContexto.Provider value={{ modelo, aod }}>
      <PrimariaContexto.Provider value={() => primario('Botón en pantalla')}>
        <style>{KEYFRAMES}</style>
        <div
          ref={raiz}
          onPointerDown={abajo}
          onPointerUp={arriba}
          onWheel={onWheel}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            background: C.fondo,
            color: C.tinta,
            fontFamily: 'var(--twin-font-sans)',
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, opacity: aod ? AOD.tinta : 1, transition: 'opacity 250ms ease' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translateY(${-activa * 100}%)`,
                transition: 'transform 320ms cubic-bezier(.2,.8,.2,1)',
              }}
            >
              {paginas.map((x, i) => (
                <div key={x.id} aria-hidden={i !== activa} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 100}%`, height: '100%' }}>
                  {x.contenido}
                </div>
              ))}
            </div>
            {p.fija ? <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{p.fija}</div> : null}
          </div>
          {p.puntos !== false && paginas.length > 1 && !aod ? <PuntosVerticales total={paginas.length} activa={activa} n={movido} /> : null}
        </div>
        {destinos?.bisel ? <CoronaBisel destino={destinos.bisel} onCorona={girar} /> : null}
        {destinos ? (
          <Mandos
            destino={destinos.escena}
            suelto={destinos.suelto}
            area="vivo"
            pagina={activa}
            paginas={paginas.map((x) => x.titulo)}
            muneca={muneca}
            ultimo={p.ultimo}
            onArea={() => onLog(p.sinLados)}
            onCorona={girar}
            onDobleToque={() => primario('Doble toque')}
            onAccion={() => primario('Botón Acción')}
            onMuneca={alternarMuneca}
          />
        ) : null}
      </PrimariaContexto.Provider>
    </RelojContexto.Provider>
  );
}
