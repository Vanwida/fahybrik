'use client';

// PRÓXIMAS — los objetivos que NO son el sujeto, en orden de día. El principal
// (cuando no manda el sujeto) va el primero y lleva el realce de acento; cada
// tarjeta es UNA puerta al detalle y sus acciones raras (preguntar al coach,
// hacer principal, eliminar) cuelgan de un ⋯ de 48 pt. Con más de cuatro se
// pliega a tres y un «Ver N más».
//
// Estados: con datos · en frío (esqueleto con la forma de la tarjeta) · vacío con
// salida (la fila «Buscar…», que dice qué pasa al fijar una carrera) · en error no
// se pinta (el sujeto ya lo dice).

import { useId, useState } from 'react';
import type { LecturaCarreras, ProximaCarrera } from '../../kit-carreras/contrato';
import { esPrincipal, ETIQUETA_PRIORIDAD, etiquetaEquipo, fechaConDia, lineaCategoria, metaTexto, unidadDias } from '../../kit-carreras/formato';
import { IcoCalendario, IcoChevron, IcoCronometro, IcoDiana, IcoLupa } from '../../kit-dia/iconos';
import { Esqueleto, Pastilla, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';
import { BotonTexto, IcoPersonas, IcoPuntos, PastillaSeccion, Tarjeta } from './piezas';

/** Desde cuántas tarjetas se pliega, y cuántas quedan a la vista al plegar. */
const PLEGAR_DESDE = 4;
const VISIBLES_PLEGADO = 3;

/** El chevron de un pliegue: apunta abajo cerrado y arriba abierto. */
export function Giro({ abierto }: { abierto: boolean }) {
  return (
    <span className="cr-fila-abre" style={{ display: 'inline-flex', transform: abierto ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
      <IcoChevron tam={18} />
    </span>
  );
}

function ChipRol({ c }: { c: ProximaCarrera }) {
  const principal = esPrincipal(c);
  const etiqueta = ETIQUETA_PRIORIDAD[c.prioridad ?? 'target'];
  return principal ? (
    <Pastilla
      fondo={tinte('var(--twin-accent)', 14, 'var(--twin-surface)')}
      tinta="var(--twin-fg)"
      borde={velo('var(--twin-accent)', 55)}
      icono={<span style={{ display: 'inline-flex', color: 'var(--twin-accent-text)' }}><IcoDiana tam={14} /></span>}
    >
      {etiqueta}
    </Pastilla>
  ) : (
    <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
      {etiqueta}
    </Pastilla>
  );
}

function Cuenta({ dias }: { dias: number | null }) {
  const caja = { width: 60, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, paddingTop: 2 } as const;
  if (dias == null) {
    return (
      <span style={{ ...caja, color: 'var(--twin-muted)' }}>
        <IcoCalendario tam={28} />
      </span>
    );
  }
  if (dias <= 0) {
    return (
      <span style={caja}>
        <span style={{ ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.03em', color: 'var(--twin-accent-text)' }}>Hoy</span>
      </span>
    );
  }
  return (
    <span style={caja}>
      <span style={{ ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.03em', color: 'var(--twin-accent-text)', ...TABULAR }}>{dias}</span>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{unidadDias(dias)}</span>
    </span>
  );
}

function TarjetaProxima({
  c,
  hoy,
  onAbre,
  onAcciones,
}: {
  c: ProximaCarrera;
  hoy: string;
  onAbre: (c: ProximaCarrera) => void;
  onAcciones: (c: ProximaCarrera) => void;
}) {
  const categoria = lineaCategoria(c);
  const equipo = etiquetaEquipo(c.formato);
  const donde = [c.fecha ? fechaConDia(c.fecha, hoy) : 'Fecha por confirmar', c.lugar].filter(Boolean).join(' · ');
  const etiqueta = [
    ETIQUETA_PRIORIDAD[c.prioridad ?? 'target'],
    c.nombre,
    c.diasHasta == null ? null : c.diasHasta <= 0 ? 'es hoy' : `faltan ${c.diasHasta} ${unidadDias(c.diasHasta)}`,
    donde,
    equipo,
    categoria,
    c.metaS != null ? `Objetivo ${metaTexto(c.metaS)}` : null,
    'Abre el detalle',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Tarjeta realce={esPrincipal(c)} style={{ display: 'flex', alignItems: 'stretch' }}>
      <button
        type="button"
        className="hd-toque"
        onClick={() => onAbre(c)}
        aria-label={etiqueta}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 4px 16px 16px', borderRadius: RADIO.tarjeta }}
      >
        <Cuenta dias={c.diasHasta} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ChipRol c={c} />
            {equipo ? (
              <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)" icono={<IcoPersonas tam={16} />}>
                {equipo}
              </Pastilla>
            ) : null}
          </span>
          <span style={{ ...fuente(800, 19, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)', textWrap: 'balance', overflowWrap: 'anywhere' }}>{c.nombre}</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{donde}</span>
          {categoria ? <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{categoria}</span> : null}
          {c.metaS != null ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, ...fuente(700, TAM.suelo, 1.3), color: 'var(--twin-fg)' }}>
              <span style={{ display: 'inline-flex', color: 'var(--twin-accent-text)' }}>
                <IcoCronometro tam={18} />
              </span>
              Objetivo <span style={TABULAR}>{metaTexto(c.metaS)}</span>
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className="hd-toque"
        onClick={() => onAcciones(c)}
        aria-label={`Acciones de ${c.nombre}`}
        style={{ width: TOQUE, flex: '0 0 auto', display: 'grid', placeItems: 'start center', paddingTop: 12, color: 'var(--twin-muted)' }}
      >
        <IcoPuntos tam={22} />
      </button>
    </Tarjeta>
  );
}

function EsqueletoTarjeta() {
  return (
    <Tarjeta style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, minHeight: 136 }}>
      <span style={{ width: 60, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Esqueleto ancho={48} alto={32} radio={8} />
        <Esqueleto ancho={36} alto={15} radio={5} />
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Esqueleto ancho={128} alto={32} radio={16} />
        <Esqueleto ancho="68%" alto={19} radio={6} />
        <Esqueleto ancho="52%" alto={15} radio={5} />
      </span>
    </Tarjeta>
  );
}

export function Proximas({
  l,
  items,
  invitacion,
  onAbre,
  onAcciones,
  onBuscar,
}: {
  l: LecturaCarreras;
  items: ProximaCarrera[];
  /** Cuando NO queda ninguna, qué dice la fila de salida (depende de si el sujeto ya es una carrera). */
  invitacion: { titulo: string; detalle: string };
  onAbre: (c: ProximaCarrera) => void;
  onAcciones: (c: ProximaCarrera) => void;
  onBuscar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();

  if (l.carga.hub === 'fria') {
    return (
      <section aria-busy aria-label="Cargando tus próximas carreras" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={120} alto={26} radio={8} />
        </span>
        <EsqueletoTarjeta />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section aria-label="Próximas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TituloSeccion>Próximas</TituloSeccion>
        <button
          type="button"
          className="hd-toque"
          onClick={onBuscar}
          aria-label={`${invitacion.titulo}. ${invitacion.detalle}`}
          style={{
            minHeight: 76,
            padding: '14px 16px',
            boxSizing: 'border-box',
            borderRadius: RADIO.tarjeta,
            border: '1px solid var(--twin-hairline-strong)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span aria-hidden style={{ width: 44, height: 44, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', background: tinte('var(--twin-accent)', 14, 'var(--twin-bg)'), border: `1px solid ${velo('var(--twin-accent)', 40)}`, color: 'var(--twin-accent-text)' }}>
            <IcoLupa tam={22} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ ...fuente(800, TAM.cuerpo, 1.2, true), color: 'var(--twin-fg)' }}>{invitacion.titulo}</span>
            <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', textWrap: 'pretty' }}>{invitacion.detalle}</span>
          </span>
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IcoChevron tam={18} />
          </span>
        </button>
      </section>
    );
  }

  const plegable = items.length >= PLEGAR_DESDE;
  const visibles = plegable && !abierto ? items.slice(0, VISIBLES_PLEGADO) : items;
  const resto = items.length - VISIBLES_PLEGADO;
  return (
    <section aria-label="Próximas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion aparte={<PastillaSeccion onClick={onBuscar} icono={<IcoLupa tam={18} />}>Buscar carrera</PastillaSeccion>}>Próximas</TituloSeccion>
      <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibles.map((c) => (
          <TarjetaProxima key={c.raceId} c={c} hoy={l.hoy} onAbre={onAbre} onAcciones={onAcciones} />
        ))}
      </div>
      {plegable ? (
        <Tarjeta style={{ overflow: 'hidden' }}>
          <BotonTexto onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls={id} derecha={<Giro abierto={abierto} />}>
            {abierto ? 'Ver menos' : `Ver ${resto} más`}
          </BotonTexto>
        </Tarjeta>
      ) : null}
    </section>
  );
}
