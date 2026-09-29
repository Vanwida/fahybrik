'use client';

// FIJAR OBJETIVO — el paso que sigue a elegir una carrera del calendario: cuándo es,
// cómo la corres y a qué tiempo vas. Lo que hay que preguntar depende de la FAMILIA de
// la carrera, y hoy la app ya lo hace así:
//   · híbrida (HYROX, DEKA…) → formato, división y categoría;
//   · running               → la distancia (y si es homologada);
//   · CrossFit, OCR, otra   → la división, en texto libre.
// El selector de tiempo lleva los peldaños de HYROX solo si es HYROX: para el resto solo
// «sin tiempo» y el exacto. Todo lo que se elige se manda como en la app; el doble solo
// pinta con lo que su lista lee (formato, división, categoría, fecha, meta).
//
// Fijar la hace la PRINCIPAL y la que había pasa a secundaria: se dice ANTES de fijar.

import { useState } from 'react';
import type { Categoria, Division, EventoCalendario, Formato, ProximaCarrera } from '../../kit-carreras/contrato';
import { HOY } from '../../kit-carreras/datos';
import { fechaConDia } from '../../kit-carreras/formato';
import { IcoCalendario } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, velo } from '../../kit-dia/tokens';
import { Hoja } from './hojas';
import { eleccionDeMeta, MetaSelector, metaDeEleccion, Segmentado, type EleccionMeta, type TiempoExacto } from './meta';
import { Aviso, BotonPrimario, Campo, Tarjeta } from './piezas';

export interface EleccionFijar {
  evento: EventoCalendario;
  formato: Formato;
  division: Division;
  categoria: Categoria;
  metaS: number | null;
  fecha: string | null;
}

const FORMATOS: Array<{ id: Formato; texto: string }> = [
  { id: 'singles', texto: 'Individual' },
  { id: 'doubles', texto: 'Dobles' },
  { id: 'relay', texto: 'Relevos' },
];
const DIVISIONES: Array<{ id: Division; texto: string }> = [
  { id: 'open', texto: 'Open' },
  { id: 'pro', texto: 'Pro' },
  { id: 'elite', texto: 'Elite' },
];
const CATEGORIAS: Array<{ id: Categoria; texto: string }> = [
  { id: 'men', texto: 'Hombres' },
  { id: 'women', texto: 'Mujeres' },
  { id: 'mixed', texto: 'Mixto' },
];

/** Las distancias de un running, como las ofrece la app; «Otra» pide los metros. */
const DISTANCIAS = [
  { id: '5k', texto: '5 km' },
  { id: '10k', texto: '10 km' },
  { id: 'half', texto: '21,1 km' },
  { id: 'marathon', texto: '42,2 km' },
  { id: 'custom', texto: 'Otra' },
] as const;


/** Un interruptor de 52 pt (la app usa un Toggle nativo). */
function Interruptor({ etiqueta: texto, activo, onCambia }: { etiqueta: string; activo: boolean; onCambia: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="hd-toque"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambia(!activo)}
      style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}
    >
      {texto}
      <span aria-hidden style={{ width: 52, height: 32, borderRadius: 16, padding: 3, boxSizing: 'border-box', display: 'flex', justifyContent: activo ? 'flex-end' : 'flex-start', background: activo ? 'var(--twin-accent)' : velo('var(--twin-fg)', 22), transition: 'background 140ms ease-out' }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--twin-surface-elevated)', boxShadow: 'var(--twin-shadow-card-tight)' }} />
      </span>
    </button>
  );
}

export function Fijar({ evento, principal, falla, onFija, onAtras }: { evento: EventoCalendario; principal: ProximaCarrera | null; falla: boolean; onFija: (e: EleccionFijar) => void; onAtras: () => void }) {
  const [formato, setFormato] = useState<Formato>('singles');
  const [division, setDivision] = useState<Division>('open');
  const [categoria, setCategoria] = useState<Categoria>('men');
  const [distancia, setDistancia] = useState<(typeof DISTANCIAS)[number]['id']>('10k');
  const [metros, setMetros] = useState('');
  const [homologada, setHomologada] = useState(false);
  const [divisionLibre, setDivisionLibre] = useState('');
  const [eleccion, setEleccion] = useState<EleccionMeta>(null);
  const [tiempo, setTiempo] = useState<TiempoExacto>(eleccionDeMeta(null).tiempo);
  const [fecha, setFecha] = useState<string>(evento.fecha ?? HOY);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esHyrox = evento.tipoEvento === 'hyrox' && evento.familia === 'hybrid';
  const sinConfirmar = evento.fecha == null || evento.provisional;

  const fija = () => {
    if (enviando) return;
    setError(null);
    setEnviando(true);
    setTimeout(() => {
      if (falla) {
        setEnviando(false);
        setError('No se pudo guardar tu carrera. Inténtalo de nuevo.');
        return;
      }
      onFija({ evento, formato, division, categoria, metaS: metaDeEleccion(eleccion, tiempo), fecha });
    }, 900);
  };

  return (
    <Hoja
      titulo="Fijar objetivo"
      onCerrar={onAtras}
      atras={onAtras}
      alto="llena"
      accion={
        <BotonPrimario ocupado={enviando} onClick={fija} textoOcupado="Guardando…" voz="Guardando tu carrera objetivo">
          Fijar como mi carrera objetivo
        </BotonPrimario>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Tarjeta realce style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {evento.serie ? <span style={{ ...fuente(800, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>{evento.serie}</span> : null}
          <span style={{ ...fuente(800, 24, 1.15, true), color: 'var(--twin-fg)', textWrap: 'balance' }}>{evento.nombre}</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{[evento.ciudad, evento.fecha ? fechaConDia(evento.fecha, HOY) : 'Fecha por confirmar'].filter(Boolean).join(' · ')}</span>
        </Tarjeta>

        <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Campo etiqueta="Para cuándo es" izquierda={<IcoCalendario tam={20} />}>
            <input type="date" value={fecha} min={HOY} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Fecha de la carrera" style={{ minHeight: 48 }} />
          </Campo>
          {sinConfirmar ? (
            <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
              Este evento aún no tiene fecha confirmada en el calendario. Elige cuándo lo tienes previsto.
            </span>
          ) : null}
        </span>

        {evento.familia === 'hybrid' ? (
          <>
            <Segmentado etiqueta="Formato" opciones={FORMATOS} valor={formato} onCambia={setFormato} />
            <Segmentado etiqueta="División" opciones={DIVISIONES} valor={division} onCambia={setDivision} />
            <Segmentado etiqueta="Categoría" opciones={CATEGORIAS} valor={categoria} onCambia={setCategoria} />
          </>
        ) : evento.familia === 'running' ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Segmentado etiqueta="Distancia" opciones={DISTANCIAS.map((d) => ({ id: d.id, texto: d.texto }))} valor={distancia} onCambia={setDistancia} />
            {distancia === 'custom' ? (
              <Campo etiqueta="Metros">
                <input type="text" inputMode="numeric" value={metros} onChange={(e) => setMetros(e.target.value.replace(/\D/g, ''))} placeholder="Metros" aria-label="Distancia en metros" />
              </Campo>
            ) : null}
            <Interruptor etiqueta="Carrera homologada" activo={homologada} onCambia={setHomologada} />
          </span>
        ) : (
          <Campo etiqueta="División">
            <input type="text" value={divisionLibre} onChange={(e) => setDivisionLibre(e.target.value)} placeholder="Ej. RX · Scaled · Masters" autoComplete="off" aria-label="División" />
          </Campo>
        )}

        <span style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>¿A qué vas?</span>
            <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>Tu plan y tu analítica se enfocan en esto.</span>
          </span>
          <MetaSelector esHyrox={esHyrox} eleccion={eleccion} tiempo={tiempo} onElige={setEleccion} onTiempo={setTiempo} />
          {esHyrox ? <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)', textWrap: 'pretty' }}>El objetivo se traduce en tiempos por estación según datos reales de tu división.</span> : null}
        </span>

        {error ? <Aviso>{error}</Aviso> : null}

        {principal ? (
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: RADIO.fila, background: velo('var(--twin-fg)', 6), border: '1px solid var(--twin-hairline-strong)', ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-fg)', textWrap: 'pretty' }}>
            <span>«{principal.nombre}» pasará a ser secundaria. Un solo objetivo principal a la vez.</span>
          </span>
        ) : null}
      </div>
    </Hoja>
  );
}

