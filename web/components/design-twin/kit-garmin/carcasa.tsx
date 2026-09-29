'use client';

// LA CARCASA — un Forerunner/fenix de cinco botones alrededor de la pantalla
// redonda, y el estudio que la rodea (el selector de tamaño y el lector).
//
//        LIGHT ◖            ◗ START/STOP
//           UP ◖  ( D )
//         DOWN ◖            ◗ BACK/LAP
//
// Lo que la carcasa hace cumplir, y por eso ninguna pantalla puede saltárselo:
//   · Cada botón es clicable y tiene su tecla (Enter = START, ⌫/Esc = BACK/LAP,
//     ↑ = UP, ↓ = DOWN, ⇧↑ o mantener UP = UP largo, L = LIGHT). La tecla
//     repetida (mantener pulsado) se ignora: una pulsación, una acción (G4).
//   · Qué hace cada botón NO lo decide la carcasa: consulta `accionDe(estado,
//     botón)` (la tabla de §5) y se lo pasa a quien la monta.
//   · Los rótulos de tecla («Reanudar · Enter») solo en REPOSO (brief, pausa,
//     controles, resumen); en el vivo, ocultos.
//   · Táctil: en el vivo, NUNCA (como Garmin nativo); fuera, solo en los
//     relojes táctiles y siempre con su tecla equivalente.
//   · El tamaño (454, 390, 260, 218) se elige arriba y no remonta nada: el
//     mismo instante se juzga en los cuatro.
//
// Qué NO hacer: «mandos simulados» de la muñeca (doble toque, corona…): aquí
// no existen; resolver una tecla fuera de `accionDe`.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { EmisionGarmin } from './avisos';
import { NOMBRE_BOTON, PULSACION_LARGA_MS, REPOSO, TECLA, accionDe, botonDeTecla, type BotonGarmin, type EstadoMandos, type Mando } from './mandos';
import { PantallaGarmin, entornoDe } from './pintar';
import { CARCASA, ESTUDIO, SUELO_D, TAMANOS, tinteDeFondo, tamanoDe, type Diametro } from './tokens';

/** Los botones físicos, en el orden del dibujo. */
const FISICOS: Array<Exclude<BotonGarmin, 'upLargo'>> = ['light', 'up', 'down', 'start', 'back'];

/** A la centésima de píxel: lo mismo en el servidor y en el navegador. */
const redondo = (n: number) => Math.round(n * 100) / 100;

export interface CarcasaGarminProps {
  /** En qué estado de §5 está el reloj: decide qué hace cada botón y si se ven los rótulos. */
  estado: EstadoMandos;
  /** Un botón pulsado, con lo que la tabla dice que hace en este estado (`null` = nada). */
  onBoton: (boton: BotonGarmin, mando: Mando | null) => void;
  /** El color de zona del paso (sin tintar): la carcasa decide si tiñe (solo AMOLED). */
  tinte?: string | null;
  /** El último aviso, para el lector de debajo. */
  ultimo?: EmisionGarmin | null;
  inicial?: Diametro;
  children: ReactNode;
  onLog: (linea: string) => void;
}

/** Escala para caber en el hueco (nunca > 1: el reloj se ve a sus píxeles). */
export function useEncaje(ancho: number, alto: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, el.clientWidth / ancho, el.clientHeight / alto));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho, alto]);
  return { ref, escala };
}

/**
 * El último tamaño elegido en esta visita: cambiar de escenario remonta la
 * pantalla, y quien está juzgando el 218 quiere seguir en el 218. Es estado
 * del estudio (como la orientación en TwinStage), no del reloj.
 */
let tamanoDelEstudio: Diametro | null = null;

export function CarcasaGarmin(p: CarcasaGarminProps) {
  const { estado, onBoton, onLog } = p;
  const [D, setD] = useState<Diametro>(p.inicial ?? tamanoDelEstudio ?? TAMANOS[0]!.D);
  const [pulsado, setPulsado] = useState<BotonGarmin | null>(null);
  const reposo = REPOSO.has(estado);
  const entorno = entornoDe(D, reposo);
  const bisel = CARCASA.bisel * D;
  const rCaja = D / 2 + bisel;
  const asoma = CARCASA.boton.asoma * D;
  const figura = { ancho: 2 * (rCaja + asoma + ESTUDIO.rotulo.reserva), alto: 2 * (rCaja + asoma) };
  const altoTotal = figura.alto + ESTUDIO.chip.alto + ESTUDIO.lector.alto + 2 * ESTUDIO.hueco;
  const { ref, escala } = useEncaje(figura.ancho, altoTotal);

  // La tabla manda: la carcasa solo traduce la pulsación.
  const ultimoEstado = useRef({ estado, onBoton });
  useEffect(() => {
    ultimoEstado.current = { estado, onBoton };
  });
  const pulsar = useCallback((b: BotonGarmin) => {
    const { estado: e, onBoton: f } = ultimoEstado.current;
    setPulsado(b === 'upLargo' ? 'up' : b);
    setTimeout(() => setPulsado((x) => (x === (b === 'upLargo' ? 'up' : b) ? null : x)), CARCASA.pulsadoMs);
    f(b, accionDe(e, b));
  }, []);

  // El teclado del doble.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const b = botonDeTecla(e);
      if (!b) return;
      e.preventDefault();
      if (e.repeat) return;
      pulsar(b);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [pulsar]);

  // UP: soltar antes de la pulsación larga = UP; mantener = UP largo (el menú de Garmin).
  const largo = useRef<{ t: ReturnType<typeof setTimeout>; hecho: boolean } | null>(null);
  const abajo = (b: (typeof FISICOS)[number]) => {
    if (b !== 'up') return pulsar(b);
    const x = { hecho: false, t: setTimeout(() => {
      x.hecho = true;
      pulsar('upLargo');
    }, PULSACION_LARGA_MS) };
    largo.current = x;
  };
  const arriba = (b: (typeof FISICOS)[number]) => {
    if (b !== 'up' || !largo.current) return;
    clearTimeout(largo.current.t);
    if (!largo.current.hecho) pulsar('up');
    largo.current = null;
  };

  const tamano = tamanoDe(D);
  const cx = figura.ancho / 2;
  const cy = figura.alto / 2;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <div style={{ transform: `scale(${escala})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ESTUDIO.hueco, fontFamily: 'var(--twin-font-sans)' }}>
        <div role="group" aria-label="Tamaño del reloj" style={{ display: 'flex', gap: ESTUDIO.chip.hueco }}>
          {TAMANOS.map((t) => (
            <button
              key={t.D}
              type="button"
              title={t.relojes}
              onClick={() => {
                setD(t.D);
                tamanoDelEstudio = t.D;
                onLog(`Tamaño → ${t.D} px · ${t.tec === 'mip' ? 'MIP de 64 colores' : 'AMOLED'} (${t.relojes})`);
              }}
              style={chip(t.D === D)}
            >
              {t.D} · {t.tec === 'mip' ? 'MIP' : 'AMOLED'}
              {t.D === SUELO_D ? ' · suelo' : ''}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: figura.ancho, height: figura.alto }}>
          {/* La caja y el bisel. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: cx - rCaja,
              top: cy - rCaja,
              width: 2 * rCaja,
              height: 2 * rCaja,
              borderRadius: '50%',
              background: CARCASA.color.bisel,
              boxShadow: `inset 0 0 0 ${bisel * CARCASA.filo}px ${CARCASA.color.aro}, ${CARCASA.sombra}`,
            }}
          />
          {FISICOS.map((b) => {
            const ang = (CARCASA.angulo[b] * Math.PI) / 180;
            const r = rCaja + asoma / 2 - CARCASA.boton.grueso * D * CARCASA.boton.hundido;
            // Redondeado: el seno del servidor y el del navegador pueden no coincidir en el último bit.
            const x = redondo(cx + r * Math.sin(ang));
            const y = redondo(cy - r * Math.cos(ang));
            const largoB = redondo(CARCASA.boton.largo * D);
            const grueso = redondo(CARCASA.boton.grueso * D);
            const m = accionDe(estado, b === 'up' ? 'up' : b);
            const derecha = Math.sin(ang) > 0;
            const rr = rCaja + asoma + ESTUDIO.rotulo.aire;
            const rx = redondo(cx + rr * Math.sin(ang));
            const ry = redondo(cy - rr * Math.cos(ang));
            const rotulo = rotuloDe(estado, b);
            return (
              <div key={b}>
                <button
                  type="button"
                  aria-label={`${NOMBRE_BOTON[b]}${m ? ` · ${m.rotulo}` : ''}`}
                  title={`${NOMBRE_BOTON[b]} (${TECLA[b]})${b === 'up' ? ` · mantener ${PULSACION_LARGA_MS / 1000} s = Controles (${TECLA.upLargo})` : ''}`}
                  onPointerDown={() => abajo(b)}
                  onPointerUp={() => arriba(b)}
                  onPointerLeave={() => arriba(b)}
                  style={{
                    position: 'absolute',
                    left: x - largoB / 2,
                    top: y - grueso / 2,
                    width: largoB,
                    height: grueso,
                    borderRadius: grueso / 2,
                    border: 0,
                    padding: 0,
                    background: pulsado === b ? CARCASA.color.botonPulsado : CARCASA.color.boton,
                    transform: `rotate(${CARCASA.angulo[b]}deg)`,
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                  }}
                />
                {reposo && rotulo ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: ry,
                      left: derecha ? rx : undefined,
                      right: derecha ? undefined : figura.ancho - rx,
                      transform: 'translateY(-50%)',
                      fontSize: ESTUDIO.rotulo.cuerpo,
                      color: ESTUDIO.rotulo.color,
                      whiteSpace: 'nowrap',
                      textAlign: derecha ? 'left' : 'right',
                      lineHeight: 1.3,
                    }}
                  >
                    {rotulo}
                  </span>
                ) : null}
              </div>
            );
          })}
          <div style={{ position: 'absolute', left: cx - D / 2, top: cy - D / 2 }}>
            <PantallaGarmin
              entorno={entorno}
              fondo={tinteDeFondo(p.tinte ?? null, tamano.tec)}
              onToque={reposo ? undefined : () => onLog('Toque en la pantalla — en el vivo el táctil está apagado (como en Garmin): los botones')}
            >
              {p.children}
            </PantallaGarmin>
          </div>
        </div>

        <Lector ultimo={p.ultimo ?? null} />
      </div>
    </div>
  );
}

/** El rótulo de un botón: qué hace aquí y su tecla. UP lleva también lo que hace mantenido. */
function rotuloDe(estado: EstadoMandos, b: (typeof FISICOS)[number]): ReactNode | null {
  const m = accionDe(estado, b);
  const largo = b === 'up' ? accionDe(estado, 'upLargo') : null;
  if (!m && !largo) return null;
  const linea = (x: Mando, tecla: string) => (
    <span style={{ display: 'block' }}>
      {x.rotulo} <span style={{ color: ESTUDIO.rotulo.tecla }}>{tecla}</span>
    </span>
  );
  return (
    <>
      {m ? linea(m, TECLA[b]) : null}
      {largo ? linea(largo, `mantener · ${TECLA.upLargo}`) : null}
    </>
  );
}

/** El lector del estudio: el último aviso (qué vibró y qué sonó) y el teclado. */
function Lector({ ultimo }: { ultimo: EmisionGarmin | null }) {
  const leyenda = (['start', 'back', 'up', 'down', 'upLargo', 'light'] as const).map((b) => `${TECLA[b]} ${NOMBRE_BOTON[b]}`).join(' · ');
  return (
    <div style={{ fontSize: ESTUDIO.lector.cuerpo, color: ESTUDIO.lector.color, textAlign: 'center', lineHeight: 1.5, maxWidth: ESTUDIO.lector.ancho }}>
      <div style={{ color: ESTUDIO.lector.fuerte, minHeight: '1.5em' }}>{ultimo ? `Último aviso · ${ultimo.linea}` : 'Sin avisos todavía'}</div>
      <div>{leyenda}</div>
    </div>
  );
}

function chip(activo: boolean): CSSProperties {
  return {
    padding: ESTUDIO.chip.relleno,
    borderRadius: 999,
    border: `1px solid ${activo ? ESTUDIO.chip.activo : ESTUDIO.chip.borde}`,
    background: 'transparent',
    color: ESTUDIO.chip.color,
    fontSize: ESTUDIO.chip.cuerpo,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
