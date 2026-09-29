'use client';

// EL DIAL: el sujeto de la pantalla. Un arco instrumental de 230° abierto por
// abajo, con la cifra a 120 pt, la palabra de estado y el cambio en 7 días DENTRO
// del instrumento: la abertura del arco es donde vive lo que lo explica, así el
// dial no arrastra una cola de texto debajo.
//
// Tres caras del mismo tamaño (nada salta entre ellas):
//   · medido     → arco relleno del color de la zona, marca al final, halo teñido
//   · sin número → arco apagado + la invitación con su salida (check-in / Salud)
//   · cargando   → mismo arco y mismos bloques, en esqueleto
//
// El color de la zona vive SOLO aquí: en el arco, en su marca y en el halo. Los
// cortes de las zonas salen de `BANDAS_DISPOSICION` (método del coach), nunca se
// escriben en la vista: se dibujan como dos muescas que parten el arco.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BANDAS_DISPOSICION, COLOR_ZONA, LECTURA_ZONA, zonaDe, type LecturaHoy } from '../../kit-hoy/contrato';
import { Esq } from './atomos';
import { IconChevron, IconIgual, IconTriangulo } from './iconos';
import { DIAL, T } from './tokens';

const { ancho, alto, cx, cy, r, trazo, abertura } = DIAL;

const rad = (g: number) => (g * Math.PI) / 180;
const INICIO = 90 + abertura;
const BARRIDO = 360 - 2 * abertura;
// Redondeo a 2 decimales: el coseno del servidor y el del navegador difieren en la
// última cifra y React lo delata como desajuste de hidratación.
const c2 = (n: number) => Number(n.toFixed(2));
const punto = (grados: number, radio: number) => ({ x: c2(cx + radio * Math.cos(rad(grados))), y: c2(cy + radio * Math.sin(rad(grados))) });
const angulo = (valor: number) => INICIO + (BARRIDO * valor) / 100;

const A0 = punto(INICIO, r);
const A1 = punto(INICIO + BARRIDO, r);
const ARCO = `M ${A0.x} ${A0.y} A ${r} ${r} 0 1 1 ${A1.x} ${A1.y}`;

const MARCAS = Array.from({ length: DIAL.marcas + 1 }, (_, i) => {
  const larga = i % DIAL.cadaLarga === 0;
  const a = angulo((i / DIAL.marcas) * 100);
  const desde = punto(a, r + trazo / 2 + 7);
  const hasta = punto(a, r + trazo / 2 + (larga ? 15 : 11));
  return { i, larga, x1: desde.x, y1: desde.y, x2: hasta.x, y2: hasta.y };
});

/** Una muesca radial que parte el arco en un corte de zona. */
function Muesca({ valor }: { valor: number }) {
  const a = angulo(valor);
  const d = punto(a, r - trazo / 2 - 2);
  const h = punto(a, r + trazo / 2 + 2);
  return <line x1={d.x} y1={d.y} x2={h.x} y2={h.y} stroke="var(--twin-bg)" strokeWidth={3} />;
}

/**
 * Dos cuadros de espera y el arco barre hasta su valor. Con `prefers-reduced-motion`
 * las transiciones de `estilos.tsx` valen `none`, así que el mismo cambio de estado
 * llega de golpe: no hay una segunda rama que mantener.
 */
function useEntrada(): boolean {
  const [entra, setEntra] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntra(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return entra;
}

const CAJA: CSSProperties = { position: 'relative', width: ancho, height: alto, margin: '0 auto', flex: '0 0 auto' };
const CAPA: CSSProperties = { position: 'absolute', left: 0, right: 0, textAlign: 'center' };

/** El bisel y el carril: marcas, arco de fondo y muescas. Común a las tres caras. */
function Carril({ apagado = false, esqueleto = false }: { apagado?: boolean; esqueleto?: boolean }) {
  return (
    <>
      {MARCAS.map((m) => (
        <line
          key={m.i}
          x1={m.x1}
          y1={m.y1}
          x2={m.x2}
          y2={m.y2}
          stroke={m.larga ? 'var(--twin-faint)' : 'var(--twin-hairline-strong)'}
          strokeWidth={m.larga ? 2.2 : 1.6}
          strokeLinecap="round"
          opacity={apagado || esqueleto ? 0.55 : 1}
        />
      ))}
      <path
        d={ARCO}
        fill="none"
        stroke="var(--twin-hairline-strong)"
        strokeWidth={trazo}
        strokeLinecap="round"
        className={esqueleto ? 'pl-late' : undefined}
      />
    </>
  );
}

function Lienzo({ children, halo }: { children: ReactNode; halo?: string }) {
  return (
    <span style={{ ...CAJA, display: 'block', margin: 0 }}>
      {halo ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            display: 'block',
            left: cx - 190,
            top: cy - 190,
            width: 380,
            height: 380,
            background: `radial-gradient(closest-side, ${halo}, transparent)`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {children}
      </svg>
    </span>
  );
}

const ETIQUETA: CSSProperties = {
  font: `600 ${T.apoyo}px/20px var(--twin-font-sans)`,
  color: 'var(--twin-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

// ---------------------------------------------------------------------------
// Cara 1 · medido
// ---------------------------------------------------------------------------

function textoDelta(delta: number | null): { sube: boolean | null; texto: string } | null {
  if (delta === null) return null;
  if (delta === 0) return { sube: null, texto: 'Igual que hace 7 días' };
  return { sube: delta > 0, texto: `${Math.abs(delta)} en 7 días` };
}

function etiquetaDial(score: number, delta: number | null): string {
  const d = textoDelta(delta);
  const cambio = d ? (d.sube === null ? ', igual que hace 7 días' : `, ${d.sube ? 'sube' : 'baja'} ${Math.abs(delta ?? 0)} en 7 días`) : '';
  return `Cómo llegas hoy: ${score} de 100, ${LECTURA_ZONA[zonaDe(score)]}${cambio}. Ver el detalle`;
}

function DialMedido({ score, delta, appearance, onDetalle }: { score: number; delta: number | null; appearance: 'light' | 'dark'; onDetalle: () => void }) {
  const entra = useEntrada();
  const zona = zonaDe(score);
  const color = COLOR_ZONA[zona];
  const d = textoDelta(delta);
  const alfa = appearance === 'dark' ? DIAL.haloOscuro : DIAL.haloClaro;
  const cifra = score >= 100 ? DIAL.cifraTres : DIAL.cifra;
  const barrido = (BARRIDO * score) / 100;

  return (
    <button type="button" className="pl-btn" onClick={onDetalle} aria-label={etiquetaDial(score, delta)} style={{ ...CAJA, display: 'block', borderRadius: 24 }}>
      <Lienzo halo={`color-mix(in srgb, ${color} ${alfa}%, transparent)`}>
        <Carril />
        <path
          d={ARCO}
          pathLength={100}
          fill="none"
          stroke={color}
          strokeWidth={trazo}
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={entra ? 100 - score : 100}
          className="pl-arco"
        />
        <Muesca valor={BANDAS_DISPOSICION.cautionMin} />
        <Muesca valor={BANDAS_DISPOSICION.okMin} />
        <g className="pl-marca" style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${entra ? barrido : 0}deg)` }}>
          <circle cx={A0.x} cy={A0.y} r={11} fill="var(--twin-bg)" stroke={color} strokeWidth={5} />
        </g>
      </Lienzo>
      <span style={{ ...CAPA, top: cy - 90 }}>
        <span style={ETIQUETA}>
          ¿Cómo llegas hoy?
          <IconChevron tam={13} style={{ color: 'var(--twin-faint)' }} />
        </span>
      </span>
      <span
        className="pl-cifra"
        style={{
          ...CAPA,
          top: cy - 68,
          font: `800 ${cifra}px/${DIAL.cifra}px var(--twin-font-sans)`,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.035em',
          color: 'var(--twin-fg)',
        }}
      >
        {score}
      </span>
      <span style={{ ...CAPA, top: cy + 60, font: `600 ${T.titulo}px/30px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>{LECTURA_ZONA[zona]}</span>
      {d ? (
        <span style={{ ...CAPA, top: cy + 98, display: 'flex', justifyContent: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `500 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {d.sube === null ? <IconIgual /> : <IconTriangulo sube={d.sube} />}
            {d.texto}
          </span>
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cara 2 · sin número
// ---------------------------------------------------------------------------

type Motivo = 'checkin-pendiente' | 'salud-conectada' | 'salud-sin-conectar';

const TITULO_VACIO: Record<Motivo, string> = {
  'checkin-pendiente': 'Aún sin número',
  'salud-conectada': 'Esperando al reloj',
  'salud-sin-conectar': 'Aún sin número',
};

const APOYO_VACIO: Record<Motivo, string> = {
  'checkin-pendiente': 'Sale con tu check-in.',
  'salud-conectada': 'Tu sueño y tu HRV llegan cuando sincroniza.',
  'salud-sin-conectar': 'Conecta Apple Salud o haz tu check-in.',
};

function DialVacio({ motivo, checkinPendiente, checkinHecho, onCheckin, onConectar }: { motivo: Motivo; checkinPendiente: boolean; checkinHecho: boolean; onCheckin: () => void; onConectar: () => void }) {
  // La salida más corta a un número: el check-in, si está por hacer. Sin él, y con
  // Salud sin conectar, la salida es conectarla; con Salud conectada y sin check-in
  // pendiente no hay acto que ofrecer y la frase dice por qué (§5, §6.2 bis).
  const primaria: 'checkin' | 'conectar' | null = checkinPendiente ? 'checkin' : motivo === 'salud-sin-conectar' ? 'conectar' : null;
  const secundaria = checkinPendiente && motivo === 'salud-sin-conectar';

  return (
    <div style={{ ...CAJA, height: alto + (secundaria ? 28 : 0) }}>
      <Lienzo>
        <Carril apagado />
      </Lienzo>
      <span style={{ ...CAPA, top: cy - 90 }}>
        <span style={ETIQUETA}>¿Cómo llegas hoy?</span>
      </span>
      <div style={{ ...CAPA, top: cy - 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 40px' }}>
        <span style={{ font: `600 ${T.titulo}px/30px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>{checkinHecho ? 'Check-in enviado' : TITULO_VACIO[motivo]}</span>
        <span style={{ font: `400 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>
          {checkinHecho ? 'Tu número sale en unos segundos.' : APOYO_VACIO[motivo]}
        </span>
      </div>
      {!checkinHecho && primaria ? (
        <div style={{ ...CAPA, top: cy + 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className="tw-btn-primary pl-primario"
            onClick={primaria === 'checkin' ? onCheckin : onConectar}
            style={{ height: 50, padding: '0 22px', fontSize: T.cuerpo, minWidth: 204 }}
          >
            {primaria === 'checkin' ? 'Hacer el check-in' : 'Conectar Apple Salud'}
          </button>
          {secundaria ? (
            <button type="button" className="pl-btn" onClick={onCheckin} style={{ minHeight: 40, padding: '0 12px', font: `600 ${T.cuerpo}px/1 var(--twin-font-sans)`, color: 'var(--twin-accent-text)' }}>
              o hacer el check-in
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cara 3 · cargando
// ---------------------------------------------------------------------------

function DialCargando() {
  // Los tres bloques tienen la caja de la cifra, la palabra y el cambio de 7 días.
  const bloque = (w: number, top: number): CSSProperties => ({ position: 'absolute', left: cx - w / 2, top });
  return (
    <div style={CAJA} role="status" aria-label="Cargando cómo llegas hoy">
      <Lienzo>
        <Carril esqueleto />
      </Lienzo>
      <span style={{ ...CAPA, top: cy - 90 }}>
        <span style={ETIQUETA}>¿Cómo llegas hoy?</span>
      </span>
      <Esq w={150} h={88} r={20} style={bloque(150, cy - 52)} />
      <Esq w={190} h={26} r={12} style={bloque(190, cy + 62)} />
      <Esq w={126} h={18} r={9} style={bloque(126, cy + 100)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Dial({
  l,
  appearance,
  checkinHecho,
  onCheckin,
  onConectar,
  onDetalle,
}: {
  l: LecturaHoy;
  appearance: 'light' | 'dark';
  checkinHecho: boolean;
  onCheckin: () => void;
  onConectar: () => void;
  onDetalle: () => void;
}) {
  if (l.cargando) return <DialCargando />;
  const d = l.disposicion;
  if (d.tipo === 'sin-datos') {
    return <DialVacio motivo={d.motivo} checkinPendiente={l.checkinPendiente} checkinHecho={checkinHecho} onCheckin={onCheckin} onConectar={onConectar} />;
  }
  return <DialMedido score={Math.round(d.score)} delta={d.delta7d} appearance={appearance} onDetalle={onDetalle} />;
}
