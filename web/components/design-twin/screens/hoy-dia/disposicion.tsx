'use client';

// «Cómo llegas»: la disposición, subordinada. Una tira compacta (cifra, lectura
// y las cuatro señales en línea) que ya no es un héroe: el sujeto es el momento
// del día, y esto es el contexto con el que lo vives.
//
// La zona la decide `zonaDe` con las bandas del defecto del contrato: la vista
// no escribe ningún corte. La lectura es del ESTADO DEL CUERPO, jamás una
// prescripción (eso es método del coach).
//
// Estados: medida · sin datos (tres motivos, cada uno con su salida) · en frío.
// Cuando el sujeto ES el check-in y no hay número, el sujeto ya lo dice todo y
// la tira se calla (dos piezas diciendo lo mismo es ruido).

import { useEffect, useState, type ReactNode } from 'react';
import type { LecturaHoy, Senal } from '../../kit-hoy/contrato';
import { COLOR_ZONA, LECTURA_ZONA, zonaDe } from '../../kit-hoy/contrato';
import { IcoBaja, IcoChevron, IcoSube } from './iconos';
import type { Momento } from './momento';
import { Esqueleto, Etiqueta } from './piezas';
import { fuente, RADIO, TABULAR, TAM, TOQUE } from './tokens';

const SENAL_INACTIVA = 'Sin dato';

/** Cómo se cerró el check-in desde la propia portada (null = no se tocó). */
export type Cierre = 'hecho' | 'saltado' | null;

function CeldaSenal({ s, pendiente, cierre }: { s: Senal; pendiente: boolean; cierre: Cierre }) {
  // El check-in que se acaba de cerrar aquí manda sobre el dato de partida.
  const activa = s.activa || (s.clave === 'checkin' && cierre === 'hecho');
  const valor = activa
    ? (s.valor ?? (s.clave === 'checkin' ? 'Hecho' : 'Recibido'))
    : s.clave === 'checkin' && cierre === 'saltado'
      ? 'Saltado'
      : s.clave === 'checkin' && pendiente
        ? 'Por hacer'
        : SENAL_INACTIVA;
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 3, whiteSpace: 'nowrap' }}>
      <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{s.etiqueta}</span>
      <span
        style={{
          ...fuente(activa ? 800 : 500, TAM.suelo, 1.2),
          color: activa ? 'var(--twin-fg)' : 'var(--twin-muted)',
          ...TABULAR,
        }}
      >
        {valor}
      </span>
    </li>
  );
}

/**
 * El anillo de la cifra. El COLOR de la zona va en el arco y nunca en el número:
 * el número es la tinta del tema, porque una cifra de 38 en rojo grande se lee
 * como alarma y una de 91 en verde como aplauso, y la portada dice el estado del
 * cuerpo, no un veredicto. El arco se dibuja al entrar (sin movimiento con
 * `prefers-reduced-motion`).
 */
function Anillo({ score, color }: { score: number; color: string }) {
  const TAM_ANILLO = 68;
  const TRAZO = 6;
  const r = (TAM_ANILLO - TRAZO) / 2;
  const c = 2 * Math.PI * r;
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const fraccion = Math.min(1, Math.max(0, score / 100));
  return (
    <span style={{ position: 'relative', width: TAM_ANILLO, height: TAM_ANILLO, flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
      <svg width={TAM_ANILLO} height={TAM_ANILLO} viewBox={`0 0 ${TAM_ANILLO} ${TAM_ANILLO}`} aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={TAM_ANILLO / 2} cy={TAM_ANILLO / 2} r={r} fill="none" stroke="var(--twin-hairline-strong)" strokeWidth={TRAZO} />
        <circle
          className="hd-arco"
          cx={TAM_ANILLO / 2}
          cy={TAM_ANILLO / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={TRAZO}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={lleno ? c * (1 - fraccion) : c}
        />
      </svg>
      <span style={{ ...fuente(800, TAM.saludo - 2, 1, true), letterSpacing: '-0.03em', color: 'var(--twin-fg)', ...TABULAR }}>{score}</span>
    </span>
  );
}

function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        borderRadius: RADIO.tarjeta,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  );
}

/** La fila de salida del check-in cuando está por hacer y no es ya el sujeto. */
function FilaCheckin({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      style={{
        minHeight: TOQUE,
        padding: '0 16px',
        borderTop: '1px solid var(--twin-hairline)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...fuente(700, TAM.cuerpo, 1.2),
        color: 'var(--twin-accent-text)',
      }}
    >
      Hacer el check-in de hoy
      <IcoChevron tam={18} />
    </button>
  );
}

export function Disposicion({
  l,
  m,
  cierre,
  onLog,
}: {
  l: LecturaHoy;
  m: Momento;
  /** Se acaba de cerrar el check-in aquí mismo: la cifra tarda unos segundos. */
  cierre: Cierre;
  onLog: (linea: string) => void;
}) {
  if (l.cargando) {
    return (
      <Tarjeta>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy>
          <Esqueleto ancho={150} alto={15} radio={5} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Esqueleto ancho={68} alto={68} radio={34} />
            <Esqueleto ancho="55%" alto={20} radio={6} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} alto={38} radio={6} />
            ))}
          </div>
        </div>
      </Tarjeta>
    );
  }

  const d = l.disposicion;
  const pendiente = l.checkinPendiente;
  const conFilaCheckin = pendiente && m.tipo !== 'checkin';

  if (d.tipo === 'sin-datos') {
    if (m.tipo === 'checkin') return null;
    const texto = cierre === 'hecho'
      ? 'Check-in hecho. Tu cifra llega en unos segundos.'
      : cierre === 'saltado'
        ? 'Sin check-in hoy no hay cifra. Mañana puedes hacerlo.'
        : d.motivo === 'salud-conectada'
        ? 'Conectado a Apple Salud. Esperando el sueño y la HRV de tu reloj.'
        : d.motivo === 'salud-sin-conectar'
          ? 'Conecta Apple Salud o haz tu check-in.'
          : 'Haz tu check-in matinal y sale tu cifra de hoy.';
    return (
      <Tarjeta>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Etiqueta>Cómo llegas hoy</Etiqueta>
          <span style={{ ...fuente(800, TAM.seccion, 1.15, true), color: 'var(--twin-fg)' }}>Sin cifra todavía</span>
          <span style={{ ...fuente(500, TAM.cuerpo, 1.35), color: 'var(--twin-muted)' }}>{texto}</span>
        </div>
        {conFilaCheckin ? <FilaCheckin onClick={() => onLog('Disposición → abriría el check-in')} /> : null}
        {!conFilaCheckin && d.motivo === 'salud-sin-conectar' ? (
          <button
            type="button"
            className="hd-toque"
            onClick={() => onLog('Disposición → Perfil · conectar Apple Salud')}
            style={{ minHeight: TOQUE, padding: '0 16px', borderTop: '1px solid var(--twin-hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-accent-text)' }}
          >
            Conectar Apple Salud
            <IcoChevron tam={18} />
          </button>
        ) : null}
      </Tarjeta>
    );
  }

  const zona = zonaDe(d.score);
  const color = COLOR_ZONA[zona];
  const lectura = LECTURA_ZONA[zona];
  const delta = d.delta7d;
  return (
    <Tarjeta>
      <button
        type="button"
        className="hd-toque"
        onClick={() => onLog('Disposición → abriría el detalle de cómo llegas hoy')}
        aria-label={`Cómo llegas hoy: ${d.score} de 100, ${lectura}${delta !== null ? `, ${delta >= 0 ? 'sube' : 'baja'} ${Math.abs(delta)} en 7 días` : ''}. Ver el detalle`}
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Etiqueta>Cómo llegas hoy</Etiqueta>
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IcoChevron tam={18} />
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Anillo score={d.score} color={color} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{lectura}</span>
            {delta !== null ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  ...fuente(700, TAM.suelo, 1.2),
                  color: delta >= 0 ? 'var(--twin-ok)' : 'var(--twin-warning)',
                  ...TABULAR,
                }}
              >
                {delta >= 0 ? <IcoSube /> : <IcoBaja />}
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta)} en 7 días
              </span>
            ) : null}
          </span>
        </span>
        <ul
          aria-label="Lo que alimenta tu cifra"
          style={{ listStyle: 'none', margin: 0, padding: '12px 0 0', borderTop: '1px solid var(--twin-hairline)', display: 'flex', justifyContent: 'space-between', gap: 10 }}
        >
          {d.senales.map((s) => (
            <CeldaSenal key={s.clave} s={s} pendiente={pendiente} cierre={cierre} />
          ))}
        </ul>
      </button>
      {conFilaCheckin ? <FilaCheckin onClick={() => onLog('Disposición → abriría el check-in')} /> : null}
    </Tarjeta>
  );
}
