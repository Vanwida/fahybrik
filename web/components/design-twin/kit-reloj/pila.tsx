'use client';

// LA PILA — la carcasa de ANTES y DESPUÉS del vivo (brief, RPE, resumen,
// esfera): la corona recorre una pila vertical de páginas, el doble toque (o
// el botón Acción) hace la acción del momento y la muñeca abajo atenúa. Es la
// gramática de `Muneca` sin lo que solo tiene sentido corriendo: sin Controles
// a la izquierda (Pausa, Water Lock, Terminar) ni Ahora suena a la derecha,
// que antes de empezar o con la sesión ya guardada no significan nada.
//
// Se monta con las piezas de la carcasa (los mandos simulados, la corona del
// bisel, los puntos de la pila) y los gestos de `gestos.ts`: se ve y se toca
// igual que el vivo.
//
// `corona` enfoca la corona en un VALOR (el RPE), con el mismo contrato que
// `Muneca`: girar cambia el número y no la página, como el selector de
// esfuerzo de Apple. `fija` es la barra de abajo de watchOS 10: no se desliza
// con la corona.

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { KEYFRAMES, PuntosVerticales } from './carcasa';
import type { Emision } from './eventos';
import { useDestinos, useGuion, useRueda, type Direccion, type GestoGuion, type OrigenPrimario } from './gestos';
import { CoronaBisel, Mandos } from './mandos';
import type { AccionPrimaria, PaginaVivo } from './Muneca';
import { PrimariaContexto, RelojContexto, type ModeloReloj } from './piezas';
import { AOD, C } from './tokens';

export interface PilaProps {
  paginas: PaginaVivo[];
  fija?: ReactNode;
  /** La corona enfocada en un valor (el RPE): `true` = el paso era suyo, no se pasa página. */
  corona?: (dir: Direccion) => boolean;
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
  const { raiz, destinos } = useDestinos();
  const toque = useRef<{ x: number; y: number } | null>(null);
  const activa = Math.min(pagina, Math.max(0, paginas.length - 1));
  const aod = muneca === 'abajo';

  const irPagina = (n: number) => {
    setPagina(n);
    setMovido((m) => m + 1);
    p.onPagina?.(n);
    onLog(`Corona → página ${n + 1}/${paginas.length} · ${paginas[n]!.titulo}`);
  };

  const capturar = (dir: Direccion) => !aod && !!p.corona && p.corona(dir);

  const girar = (dir: Direccion) => {
    if (aod) {
      setMuneca('arriba');
      onLog('Muñeca arriba');
      return;
    }
    if (capturar(dir)) return;
    const n = Math.min(paginas.length - 1, Math.max(0, activa + dir));
    if (n !== activa) irPagina(n);
  };

  const primario = (origen: OrigenPrimario) => {
    if (origen === 'Doble toque' && modelo !== 'doble-toque') {
      onLog('Este reloj no tiene doble toque con la mano — la acción está en pantalla');
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

  const onWheel = useRueda(girar, capturar);

  // El guion pasa por el MISMO camino que los mandos, con el estado más reciente.
  useGuion(p.guion, (g: GestoGuion) => {
    if (g === 'doble-toque') primario('Doble toque');
    else if (g === 'accion') primario('Botón Acción');
    else if (g === 'corona-abajo') girar(1);
    else if (g === 'corona-arriba') girar(-1);
    else if (g === 'bajar' && !aod) alternarMuneca();
    else if (g === 'subir' && aod) alternarMuneca();
    else if (g === 'controles' || g === 'vivo') onLog(p.sinLados);
  });

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
