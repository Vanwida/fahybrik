'use client';

// LA META: «¿A qué vas?». Cómo habla un atleta de HYROX (sub-60, sub-70…) en vez
// de marcar un reloj, con «Acabarla bien» para la primera carrera sin reloj y el
// tiempo exacto como salida discreta. Una sola pieza para las dos hojas donde se
// elige (fijar una carrera nueva, cambiar el tiempo de una ya fijada), como
// `GoalPresets.swift` en la app. Todo se resuelve al MISMO campo: la meta en
// segundos (o nada).

import { useState, type CSSProperties } from 'react';
import type { ProximaCarrera } from '../../kit-carreras/contrato';
import { PELDANOS_META } from '../../kit-carreras/datos';
import { fechaConDia, metaTexto } from '../../kit-carreras/formato';
import { fuente, RADIO, TAM } from '../../kit-dia/tokens';
import { Hoja } from './hojas';
import { BotonPrimario, BotonTexto, Tarjeta } from './piezas';

export type EleccionMeta = { tipo: 'peldano'; segundos: number } | { tipo: 'acabarla' } | { tipo: 'exacta' } | null;

export interface TiempoExacto {
  h: number;
  m: number;
  s: number;
}

/** La meta en segundos de una elección; «acabarla bien» y «nada elegido» son sin reloj. */
export function metaDeEleccion(e: EleccionMeta, t: TiempoExacto): number | null {
  if (e?.tipo === 'peldano') return e.segundos;
  if (e?.tipo === 'exacta') {
    const total = t.h * 3600 + t.m * 60 + t.s;
    return total > 0 ? total : null;
  }
  return null;
}

/** Qué elección corresponde a una meta ya guardada: su peldaño si lo es, el tiempo exacto si no. */
export function eleccionDeMeta(metaS: number | null): { eleccion: EleccionMeta; tiempo: TiempoExacto } {
  const tiempo = metaS ? { h: Math.floor(metaS / 3600), m: Math.floor((metaS % 3600) / 60), s: metaS % 60 } : { h: 1, m: 0, s: 0 };
  if (metaS == null) return { eleccion: null, tiempo };
  return { eleccion: PELDANOS_META.some((p) => p.segundos === metaS) ? { tipo: 'peldano', segundos: metaS } : { tipo: 'exacta' }, tiempo };
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function Chip({ titulo, descriptor, elegido, onClick }: { titulo: string; descriptor: string; elegido: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      role="radio"
      aria-checked={elegido}
      aria-label={`${titulo}, ${descriptor}`}
      style={{
        minHeight: 72,
        padding: '10px 12px',
        boxSizing: 'border-box',
        borderRadius: RADIO.fila,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: elegido ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
        border: `1px solid ${elegido ? 'transparent' : 'var(--twin-hairline-strong)'}`,
        color: elegido ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
        textAlign: 'center',
      }}
    >
      <span style={{ ...fuente(800, 22, 1.1, true) }}>{titulo}</span>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.04em', textTransform: 'uppercase' }}>{descriptor}</span>
    </button>
  );
}

export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambia,
}: {
  etiqueta: string;
  opciones: Array<{ id: T; texto: string }>;
  valor: T;
  onCambia: (v: T) => void;
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>{etiqueta}</span>
      <span role="radiogroup" aria-label={etiqueta} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: RADIO.fila, background: 'var(--twin-surface)', border: '1px solid var(--twin-hairline-strong)' }}>
        {opciones.map((o) => {
          const elegido = o.id === valor;
          return (
            <button
              key={o.id}
              type="button"
              className="hd-toque"
              role="radio"
              aria-checked={elegido}
              onClick={() => onCambia(o.id)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: elegido ? 'var(--twin-accent)' : 'transparent',
                color: elegido ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
                ...fuente(700, TAM.suelo, 1),
              }}
            >
              {o.texto}
            </button>
          );
        })}
      </span>
    </span>
  );
}

const paso = (valor: number, max: number, alCambiar: (n: number) => void, unidad: string) => (
  <label key={unidad} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={valor}
      aria-label={unidad === 'h' ? 'Horas' : unidad === 'min' ? 'Minutos' : 'Segundos'}
      onChange={(e) => alCambiar(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
      style={{
        width: '100%',
        minHeight: 52,
        boxSizing: 'border-box',
        textAlign: 'center',
        borderRadius: RADIO.fila,
        border: '1px solid var(--twin-hairline-strong)',
        background: 'var(--twin-surface)',
        color: 'var(--twin-fg)',
        ...fuente(800, 24, 1, true),
        fontVariantNumeric: 'tabular-nums',
      }}
    />
    <span style={{ ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{unidad}</span>
  </label>
);

/** El selector completo. Sin HYROX no hay peldaños de HYROX: solo «sin tiempo» y el exacto. */
export function MetaSelector({
  esHyrox,
  eleccion,
  tiempo,
  onElige,
  onTiempo,
}: {
  esHyrox: boolean;
  eleccion: EleccionMeta;
  tiempo: TiempoExacto;
  onElige: (e: EleccionMeta) => void;
  onTiempo: (t: TiempoExacto) => void;
}) {
  const exacta = eleccion?.tipo === 'exacta';
  const rejilla: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {esHyrox ? (
        <span role="radiogroup" aria-label="Tu tiempo objetivo" style={rejilla}>
          {PELDANOS_META.map((p) => (
            <Chip key={p.segundos} titulo={p.titulo} descriptor={p.descriptor} elegido={eleccion?.tipo === 'peldano' && eleccion.segundos === p.segundos} onClick={() => onElige({ tipo: 'peldano', segundos: p.segundos })} />
          ))}
        </span>
      ) : null}
      <span role="radiogroup" aria-label="Sin reloj">
        <Chip
          titulo={esHyrox ? 'Acabarla bien' : 'Sin tiempo objetivo'}
          descriptor={esHyrox ? 'primera carrera · sin reloj' : 'solo fecha y tipo'}
          elegido={eleccion?.tipo === 'acabarla'}
          onClick={() => onElige({ tipo: 'acabarla' })}
        />
      </span>
      {exacta ? (
        <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {paso(tiempo.h, 5, (h) => onTiempo({ ...tiempo, h }), 'h')}
          {paso(tiempo.m, 59, (m) => onTiempo({ ...tiempo, m }), 'min')}
          {paso(tiempo.s, 59, (s) => onTiempo({ ...tiempo, s }), 's')}
        </span>
      ) : (
        <BotonTexto centrado onClick={() => onElige({ tipo: 'exacta' })}>
          Prefiero un tiempo exacto…
        </BotonTexto>
      )}
    </span>
  );
}

// ── La hoja del tiempo de una carrera YA fijada ───────────────────────────────

/**
 * «¿A qué vas?» para una carrera que el atleta ya fijó: el mismo selector sobre lo
 * que ya eligió (peldaño o exacto) y nada más. La formato, división y categoría no
 * se le vuelven a preguntar. Guardar es idempotente por evento.
 */
export function HojaMeta({ carrera, hoy, onGuarda, onCerrar }: { carrera: ProximaCarrera; hoy: string; onGuarda: (metaS: number | null) => void; onCerrar: () => void }) {
  const inicial = eleccionDeMeta(carrera.metaS);
  const [eleccion, setEleccion] = useState<EleccionMeta>(inicial.eleccion);
  const [tiempo, setTiempo] = useState<TiempoExacto>(inicial.tiempo);
  const [guardando, setGuardando] = useState(false);
  const esHyrox = carrera.tipoEvento === 'hyrox';
  const meta = metaDeEleccion(eleccion, tiempo);
  // «Acabarla bien» ES una elección (borra el reloj a propósito); sin elegir nada no hay qué guardar.
  const puede = eleccion != null && !guardando && (eleccion.tipo !== 'exacta' || meta != null);
  const guarda = () => {
    if (!puede) return;
    setGuardando(true);
    setTimeout(() => onGuarda(meta), 700);
  };
  return (
    <Hoja
      titulo="Tu tiempo objetivo"
      onCerrar={onCerrar}
      accion={
        <BotonPrimario ocupado={guardando} activo={puede} onClick={guarda} textoOcupado="Guardando…" voz="Guardando tu tiempo objetivo">
          Guardar
        </BotonPrimario>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Tarjeta style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...fuente(800, 20, 1.15, true), color: 'var(--twin-fg)' }}>{carrera.nombre}</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
            {[carrera.fecha ? fechaConDia(carrera.fecha, hoy) : 'Fecha por confirmar', carrera.metaS != null ? `Ahora: ${metaTexto(carrera.metaS)}` : 'Sin tiempo fijado'].join(' · ')}
          </span>
        </Tarjeta>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>¿A qué vas?</span>
          <span style={{ ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>Tu plan y tu analítica se enfocan en esto.</span>
        </span>
        <MetaSelector esHyrox={esHyrox} eleccion={eleccion} tiempo={tiempo} onElige={setEleccion} onTiempo={setTiempo} />
      </div>
    </Hoja>
  );
}

