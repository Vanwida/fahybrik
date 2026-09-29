'use client';

// ¿QUÉ TOCA HOY?: una fila que dice el ESTADO de la sesión de hoy y, al tocarla,
// lleva al Plan. NUNCA un «Empezar»: el Plan es la única puerta que empieza un
// entreno (docs/DECISIONS.md, 6-ago). Por eso la fila no es la acción primaria
// de la pantalla: pesa como un dato, no como un botón.
//
// Estados de la pieza: sesiones (una o dos, con franja AM/PM y estado por sesión)
// · descanso (dice qué toca mañana, o por qué no hay nada) · pausa (no es un
// fallo) · error con «Reintentar» · esqueleto con la misma forma.
//
// El entreno GUARDADO A MEDIAS (`Retomar`) vive pegado a esta fila y no en el
// bloque plegado de abajo: es la MISMA sesión de hoy, empezada, y es lo más
// urgente que hay en la portada.

import type { CSSProperties, ReactNode } from 'react';
import type { LecturaHoy, Reclamo, SesionHoy } from '../../kit-hoy/contrato';
import { COLOR_MODALIDAD, PuntoModalidad } from '../../kit-composicion/chrome';
import { R } from '../../kit-composicion/tokens';
import { Banda, ChipEstado, Esq, Etiqueta, Franja, InsigniaLibre } from './atomos';
import { IconChevron, IconPausa } from './iconos';
import { TEXTO_ESTADO, capitalizar } from './texto';
import { T } from './tokens';

const TITULO: CSSProperties = { font: `600 ${T.titulo}px/30px var(--twin-font-sans)`, letterSpacing: '-0.005em', color: 'var(--twin-fg)', minWidth: 0 };
const APOYO: CSSProperties = { font: `400 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' };

const CAJA_FILA: CSSProperties = { width: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0', borderRadius: R.m, textAlign: 'left' };

function ariaSesion(s: SesionHoy): string {
  const franja = s.franja ? `${s.franja === 'AM' ? 'Mañana' : 'Tarde'}, ` : '';
  return `${franja}${s.titulo}, ${TEXTO_ESTADO[s.estado].toLowerCase()}${s.libre ? ', entreno libre' : ''}. Ver en el plan`;
}

function FilaSesion({ s, unica, onIr }: { s: SesionHoy; unica: boolean; onIr: (s: SesionHoy) => void }) {
  // Con dos sesiones, la ya cerrada baja de peso (una línea, título de lista) para
  // que la segunda no compita con ella ni con el dial: la pendiente manda.
  const cerrada = !unica && (s.estado === 'hecha' || s.estado === 'saltada');
  if (cerrada) {
    return (
      <button type="button" className="pl-btn pl-fila" onClick={() => onIr(s)} aria-label={ariaSesion(s)} style={{ ...CAJA_FILA, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
        {s.franja ? <Franja franja={s.franja} /> : null}
        <PuntoModalidad modalidad={s.modalidad} tam={10} />
        <span style={{ flex: 1, minWidth: 0, font: `500 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>{s.titulo}</span>
        {s.libre ? <InsigniaLibre /> : null}
        <ChipEstado estado={s.estado} />
      </button>
    );
  }
  return (
    <button type="button" className="pl-btn pl-fila" onClick={() => onIr(s)} aria-label={ariaSesion(s)} style={CAJA_FILA}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
        {unica && !s.franja ? <Etiqueta>Toca hoy</Etiqueta> : null}
        {s.franja ? <Franja franja={s.franja} /> : null}
        {s.libre ? <InsigniaLibre /> : null}
        <span style={{ marginLeft: 'auto' }}>
          <ChipEstado estado={s.estado} />
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR_MODALIDAD[s.modalidad], flex: '0 0 auto' }} />
        <span style={{ ...TITULO, flex: 1 }}>{s.titulo}</span>
        <IconChevron tam={16} style={{ color: 'var(--twin-faint)' }} />
      </span>
    </button>
  );
}

function FilaSimple({ etiqueta, icono, titulo, apoyo, onIr, etiquetaAria }: { etiqueta: string; icono?: ReactNode; titulo: string; apoyo: ReactNode; onIr: () => void; etiquetaAria: string }) {
  return (
    <button type="button" className="pl-btn pl-fila" onClick={onIr} aria-label={etiquetaAria} style={CAJA_FILA}>
      <Etiqueta>{etiqueta}</Etiqueta>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icono}
        <span style={{ ...TITULO, flex: 1 }}>{titulo}</span>
        <IconChevron tam={16} style={{ color: 'var(--twin-faint)' }} />
      </span>
      <span style={{ ...APOYO, display: 'flex', alignItems: 'center', gap: 8 }}>{apoyo}</span>
    </button>
  );
}

function Reintentar({ reintentando, onReintentar }: { reintentando: boolean; onReintentar: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }} role="alert">
      <Etiqueta>Tu plan</Etiqueta>
      <span style={{ font: `italic 800 ${T.titulo}px/30px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>No pudimos cargar tu plan</span>
      <span style={APOYO}>Revisa tu conexión e inténtalo de nuevo.</span>
      <button type="button" className="tw-btn-primary pl-primario" onClick={onReintentar} disabled={reintentando} style={{ height: 50, alignSelf: 'stretch', fontSize: T.cuerpo }}>
        {reintentando ? (
          <>
            <svg className="pl-gira" width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
            Reintentando
          </>
        ) : (
          'Reintentar'
        )}
      </button>
    </div>
  );
}

function EsqueletoHoy() {
  return (
    <div role="status" aria-label="Cargando lo que toca hoy" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
      <span style={{ display: 'flex', alignItems: 'center', minHeight: 28 }}>
        <Etiqueta>Toca hoy</Etiqueta>
        <span style={{ marginLeft: 'auto' }}>
          <Esq w={96} h={28} r={14} />
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 30 }}>
        <Esq w={12} h={12} r={6} />
        <Esq w="62%" h={26} r={8} />
      </span>
    </div>
  );
}

export function Hoy({
  l,
  orden,
  reintentando,
  onIr,
  onReintentar,
}: {
  l: LecturaHoy;
  orden: number;
  reintentando: boolean;
  onIr: (donde: string) => void;
  onReintentar: () => void;
}) {
  if (l.hoy === null && !l.cargando) return null;
  const hoy = l.hoy;
  const coach = l.coach ?? 'Tu coach';

  let cuerpo: ReactNode;
  if (l.cargando || hoy === null) {
    cuerpo = <EsqueletoHoy />;
  } else if (hoy.tipo === 'sesiones') {
    const unica = hoy.sesiones.length === 1;
    cuerpo = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {!unica ? <Etiqueta style={{ marginBottom: 4 }}>Toca hoy</Etiqueta> : null}
        {hoy.sesiones.map((s, i) => (
          <div key={`${s.franja ?? 'x'}-${s.titulo}`} style={{ borderTop: i ? '1px solid var(--twin-hairline)' : undefined, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}>
            <FilaSesion s={s} unica={unica} onIr={(x) => onIr(`Hoy · ${x.titulo} (${TEXTO_ESTADO[x.estado].toLowerCase()}) → Plan`)} />
          </div>
        ))}
      </div>
    );
  } else if (hoy.tipo === 'descanso') {
    cuerpo = (
      <FilaSimple
        etiqueta="Toca hoy"
        titulo={hoy.manana ? 'Día de descanso' : 'Hoy no hay sesión'}
        apoyo={
          hoy.manana ? (
            <>
              <span style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>{capitalizar(hoy.manana.dia)}</span>
              <PuntoModalidad modalidad={hoy.manana.modalidad} tam={9} />
              <span style={{ minWidth: 0 }}>{hoy.manana.titulo}</span>
            </>
          ) : (
            'Aún no hay nada publicado en tu plan.'
          )
        }
        onIr={() => onIr('Hoy · día sin sesión → Plan')}
        etiquetaAria={hoy.manana ? `Día de descanso. ${hoy.manana.dia}: ${hoy.manana.titulo}. Ver en el plan` : 'Hoy no hay sesión. Aún no hay nada publicado en tu plan. Ver el plan'}
      />
    );
  } else if (hoy.tipo === 'pausado') {
    cuerpo = (
      <FilaSimple
        etiqueta="Toca hoy"
        icono={<IconPausa tam={28} style={{ color: 'var(--twin-muted)' }} />}
        titulo="Tu plan está en pausa"
        apoyo={`${coach} lo ha pausado. Cuando lo retome, tu sesión vuelve a salir aquí.`}
        onIr={() => onIr('Hoy · plan en pausa → Plan')}
        etiquetaAria={`Tu plan está en pausa. ${coach} lo ha pausado. Ver el plan`}
      />
    );
  } else {
    cuerpo = <Reintentar reintentando={reintentando} onReintentar={onReintentar} />;
  }

  return (
    <Banda etiqueta="Qué toca hoy" orden={orden} crece={1}>
      {cuerpo}
    </Banda>
  );
}

// ---------------------------------------------------------------------------
// El entreno a medias
// ---------------------------------------------------------------------------

export function Retomar({ r, orden, onIr }: { r: Extract<Reclamo, { clave: 'a-medias' }>; orden: number; onIr: (donde: string) => void }) {
  return (
    <Banda etiqueta="Entreno a medias" orden={orden} crece={0} regla={false} relleno={6}>
      <button
        type="button"
        className="pl-btn"
        onClick={() => onIr(`Entreno a medias · ${r.titulo} → retoma el entreno guardado`)}
        aria-label={`Entreno a medias: ${r.titulo}, desde las ${r.desde}. Continuar`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: R.l,
          textAlign: 'left',
          background: 'color-mix(in srgb, var(--twin-accent) 10%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--twin-accent) 38%, transparent)',
        }}
      >
        <IconPausa tam={30} style={{ color: 'var(--twin-accent-text)' }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: `700 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>Entreno a medias</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: `700 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-accent-text)' }}>
              Continuar
              <IconChevron tam={14} />
            </span>
          </span>
          <span style={{ font: `400 ${T.apoyo}px/20px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>
            {r.titulo} · desde las {r.desde}
          </span>
        </span>
      </button>
    </Banda>
  );
}
