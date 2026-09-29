'use client';

// BUSCAR CARRERA y FIJAR OBJETIVO — el camino de «Buscar carrera»: hojeas el
// calendario oficial (buscador, familia y fecha), eliges una y la FIJAS como tu
// carrera objetivo con su formato, división, categoría y tiempo. Lo que fijes pasa
// a ser el principal, y el que había pasa a secundaria: la hoja lo dice ANTES de
// fijar (en la app hoy ocurre sin avisar).
//
// Estados de la lista: cargando (esqueleto con la forma de las filas) · error (con
// «Reintentar») · sin carreras (con «Quitar los filtros») · lista por meses. Las
// facetas se derivan de lo cargado, no de una lista escrita a mano.

import { useEffect, useMemo, useState } from 'react';
import type { EventoCalendario, ProximaCarrera } from '../../kit-carreras/contrato';
import { CALENDARIO, eventosCargados, eventosVisibles, facetas, FAMILIAS, HOY, PISTAS_BUSQUEDA, VENTANAS_FECHA } from '../../kit-carreras/datos';
import { fechaConDia, mesLargo } from '../../kit-carreras/formato';
import { IcoChevron, IcoCheck, IcoLupa, IcoMas } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { fuente, RADIO, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';
import { Hoja } from './hojas';
import { Fijar, type EleccionFijar } from './fijar';
import { Aviso, BotonTexto, Campo, IcoCerrar, SalidaAccion, Tarjeta } from './piezas';


const CARGA_MS = 450;

// ── Chips de filtro ───────────────────────────────────────────────────────────

function Chip({ texto, elegido, onClick }: { texto: string; elegido: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      aria-pressed={elegido}
      style={{
        width: 'auto',
        flex: '0 0 auto',
        minHeight: 44,
        padding: '0 16px',
        borderRadius: RADIO.pastilla,
        display: 'inline-flex',
        alignItems: 'center',
        background: elegido ? 'var(--twin-accent)' : 'var(--twin-surface)',
        color: elegido ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
        border: `1px solid ${elegido ? 'transparent' : 'var(--twin-hairline-strong)'}`,
        ...fuente(700, TAM.suelo, 1),
      }}
    >
      {texto}
    </button>
  );
}

function FilaChips({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>{etiqueta}</span>
      <span className="twin-scroll" role="group" aria-label={etiqueta} style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', margin: '0 -20px', padding: '0 20px 2px' }}>
        {children}
      </span>
    </span>
  );
}

// ── Una fila del calendario ───────────────────────────────────────────────────

function FilaEvento({ e, esObjetivo, onElige }: { e: EventoCalendario; esObjetivo: boolean; onElige: (e: EventoCalendario) => void }) {
  const cuando = e.fecha ? fechaConDia(e.fecha, HOY) : 'Fecha por confirmar';
  const donde = [e.ciudad, cuando].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={() => onElige(e)}
      aria-label={[e.serie, e.nombre, donde, esObjetivo ? 'tu carrera objetivo' : null].filter(Boolean).join('. ')}
      style={{ borderRadius: RADIO.tarjeta }}
    >
      <Tarjeta realce={esObjetivo} style={{ minHeight: 76, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {e.serie ? (
            <span style={{ alignSelf: 'flex-start', minHeight: 26, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: RADIO.pastilla, background: tinte('var(--twin-accent)', 12, 'var(--twin-surface)'), color: 'var(--twin-accent-text)', ...fuente(800, TAM.suelo, 1), letterSpacing: '0.04em', textTransform: 'uppercase' }}>{e.serie}</span>
          ) : null}
          <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{e.nombre}</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{donde}</span>
        </span>
        {esObjetivo ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: RADIO.pastilla, background: tinte('var(--twin-ok)', 15, 'var(--twin-surface)'), border: `1px solid ${velo('var(--twin-ok)', 34)}`, color: 'var(--twin-fg)', ...fuente(700, TAM.suelo, 1) }}>
            <span style={{ display: 'inline-flex', color: 'var(--twin-ok)' }}>
              <IcoCheck tam={16} />
            </span>
            Tu objetivo
          </span>
        ) : (
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IcoChevron tam={18} />
          </span>
        )}
      </Tarjeta>
    </button>
  );
}

function EsqueletoLista() {
  return (
    <div aria-busy aria-label="Cargando el calendario" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Esqueleto ancho={150} alto={15} radio={5} />
      {[0, 1, 2, 3].map((i) => (
        <Tarjeta key={i} style={{ minHeight: 76, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <Esqueleto ancho={64} alto={20} radio={10} />
          <Esqueleto ancho="62%" alto={17} radio={6} />
          <Esqueleto ancho="44%" alto={15} radio={5} />
        </Tarjeta>
      ))}
    </div>
  );
}

// ── El calendario ─────────────────────────────────────────────────────────────

function Calendario({ principal, onElige, onPersonalizada }: { principal: ProximaCarrera | null; onElige: (e: EventoCalendario) => void; onPersonalizada: () => void }) {
  const [consulta, setConsulta] = useState('');
  const [familia, setFamilia] = useState<EventoCalendario['familia'] | null>(null);
  const [ventana, setVentana] = useState('todas');
  const [serie, setSerie] = useState<string | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);

  // Cada cambio de filtro «vuelve a pedir» el calendario: el estado en frío es real, no decorado.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    const t = setTimeout(() => setCargando(false), CARGA_MS);
    return () => clearTimeout(t);
  }, [consulta, familia, ventana, recarga]);

  const fallo = consulta.trim().toLowerCase().includes(PISTAS_BUSQUEDA.error);
  const meses = VENTANAS_FECHA.find((v) => v.id === ventana)?.meses ?? null;
  // Las facetas salen de lo que ya trajo el servidor; una elegida que ya no existe se suelta sola.
  const cargados = useMemo(() => eventosCargados(CALENDARIO, { consulta: fallo ? '' : consulta, familia, meses }), [consulta, familia, meses, fallo]);
  const { series, paises } = useMemo(() => facetas(cargados), [cargados]);
  const serieActiva = serie != null && series.includes(serie) ? serie : null;
  const paisActivo = pais != null && paises.includes(pais) ? pais : null;
  const visibles = useMemo(() => eventosVisibles(CALENDARIO, { consulta: fallo ? '' : consulta, familia, meses, serie: serieActiva, pais: paisActivo }), [consulta, familia, meses, fallo, serieActiva, paisActivo]);
  const grupos = useMemo(() => {
    const por = new Map<string, EventoCalendario[]>();
    for (const e of visibles) {
      const clave = e.fecha ? e.fecha.slice(0, 7) : 'sin-fecha';
      por.set(clave, [...(por.get(clave) ?? []), e]);
    }
    return [...por.entries()].sort(([a], [b]) => (a === 'sin-fecha' ? 1 : b === 'sin-fecha' ? -1 : a.localeCompare(b)));
  }, [visibles]);

  const quitaFiltros = () => {
    setConsulta('');
    setFamilia(null);
    setVentana('todas');
    setSerie(null);
    setPais(null);
  };
  const esObjetivo = (e: EventoCalendario) => principal != null && principal.nombre === e.nombre && principal.fecha === e.fecha;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>Elige tu objetivo</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>Running, híbrida, CrossFit u OCR: elige del calendario o créalo si no está.</span>
      </span>

      <Campo
        etiqueta="Buscar"
        izquierda={<IcoLupa tam={20} />}
        derecha={
          consulta ? (
            <button type="button" className="hd-toque" aria-label="Borrar búsqueda" onClick={() => setConsulta('')} style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', color: 'var(--twin-muted)' }}>
              <IcoCerrar tam={18} />
            </button>
          ) : null
        }
      >
        <input type="text" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Ciudad o nombre de la carrera" autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="search" aria-label="Ciudad o nombre de la carrera" />
      </Campo>

      <FilaChips etiqueta="Familia">
        <Chip texto="Todas" elegido={familia == null} onClick={() => setFamilia(null)} />
        {FAMILIAS.map((f) => (
          <Chip key={f.id} texto={f.etiqueta} elegido={familia === f.id} onClick={() => setFamilia(familia === f.id ? null : f.id)} />
        ))}
      </FilaChips>
      {series.length > 1 ? (
        <FilaChips etiqueta="Serie">
          <Chip texto="Todas" elegido={serieActiva == null} onClick={() => setSerie(null)} />
          {series.map((x) => (
            <Chip key={x} texto={x} elegido={serieActiva === x} onClick={() => setSerie(serieActiva === x ? null : x)} />
          ))}
        </FilaChips>
      ) : null}
      {paises.length > 1 ? (
        <FilaChips etiqueta="País">
          <Chip texto="Todos" elegido={paisActivo == null} onClick={() => setPais(null)} />
          {paises.map((x) => (
            <Chip key={x} texto={x} elegido={paisActivo === x} onClick={() => setPais(paisActivo === x ? null : x)} />
          ))}
        </FilaChips>
      ) : null}
      <FilaChips etiqueta="Fecha">
        {VENTANAS_FECHA.map((v) => (
          <Chip key={v.id} texto={v.etiqueta} elegido={ventana === v.id} onClick={() => setVentana(v.id)} />
        ))}
      </FilaChips>

      {cargando ? (
        <EsqueletoLista />
      ) : fallo ? (
        <Aviso salida={<BotonTexto tono="tinta" onClick={() => setRecarga((r) => r + 1)}>Reintentar</BotonTexto>}>
          No pudimos cargar el calendario. Revisa tu conexión e inténtalo de nuevo.
        </Aviso>
      ) : grupos.length === 0 ? (
        <Tarjeta style={{ padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ ...fuente(800, 20, 1.15, true), color: 'var(--twin-fg)' }}>Sin carreras</span>
          <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>No encontramos carreras con estos filtros. Prueba con otra búsqueda o amplía el rango de fechas.</span>
          <SalidaAccion onClick={quitaFiltros}>Quitar los filtros</SalidaAccion>
        </Tarjeta>
      ) : (
        grupos.map(([clave, eventos]) => (
          <section key={clave} aria-label={clave === 'sin-fecha' ? 'Fecha por confirmar' : mesLargo(`${clave}-01`)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>{clave === 'sin-fecha' ? 'Fecha por confirmar' : mesLargo(`${clave}-01`)}</span>
            {eventos.map((e) => (
              <FilaEvento key={e.id} e={e} esObjetivo={esObjetivo(e)} onElige={onElige} />
            ))}
          </section>
        ))
      )}

      <BotonTexto centrado onClick={onPersonalizada} icono={<IcoMas tam={20} />}>
        Crear objetivo personalizado
      </BotonTexto>
    </div>
  );
}

// ── La hoja ───────────────────────────────────────────────────────────────────

export type { EleccionFijar };

export function HojaBuscar({ principal, falla, onFijado, onCerrar, onLog }: { principal: ProximaCarrera | null; /** Solo del doble: fijar falla, para ver su error. */ falla: boolean; onFijado: (e: EleccionFijar) => void; onCerrar: () => void; onLog: (linea: string) => void }) {
  const [evento, setEvento] = useState<EventoCalendario | null>(null);
  if (evento) return <Fijar evento={evento} principal={principal} falla={falla} onFija={onFijado} onAtras={() => setEvento(null)} />;
  return (
    <Hoja titulo="Buscar carrera" onCerrar={onCerrar} alto="llena">
      <Calendario principal={principal} onElige={setEvento} onPersonalizada={() => onLog('Buscar carrera → crear objetivo personalizado (nombre, fecha, tipo)')} />
    </Hoja>
  );
}
