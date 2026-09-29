'use client';

// PASADAS — tu historial y lo que dice de ti. En orden de la pregunta con la que
// se abre: ¿cómo me fue la última? → ¿cómo me fue contra lo previsto? → ¿dónde
// perdí tiempo? (estaciones, ritmo) → ¿voy a mejor? (evolución) → todas mis
// carreras. Cada fila del historial se despliega a sus parciales; las de dobles y
// relevos dicen que los tiempos son DEL EQUIPO (un tiempo compartido no es el tuyo).
//
// Estados: con datos · en frío (esqueletos con la forma final) · vacío con su
// salida (importar el historial) · error del análisis (local, con «Reintentar»).
// Con el sujeto ya siendo la invitación (vacío) esta sección no existe: el póster
// lleva las dos salidas y repetirlas aquí sería el mismo hueco dos veces.

import { useId, useState } from 'react';
import type { CarreraPasada, LecturaCarreras } from '../../kit-carreras/contrato';
import { resumenDe, soloDeEquipo, ultimaConResultado, ordenarPasadas, type Sujeto } from '../../kit-carreras/decide';
import { ESTACION, etiquetaDivision, etiquetaEquipo, fechaOConfirmar, reloj, relojCarrera, textoEquipo } from '../../kit-carreras/formato';
import { IcoChevron, IcoCronometro, IcoMas } from '../../kit-dia/iconos';
import { Esqueleto, Etiqueta, Pastilla, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, tinte, velo } from '../../kit-dia/tokens';
import { Giro } from './proximas';
import { AnalisisConError, Estaciones, EsqueletoAnalisis, Evolucion, Informe, PuertaPredichoVsReal, RitmoPorKm, SubTitulo } from './analisis';
import { BotonTexto, IcoBandera, IcoPersonas, IcoPersonaX, PastillaSeccion, SalidaAccion, Tarjeta, Vacio } from './piezas';
import { Cinta, Parciales, PildoraDelta, PildoraPuesto } from './resumen';

/** Desde cuántas carreras se pliega el historial, y cuántas quedan a la vista al plegar. */
const PLEGAR_DESDE = 5;
const VISIBLES_PLEGADO = 3;

// ── Tu última carrera (la tarjeta, cuando el sujeto es otra cosa) ─────────────

function TarjetaUltima({ c, l }: { c: CarreraPasada; l: LecturaCarreras }) {
  const r = resumenDe(c, l.pasadas);
  const equipo = etiquetaEquipo(c.formato);
  const conQuien = textoEquipo(c.companeros);
  return (
    <Tarjeta style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Etiqueta color="var(--twin-accent-text)">Tu última carrera</Etiqueta>
        <span style={{ ...fuente(800, 22, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)', textWrap: 'balance' }}>{c.nombre}</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
          {[fechaOConfirmar(c.fecha, l.hoy), etiquetaDivision(c.division)].join(' · ')}
        </span>
      </span>
      {r.totalS != null ? (
        <span style={{ ...fuente(800, TAM.display, 1, true), letterSpacing: '-0.03em', color: 'var(--twin-fg)', ...TABULAR }}>{relojCarrera(r.totalS)}</span>
      ) : null}
      {equipo ? (
        <Cinta icono={<IcoPersonas tam={18} />}>
          Tiempo del equipo{conQuien ? ` · ${conQuien}` : ''}
        </Cinta>
      ) : (
        <PildoraDelta deltaS={r.deltaAnteriorS} />
      )}
      <PildoraPuesto texto={r.puesto} />
      <Parciales r={r} />
    </Tarjeta>
  );
}

// ── Una fila del historial ────────────────────────────────────────────────────

const celda = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 4px', borderRadius: 10, background: 'var(--twin-surface-sunken)' } as const;

function Parcial({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span style={celda} role="group" aria-label={`${etiqueta}: ${valor}`}>
      <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)', ...TABULAR }}>{etiqueta}</span>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>{valor}</span>
    </span>
  );
}

function Parciales4({ c }: { c: CarreraPasada }) {
  const equipo = c.formato !== 'singles';
  const vueltas = c.vueltas.map((s, i) => ({ km: i + 1, s })).filter((v): v is { km: number; s: number } => v.s != null && v.s > 0);
  const estaciones = c.estaciones.filter((e) => (e.segundos ?? 0) > 0).sort((a, b) => a.indice - b.indice);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {equipo ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            borderRadius: RADIO.fila,
            background: tinte('var(--twin-info)', 12, 'var(--twin-surface)'),
            border: `1px solid ${velo('var(--twin-info)', 34)}`,
            ...fuente(600, TAM.suelo, 1.3),
            color: 'var(--twin-fg)',
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--twin-info)', paddingTop: 1 }}>
            <IcoPersonas tam={18} />
          </span>
          Parciales del equipo: tiempos compartidos, no individuales.
        </span>
      ) : null}
      {vueltas.length > 0 ? (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Etiqueta>{equipo ? 'Carrera · equipo, por km' : 'Carrera · por km'}</Etiqueta>
          <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {vueltas.map((v) => (
              <Parcial key={v.km} etiqueta={`km ${v.km}`} valor={reloj(v.s)} />
            ))}
          </span>
        </span>
      ) : null}
      {estaciones.length > 0 ? (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Etiqueta>{equipo ? 'Estaciones · equipo' : 'Estaciones'}</Etiqueta>
          {estaciones.map((e) => (
            <span key={e.indice} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
              <span>{ESTACION[e.indice] ?? `Estación ${e.indice}`}</span>
              <span style={{ ...fuente(700, TAM.suelo, 1.4), color: 'var(--twin-fg)', ...TABULAR }}>{reloj(e.segundos!)}</span>
            </span>
          ))}
        </span>
      ) : null}
      {c.correrS != null || c.roxzoneS != null ? (
        <span style={{ display: 'flex', gap: 12 }}>
          {c.correrS != null ? <Total etiqueta="Carrera" s={c.correrS} /> : null}
          {c.roxzoneS != null ? <Total etiqueta="RoxZone" s={c.roxzoneS} /> : null}
        </span>
      ) : null}
    </div>
  );
}

const Total = ({ etiqueta, s }: { etiqueta: string; s: number }) => (
  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{etiqueta}</span>
    <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>{reloj(s)}</span>
  </span>
);

function FilaPasada({ c, hoy, onImportar }: { c: CarreraPasada; hoy: string; onImportar: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const equipo = etiquetaEquipo(c.formato);
  const conQuien = textoEquipo(c.companeros);
  const pendiente = c.resultadoS == null;
  const conParciales = c.vueltas.some((v) => (v ?? 0) > 0) || c.estaciones.some((e) => (e.segundos ?? 0) > 0);
  const abre = !pendiente && conParciales;
  const linea = [fechaOConfirmar(c.fecha, hoy), etiquetaDivision(c.division)].join(' · ');
  const etiqueta = [c.nombre, linea, equipo, conQuien, pendiente ? 'resultado pendiente, toca para importarlo' : relojCarrera(c.resultadoS!), abre ? (abierta ? 'parciales abiertos' : 'toca para ver los parciales') : null]
    .filter(Boolean)
    .join('. ');

  const cabecera = (
    <>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
        <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', textWrap: 'balance' }}>{c.nombre}</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{linea}</span>
        {equipo || c.tipoEvento === 'deka' ? (
          <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {equipo ? (
              <Pastilla
                fondo={tinte('var(--twin-accent)', 14, 'var(--twin-surface)')}
                tinta="var(--twin-fg)"
                borde={velo('var(--twin-accent)', 55)}
                icono={<span style={{ display: 'inline-flex', color: 'var(--twin-accent-text)' }}><IcoPersonas tam={16} /></span>}
              >
                {equipo}
              </Pastilla>
            ) : null}
            {c.tipoEvento === 'deka' ? (
              <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
                DEKA
              </Pastilla>
            ) : null}
            {conQuien ? <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{conQuien}</span> : null}
          </span>
        ) : null}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: '0 0 auto' }}>
        {pendiente ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>
            <IcoCronometro tam={18} />
            Resultado pendiente
          </span>
        ) : (
          <span style={{ ...fuente(800, TAM.cuerpo, 1.2), color: 'var(--twin-fg)', ...TABULAR }}>{relojCarrera(c.resultadoS!)}</span>
        )}
        {abre || pendiente ? (
          <span className="cr-fila-abre" style={{ color: 'var(--twin-muted)', display: 'inline-flex', transform: pendiente ? undefined : abierta ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
            <IcoChevron tam={18} />
          </span>
        ) : null}
      </span>
    </>
  );

  const estiloCabecera = { minHeight: 72, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', boxSizing: 'border-box' } as const;

  return (
    <Tarjeta style={{ overflow: 'hidden' }}>
      {abre || pendiente ? (
        <button
          type="button"
          className="hd-toque"
          onClick={pendiente ? onImportar : () => setAbierta((a) => !a)}
          aria-label={etiqueta}
          aria-expanded={pendiente ? undefined : abierta}
          aria-controls={pendiente ? undefined : id}
          style={estiloCabecera}
        >
          {cabecera}
        </button>
      ) : (
        <div style={estiloCabecera} aria-label={etiqueta} role="group">
          {cabecera}
        </div>
      )}
      {abierta && abre ? (
        <div id={id} style={{ padding: '2px 16px 16px', borderTop: '1px solid var(--twin-hairline)' }}>
          <div style={{ height: 12 }} />
          <Parciales4 c={c} />
        </div>
      ) : null}
    </Tarjeta>
  );
}

function Historial({ pasadas, hoy, onImportar, onQuitarImportacion }: { pasadas: CarreraPasada[]; hoy: string; onImportar: () => void; onQuitarImportacion: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const orden = ordenarPasadas(pasadas);
  const plegable = orden.length >= PLEGAR_DESDE;
  const visibles = plegable && !abierto ? orden.slice(0, VISIBLES_PLEGADO) : orden;
  const resto = orden.length - VISIBLES_PLEGADO;
  const hayImportadas = orden.some((p) => p.resultadoS != null);
  return (
    <section aria-label="Historial" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SubTitulo nota={`${orden.length} ${orden.length === 1 ? 'carrera' : 'carreras'}, la más reciente primero. Toca una para ver sus parciales.`}>Historial</SubTitulo>
      <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibles.map((c) => (
          <FilaPasada key={c.raceId} c={c} hoy={hoy} onImportar={onImportar} />
        ))}
      </div>
      {plegable ? (
        <Tarjeta style={{ overflow: 'hidden' }}>
          <BotonTexto onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls={id} derecha={<Giro abierto={abierto} />}>
            {abierto ? 'Ver menos' : `Ver ${resto} más`}
          </BotonTexto>
        </Tarjeta>
      ) : null}
      {/* Importar el perfil equivocado trae el historial de un desconocido: la salida es clara y sobria. */}
      {hayImportadas ? (
        <BotonTexto tono="suave" onClick={onQuitarImportacion} icono={<IcoPersonaX tam={20} />}>
          ¿No eres tú? Eliminar carreras importadas
        </BotonTexto>
      ) : null}
    </section>
  );
}

// ── La sección ────────────────────────────────────────────────────────────────

export function Pasadas({
  l,
  s,
  onImportar,
  onQuitarImportacion,
  onEstacion,
  onPredichoVsReal,
  onReintentarAnalisis,
}: {
  l: LecturaCarreras;
  s: Sujeto;
  onImportar: () => void;
  onQuitarImportacion: () => void;
  onEstacion: (estacion: string) => void;
  onPredichoVsReal: () => void;
  onReintentarAnalisis: () => void;
}) {
  // El póster vacío ya lleva las dos salidas; y en error o cargando la sección no sabe qué enseñar aún.
  if (s.tipo === 'vacio' || s.tipo === 'error') return null;

  if (s.tipo === 'cargando') {
    return (
      <section aria-busy aria-label="Cargando tu historial" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={110} alto={26} radio={8} />
        </span>
        <Tarjeta style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 168 }}>
          <Esqueleto ancho={150} alto={15} radio={5} />
          <Esqueleto ancho="60%" alto={22} radio={7} />
          <Esqueleto ancho={140} alto={44} radio={10} />
          <Esqueleto ancho="70%" alto={32} radio={16} />
        </Tarjeta>
      </section>
    );
  }

  if (l.pasadas.length === 0) {
    return (
      <section aria-label="Pasadas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TituloSeccion>Pasadas</TituloSeccion>
        <Vacio
          icono={<IcoBandera tam={24} />}
          titulo="Aún no hay carreras pasadas"
          mensaje="Busca tu nombre e importa tu historial de HYROX, individuales y dobles, y verás aquí tus parciales, tus puntos débiles y tu evolución."
          salida={
            <SalidaAccion onClick={onImportar} icono={<IcoMas tam={20} />}>
              Importar historial
            </SalidaAccion>
          }
        />
      </section>
    );
  }

  const ultima = ultimaConResultado(l.pasadas);
  const tarjeta = s.tipo === 'ultima' || !ultima ? null : <TarjetaUltima c={ultima} l={l} />;
  const a = l.analisis;
  // Con el análisis aún por llegar hay que dejarle su sitio si se espera uno (hay una individual con resultado).
  const esperaAnalisis = l.pasadas.some((p) => p.formato === 'singles' && p.resultadoS != null);

  return (
    <section aria-label="Pasadas" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <TituloSeccion aparte={<PastillaSeccion onClick={onImportar} icono={<IcoMas tam={18} />}>Importar</PastillaSeccion>}>Pasadas</TituloSeccion>
      {tarjeta}
      {a?.predichoVsReal ? <PuertaPredichoVsReal p={a.predichoVsReal} nombre={a.deCarrera.nombre} onAbre={onPredichoVsReal} /> : null}
      {l.carga.analisis === 'fria' && esperaAnalisis ? <EsqueletoAnalisis /> : null}
      {l.carga.analisis === 'error' && esperaAnalisis ? <AnalisisConError onReintentar={onReintentarAnalisis} /> : null}
      {a && l.carga.analisis === 'lista' ? (
        <>
          {l.conCoach ? <Informe a={a} /> : null}
          <Estaciones a={a} onAbre={onEstacion} />
          <RitmoPorKm a={a} />
        </>
      ) : null}
      <Evolucion pasadas={l.pasadas} />
      {soloDeEquipo(l.pasadas) ? (
        <span style={{ ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
          El análisis por estación y por km sale de tus carreras individuales: en dobles y relevos el tiempo es del equipo.
        </span>
      ) : null}
      <Historial pasadas={l.pasadas} hoy={l.hoy} onImportar={onImportar} onQuitarImportacion={onQuitarImportacion} />
    </section>
  );
}

