'use client';

// LOS OTROS SUJETOS de la pestaña: lo que se ve cuando lo que importa ahora no es
// un objetivo con su cuenta atrás. Cada uno es el MISMO póster (foto, cifra
// enorme, una sola acción) con otro tema, porque «Carreras» es la pestaña de la
// foto; solo cargando y error, que no tienen carrera de la que hablar, llevan el
// bloque de tinte de «Hoy».
//
//   · postcarrera → corriste hace poco y falta tu resultado (importarlo)
//   · ultima      → sin nada por delante: tu última carrera y fijar la siguiente
//   · vacio       → ni una cosa ni otra: la invitación, con sus DOS salidas
//   · cargando    → esqueleto con la forma final
//   · error       → «No pudimos cargar tus carreras» con «Reintentar»

import { useState, type CSSProperties } from 'react';
import type { LecturaCarreras } from '../../kit-carreras/contrato';
import { resumenDe, type Sujeto } from '../../kit-carreras/decide';
import { etiquetaDivision, etiquetaEquipo, fechaConDia, fechaCorta, fondoDe, haceCuanto, relojCarrera, textoEquipo } from '../../kit-carreras/formato';
import { Abajo, Accion, Apoyo, Arriba, Hero, Kicker, Titulo } from '../../kit-dia/hero';
import { IcoFlecha, IcoLupa, IcoMas, IcoReintentar } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, TOQUE, velo } from '../../kit-dia/tokens';
import { IcoBandera, IcoPersonas } from './piezas';
import { etiquetaFoto, nombreFoto, PosterBase } from './poster';
import { Cinta, Parciales, PildoraDelta, PildoraPuesto } from './resumen';

const columna = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });

function Kick({ icono, children }: { icono?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}>
      {icono ? <span style={{ display: 'inline-flex', color: 'var(--twin-fg)' }}>{icono}</span> : null}
      <span style={etiquetaFoto}>{children}</span>
    </span>
  );
}

// ── Corriste hace poco y falta tu resultado ───────────────────────────────────

export function PosterPostcarrera({
  s,
  l,
  onImportar,
}: {
  s: Extract<Sujeto, { tipo: 'postcarrera' }>;
  l: LecturaCarreras;
  onImportar: () => void;
}) {
  const c = s.carrera;
  const cuando = haceCuanto(s.dias);
  const fecha = c.fecha ? fechaConDia(c.fecha, l.hoy) : '';
  const equipo = etiquetaEquipo(c.formato);
  const etiqueta = [cuando, c.nombre, fecha, 'Falta tu resultado', 'Importa tu resultado y verás tus parciales, tu ritmo por km y tu evolución', 'Importar mi resultado'].join('. ');
  return (
    <PosterBase foto={fondoDe(String(c.raceId))} etiqueta={etiqueta} onClick={onImportar}>
      <span style={columna(10)}>
        <Kick icono={<IcoBandera tam={18} />}>{cuando}</Kick>
        <span role="heading" aria-level={2} style={nombreFoto}>{c.nombre}</span>
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-fg)' }}>
          <span>{fecha}</span>
          <span style={{ ...fuente(600, TAM.suelo, 1.3) }}>
            {[equipo, etiquetaDivision(c.division)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      <span style={columna(14)}>
        <span style={columna(8)}>
          <span style={{ ...fuente(800, 32, 1.08, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', textWrap: 'balance' }}>Falta tu resultado</span>
          <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
            En cuanto se publique, impórtalo y verás tus parciales, tu ritmo por km y tu evolución.
          </span>
        </span>
        <Accion icono={<IcoFlecha tam={20} />}>Importar mi resultado</Accion>
      </span>
    </PosterBase>
  );
}

// ── Sin nada por delante: tu última carrera ───────────────────────────────────

export function PosterUltima({
  s,
  l,
  onBuscar,
}: {
  s: Extract<Sujeto, { tipo: 'ultima' }>;
  l: LecturaCarreras;
  onBuscar: () => void;
}) {
  const c = s.carrera;
  const r = resumenDe(c, l.pasadas);
  const equipo = etiquetaEquipo(c.formato);
  const conQuien = textoEquipo(c.companeros);
  const fecha = c.fecha ? fechaCorta(c.fecha, l.hoy) : 'Fecha por confirmar';
  const etiqueta = [
    'Tu última carrera',
    c.nombre,
    fecha,
    equipo,
    conQuien,
    r.totalS != null ? `Tiempo ${relojCarrera(r.totalS)}` : null,
    r.puesto,
    'Fijar mi próxima carrera',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <PosterBase foto={fondoDe(String(c.raceId))} etiqueta={etiqueta} onClick={onBuscar}>
      <span style={columna(10)}>
        <Kick icono={<IcoBandera tam={18} />}>Tu última carrera</Kick>
        <span role="heading" aria-level={2} style={nombreFoto}>{c.nombre}</span>
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', ...fuente(600, TAM.cuerpo, 1.3), color: 'var(--twin-fg)' }}>
          <span>{fecha}</span>
          <span style={{ ...fuente(600, TAM.suelo, 1.3) }}>{etiquetaDivision(c.division)}</span>
        </span>
      </span>

      <span style={columna(14)}>
        {r.totalS != null ? (
          <span style={{ ...fuente(800, TAM.cuenta, 0.95, true), letterSpacing: '-0.04em', color: 'var(--twin-fg)', ...TABULAR }}>{relojCarrera(r.totalS)}</span>
        ) : null}
        <span style={columna(8)}>
          {equipo ? (
            <Cinta sobreFoto icono={<IcoPersonas tam={18} />}>
              Tiempo del equipo{conQuien ? ` · ${conQuien}` : ''}
            </Cinta>
          ) : (
            <PildoraDelta deltaS={r.deltaAnteriorS} sobreFoto />
          )}
          <PildoraPuesto texto={r.puesto} sobreFoto />
        </span>
        <Parciales r={r} sobreFoto />
        <Accion icono={<IcoLupa tam={20} />}>Fijar mi próxima carrera</Accion>
      </span>
    </PosterBase>
  );
}

// ── Ni carreras por delante ni por detrás ─────────────────────────────────────

export function PosterVacio({ onBuscar, onImportar }: { onBuscar: () => void; onImportar: () => void }) {
  const ghost: CSSProperties = {
    width: 'auto',
    alignSelf: 'flex-start',
    minHeight: 52,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 22px',
    boxSizing: 'border-box',
    borderRadius: RADIO.pastilla,
    border: `1.5px solid ${velo('var(--twin-fg)', 60)}`,
    color: 'var(--twin-fg)',
    background: velo('var(--twin-bg)', 40),
    ...fuente(800, TAM.cuerpo, 1, true),
    '--hd-foco': 'var(--twin-fg)',
  } as CSSProperties;
  return (
    <PosterBase foto="sled-push" etiqueta="Tus carreras. Todavía no tienes ninguna: busca una carrera o importa tu historial de HYROX">
      <span style={columna(10)}>
        <Kick icono={<IcoBandera tam={18} />}>Tus carreras</Kick>
        <span role="heading" aria-level={2} style={nombreFoto}>¿A qué carrera vas?</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
          Fíjala y tendrás cuenta atrás, el predicho de tu tiempo y un plan que apunta a ese día.
        </span>
        <button type="button" className="hd-toque" onClick={onBuscar} style={{ width: 'auto', alignSelf: 'flex-start', marginTop: 4, '--hd-foco': 'var(--twin-fg)' } as CSSProperties}>
          <Accion icono={<IcoLupa tam={20} />}>Buscar carrera</Accion>
        </button>
      </span>
      <span style={{ ...columna(10), paddingTop: 16, borderTop: `1px solid ${velo('var(--twin-fg)', 26)}` }}>
        <span style={{ ...fuente(800, TAM.cuerpo, 1.25, true), color: 'var(--twin-fg)' }}>¿Ya has corrido HYROX?</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
          Importa tu historial, individuales y dobles: tus parciales por estación, tu ritmo por km y tu evolución.
        </span>
        <button type="button" className="hd-toque" onClick={onImportar} style={ghost}>
          <IcoMas tam={20} />
          Importar mi historial
        </button>
      </span>
    </PosterBase>
  );
}

// ── Cargando en frío: la MISMA forma que tendrá ───────────────────────────────

export function PosterCargando() {
  return (
    <div
      aria-busy
      aria-label="Cargando tus carreras"
      style={{
        flex: '1 0 auto',
        boxSizing: 'border-box',
        minHeight: 400,
        borderRadius: RADIO.grande,
        padding: '14px 22px 20px',
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 18,
      }}
    >
      <span style={columna(10)}>
        <span style={{ minHeight: 34, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={150} alto={15} radio={5} />
        </span>
        <Esqueleto ancho="78%" alto={44} radio={10} />
        <Esqueleto ancho="46%" alto={44} radio={10} />
        <Esqueleto ancho="64%" alto={17} radio={6} />
      </span>
      <span style={columna(14)}>
        <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Esqueleto ancho={150} alto={76} radio={12} />
          <Esqueleto ancho={112} alto={54} radio={RADIO.fila} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px', borderRadius: RADIO.fila, border: '1px solid var(--twin-hairline)' }}>
          <Esqueleto ancho={130} alto={15} radio={5} />
          <Esqueleto ancho={110} alto={32} radio={8} />
          <Esqueleto ancho="76%" alto={15} radio={5} />
        </span>
        <Esqueleto ancho={190} alto={52} radio={26} />
      </span>
    </div>
  );
}

// ── Error de carga, con su salida ─────────────────────────────────────────────

export function HeroError({ onReintentar }: { onReintentar: () => Promise<void> | void }) {
  const [reintentando, setReintentando] = useState(false);
  const reintenta = () => {
    if (reintentando) return;
    setReintentando(true);
    void Promise.resolve(onReintentar()).finally(() => setReintentando(false));
  };
  return (
    <Hero tono="peligro" vivo="alert" etiqueta="No pudimos cargar tus carreras">
      <Arriba>
        <Kicker tono="peligro">Tus carreras</Kicker>
        <Titulo tono="peligro">No pudimos cargar tus carreras</Titulo>
        <Apoyo tono="peligro">Revisa tu conexión e inténtalo de nuevo.</Apoyo>
      </Arriba>
      <Abajo>
        <button
          type="button"
          className="hd-toque"
          onClick={reintenta}
          disabled={reintentando}
          aria-busy={reintentando}
          style={{ width: 'auto', alignSelf: 'flex-start', minHeight: TOQUE }}
        >
          <Accion
            icono={
              <span className={reintentando ? 'hd-gira' : undefined} style={{ display: 'inline-flex' }}>
                <IcoReintentar tam={20} />
              </span>
            }
          >
            {reintentando ? 'Reintentando' : 'Reintentar'}
          </Accion>
        </button>
      </Abajo>
    </Hero>
  );
}

