'use client';

// La SEGUNDA sesión del día (y cualquier otra) como fila compacta, no como otro
// héroe (DECISIONS 6-ago: el patrón que la vieja portada ya validaba), y la
// ACCIÓN ANCLADA: la única puerta de empezar, siempre visible, abajo (§6.2).
//
// El sujeto es lo que miras; la acción es lo que tocas y no compite en peso: es
// una pastilla de tinta invertida, no un segundo naranja. El «···» que la
// acompaña abre las acciones de la sesión mostrada (mover · técnica · corregir ·
// borrar libre) sin necesitar una pulsación larga.

import { Esqueleto } from '../../kit-dia/piezas';
import { IcoChat, IcoFlecha, IcoMas, IcoReintentar, SelloEstado } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, TOQUE } from '../../kit-dia/tokens';
import type { DiaDelPlan, LecturaPlan, SesionDelPlan } from '../../kit-plan/contrato';
import {
  ETIQUETA_ESTADO,
  conMenu,
  estadoEfectivo,
  formatoMinutos,
  textoAccion,
  textoDuracion,
  trabajado,
  type AccionAnclada,
} from '../../kit-plan/modelo';
import { IcoPlay, IcoPuntos } from './iconos';
import { PuntoModalidad } from './shell';

// ── Filas de las otras sesiones ─────────────────────────────────────────────

export function FilaSesion({
  sesion,
  dia,
  l,
  onAbrir,
  onMenu,
}: {
  sesion: SesionDelPlan;
  dia: DiaDelPlan;
  l: LecturaPlan;
  onAbrir: () => void;
  onMenu: () => void;
}) {
  const estado = estadoEfectivo(sesion, dia.iso, l.hoyIso);
  const dg = l.desgloses[sesion.id];
  const medido = trabajado(estado) && dg?.estado === 'listo' && dg.medidoMin ? formatoMinutos(dg.medidoMin) : null;
  const meta = medido ? `Duró ${medido}` : (textoDuracion(sesion.duracion) ?? (dia.esHoy ? 'También hoy' : 'También ese día'));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: RADIO.tarjeta,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="pl-btn"
        onClick={onAbrir}
        aria-label={`${sesion.franja}, ${sesion.titulo}, ${ETIQUETA_ESTADO[estado]}. ${meta}`}
        style={{ flex: 1, minWidth: 0, minHeight: 72, padding: '12px 8px 12px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'var(--twin-fg)' }}
      >
        <span
          style={{
            flex: '0 0 auto',
            minWidth: 40,
            height: 28,
            borderRadius: RADIO.pastilla,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--twin-surface-elevated)',
            border: '1px solid var(--twin-hairline-strong)',
            ...fuente(800, TAM.suelo, 1),
          }}
        >
          {sesion.franja}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ paddingTop: 7, display: 'inline-flex' }}>
              <PuntoModalidad modalidad={sesion.modalidad} tam={9} />
            </span>
            <span style={{ ...fuente(700, TAM.cuerpo, 1.25), minWidth: 0, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' }}>
              {sesion.titulo}
            </span>
          </span>
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{meta}</span>
        </span>
        <SelloEstado estado={estado} tam={24} />
      </button>
      <button
        type="button"
        className="pl-btn"
        aria-label={`Acciones de ${sesion.titulo}`}
        onClick={onMenu}
        style={{ width: TOQUE, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: 'var(--twin-muted)' }}
      >
        <IcoPuntos tam={22} />
      </button>
    </div>
  );
}

// ── La acción anclada ───────────────────────────────────────────────────────

const ALTO_ACCION = 56;

export type IconoDock = 'play' | 'mas' | 'flecha' | 'reintentar' | 'chat';

const ICONOS: Record<IconoDock, React.ReactNode> = {
  play: <IcoPlay tam={18} />,
  mas: <IcoMas tam={20} />,
  flecha: <IcoFlecha tam={20} />,
  reintentar: <IcoReintentar tam={20} />,
  chat: <IcoChat tam={20} />,
};

/** Cómo se pinta cada acción anclada del Plan con coach: su texto y su glifo. */
export function propsDeDock(a: AccionAnclada, coach: string | null): { texto: string; icono: IconoDock; alFinal: boolean; conMenu: boolean } {
  const icono: IconoDock = a.tipo === 'empezar' ? 'play' : a.tipo === 'reintentar' ? 'reintentar' : a.tipo === 'escribir-al-coach' ? 'chat' : 'flecha';
  // El play va delante («▶ Empezar»); el resto, detrás (una flecha que sigue).
  return { texto: textoAccion(a, coach), icono, alFinal: a.tipo !== 'empezar', conMenu: conMenu(a) };
}

export function Dock({
  texto,
  icono,
  alFinal = true,
  ocupada,
  onAccion,
  onMenu,
}: {
  texto: string;
  icono: IconoDock;
  alFinal?: boolean;
  /** Mientras se reintenta: la pastilla gira y no se puede pulsar dos veces. */
  ocupada?: boolean;
  onAccion: () => void;
  /** Con menú, el «···» de la sesión mostrada va al lado. */
  onMenu?: () => void;
}) {
  const glifo = (
    <span className={ocupada && icono === 'reintentar' ? 'hd-gira' : undefined} style={{ display: 'inline-flex' }}>
      {ICONOS[icono]}
    </span>
  );
  return (
    <div
      style={{
        padding: '12px 20px 14px',
        background: 'var(--twin-bg)',
        borderTop: '1px solid var(--twin-hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <button
        type="button"
        className="pl-btn"
        onClick={onAccion}
        disabled={ocupada}
        aria-busy={ocupada}
        style={{
          flex: 1,
          minWidth: 0,
          height: ALTO_ACCION,
          borderRadius: RADIO.pastilla,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'var(--twin-fg)',
          color: 'var(--twin-bg)',
          ...fuente(800, TAM.cuerpo, 1, true),
          letterSpacing: '0.01em',
        }}
      >
        {alFinal ? null : glifo}
        {ocupada ? 'Reintentando' : texto}
        {alFinal ? glifo : null}
      </button>
      {onMenu ? (
        <button
          type="button"
          className="pl-btn"
          aria-label="Más acciones de esta sesión"
          onClick={onMenu}
          style={{
            flex: '0 0 auto',
            width: ALTO_ACCION,
            height: ALTO_ACCION,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--twin-surface-elevated)',
            border: '1px solid var(--twin-hairline-strong)',
            color: 'var(--twin-fg)',
          }}
        >
          <IcoPuntos tam={24} />
        </button>
      ) : null}
    </div>
  );
}

/** La misma silueta de la acción anclada: al llegar los datos no cambia el alto del cuerpo. */
export function DockEsqueleto({ conMenu = true }: { conMenu?: boolean }) {
  return (
    <div aria-hidden style={{ padding: '12px 20px 14px', background: 'var(--twin-bg)', borderTop: '1px solid var(--twin-hairline)', display: 'flex', gap: 12 }}>
      <Esqueleto alto={ALTO_ACCION} radio={RADIO.pastilla} style={{ flex: 1 }} />
      {conMenu ? <Esqueleto ancho={ALTO_ACCION} alto={ALTO_ACCION} radio={ALTO_ACCION / 2} /> : null}
    </div>
  );
}
