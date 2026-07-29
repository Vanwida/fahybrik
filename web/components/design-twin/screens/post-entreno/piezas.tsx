'use client';

// Átomos compartidos de «Post-entreno» entre la vista «hoy» y la «propuesta».
//
// Tres cosas viven aquí porque las usan LAS DOS vistas y tienen que ser
// idénticas en ambas (si no, el antes/después no compara lo mismo):
// PastillasRPE (el RPE nunca viene puesto de antes, en ninguna de las dos),
// ContenidoComoHaIdo (la misma tarjeta «Cómo ha ido» de SessionFeedbackCard.swift,
// una vez en su Card de siempre y otra dentro de una fila plegada) y BarraZonas
// (el mismo dibujo, con datos preparados distinto por cada vista — hoy sobre la
// SUMA de zonas, propuesta sobre la DURACIÓN — eso lo decide quien la llama).
//
// El resto (CabeceraBloqueHoy, FilaSegmentoHoy, TileMedida, FilaPlegada) son
// piezas de composición del propio "por segmento"/"lo que se midió"/"lo que
// sigue abierto" — no se reparten entre vistas pero tampoco pertenecen dentro
// de hoy.tsx o propuesta.tsx, que ya son largos por su propio contenido.

import type { ReactNode } from 'react';
import { IconChevron, Label, Mono, RAD } from '../../kit';
import type { UMBRAL } from '../../datos-reales';

// ---------------------------------------------------------------------------
// Icono — «square.and.arrow.up» (compartir), el único que falta en kit.tsx
// ---------------------------------------------------------------------------

export function IconShare({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.4v8.6M8 1.4 5.3 4.1M8 1.4l2.7 2.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.6 7v6a1 1 0 0 0 1 1h6.8a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// La celda de medida — transcrita de ExpertCell (Theme/Atoms.swift:355)
// ---------------------------------------------------------------------------

export function TileMedida({ etiqueta, valor, unidad, color = 'var(--twin-fg)' }: { etiqueta: string; valor: string; unidad?: string; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: 12,
      background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline)',
      borderRadius: RAD.m, boxShadow: 'var(--twin-shadow-card-tight)',
    }}>
      <Label size={11}>{etiqueta}</Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ font: 'italic 800 30px/1 var(--twin-font-sans)', color, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
        {unidad && <span style={{ font: '400 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra de zonas — el dibujo es el mismo en las dos vistas; los porcentajes
// que le pasan NO (ver cabecera del fichero). `zona: null` es el tramo "sin
// medir" que solo aparece en la propuesta.
// ---------------------------------------------------------------------------

export interface SegmentoZona {
  zona: 1 | 2 | 3 | 4 | 5 | null;
  pct: number;
  etiqueta: string;
}

export function BarraZonas({ segmentos }: { segmentos: SegmentoZona[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
        {segmentos.map((s, i) => (
          <div key={i} style={{ width: `${Math.max(0, s.pct)}%`, background: s.zona ? `var(--twin-z${s.zona})` : 'var(--twin-hairline-strong)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: segmentos.length > 1 ? 'space-between' : 'flex-start', gap: 10 }}>
        {segmentos.map((s, i) => (
          <Mono key={i} size={9} weight={600} color={s.zona ? `var(--twin-z${s.zona})` : 'var(--twin-muted)'}>{s.etiqueta}</Mono>
        ))}
      </div>
    </div>
  );
}

/** «Umbral 162 ppm · estimado» — la MISMA línea en la cabecera de zonas de las dos vistas. */
export function umbralLabel(u: typeof UMBRAL): string {
  return `Umbral ${u.ppm} ppm${u.estimado ? ' · estimado' : ''}`;
}

// ---------------------------------------------------------------------------
// Tabla «por segmento» (solo vista hoy) — transcrita de blockHeader/segmentRow
// (PostWorkoutSummaryView.swift:1006-1047), sin la columna de zona objetivo:
// ningún ítem de datos-reales.ts la lleva.
// ---------------------------------------------------------------------------

export function CabeceraBloqueHoy({ titulo, principal }: { titulo: string; principal: boolean }) {
  return (
    <div style={{ padding: '9px 10px 5px' }}>
      <span style={{
        font: 'italic 800 10px/1.1 var(--twin-font-sans)', letterSpacing: '0.6px', textTransform: 'uppercase',
        color: principal ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
      }}>
        {titulo}
      </span>
    </div>
  );
}

export function FilaSegmentoHoy({ nombre, tiempo }: { nombre: string; tiempo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
      <span style={{
        flex: 1, font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {nombre}
      </span>
      <Mono size={11} color="var(--twin-muted)" style={{ width: 60, textAlign: 'right' }}>{tiempo}</Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RPE — 10 pastillas, ninguna preseleccionada JAMÁS (§7 del contrato + el
// comentario de PostWorkoutSummaryView.swift:1095). El hairline solo rodea
// TODAS las pastillas cuando no hay elección — igual que en el Swift
// (`rpe == nil`, no el estado de cada pastilla individual).
// ---------------------------------------------------------------------------

export function PastillasRPE({ valor, onChange }: { valor: number | null; onChange: (n: number | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const selected = valor === n;
        return (
          <button
            key={n} type="button" onClick={() => onChange(selected ? null : n)}
            aria-label={`Esfuerzo percibido ${n} de 10`} aria-pressed={selected}
            style={{
              width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              font: '600 12px var(--twin-font-sans)',
              color: selected ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
              background: selected ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
              border: valor === null ? '1px solid var(--twin-hairline-strong)' : '1px solid transparent',
              cursor: 'pointer', padding: 0,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// «Cómo ha ido» — transcrito de SessionFeedbackCard.swift. Controlado desde
// fuera (el padre guarda el estado) porque en la propuesta la fila plegada
// necesita saber qué hay elegido para pintarlo en la cabecera cuando está
// cerrada; en la vista hoy el mismo estado simplemente no se lee fuera.
// ---------------------------------------------------------------------------

export const DIFICULTAD_LABEL = { too_easy: 'Fácil de más', as_expected: 'Como debía', too_hard: 'Duro de más' } as const;
export type Dificultad = keyof typeof DIFICULTAD_LABEL;

const AREA_LABEL = { rodilla: 'Rodilla', tobillo: 'Tobillo', cadera: 'Cadera', espalda: 'Espalda', hombro: 'Hombro', otra: 'Otra' } as const;
type Area = keyof typeof AREA_LABEL;

export interface EstadoComoHaIdo {
  dificultad: Dificultad | null;
  molestiaAbierta: boolean;
  area: Area | null;
  nota: string;
}

export function estadoComoHaIdoInicial(): EstadoComoHaIdo {
  return { dificultad: null, molestiaAbierta: false, area: null, nota: '' };
}

function ChipFeedback({ seleccionado, onClick, children }: { seleccionado: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        flex: 1, padding: '8px 6px', borderRadius: 9999,
        border: seleccionado ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
        background: seleccionado ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
        color: seleccionado ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
        font: `${seleccionado ? 600 : 500} 12px var(--twin-font-sans)`, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function ContenidoComoHaIdo({ estado, onCambia }: { estado: EstadoComoHaIdo; onCambia: (e: EstadoComoHaIdo) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-faint)' }}>Le llega a tu coach.</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {(Object.keys(DIFICULTAD_LABEL) as Dificultad[]).map((k) => (
          <ChipFeedback key={k} seleccionado={estado.dificultad === k} onClick={() => onCambia({ ...estado, dificultad: estado.dificultad === k ? null : k })}>
            {DIFICULTAD_LABEL[k]}
          </ChipFeedback>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCambia({
          ...estado,
          molestiaAbierta: !estado.molestiaAbierta,
          // Cerrar retira el informe entero — nada queda a medio rellenar.
          area: estado.molestiaAbierta ? null : estado.area,
          nota: estado.molestiaAbierta ? '' : estado.nota,
        })}
        aria-label={estado.molestiaAbierta ? 'Ocultar molestia física' : 'Añadir molestia física'}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: estado.molestiaAbierta ? 'var(--twin-accent-text)' : 'var(--twin-muted)' }}
      >
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{estado.molestiaAbierta ? '−' : '+'}</span>
        <span style={{ font: '600 13px var(--twin-font-sans)' }}>Molestia física</span>
      </button>
      {estado.molestiaAbierta && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {(Object.keys(AREA_LABEL) as Area[]).map((k) => (
              <ChipFeedback key={k} seleccionado={estado.area === k} onClick={() => onCambia({ ...estado, area: estado.area === k ? null : k })}>
                {AREA_LABEL[k]}
              </ChipFeedback>
            ))}
          </div>
          <textarea
            value={estado.nota} onChange={(e) => onCambia({ ...estado, nota: e.target.value.slice(0, 500) })}
            placeholder="Nota corta (opcional)" rows={1} aria-label="Nota sobre la molestia"
            style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-fg)', padding: '4px 0' }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila plegada — solo la usa la propuesta («Esfuerzo» / «Cómo ha ido» /
// «Notas»). 44 pt cerrada, chevron que gira, valor a la derecha en
// --twin-faint cuando es "Sin decir".
// ---------------------------------------------------------------------------

export function FilaPlegada({ etiqueta, valor, abierta, onToggle, children }: {
  etiqueta: string; valor: string; abierta: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button" onClick={onToggle} aria-expanded={abierta}
        style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ font: '500 14px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{etiqueta}</span>
        <span style={{ flex: 1 }} />
        <span style={{ font: '500 13px var(--twin-font-sans)', color: valor === 'Sin decir' ? 'var(--twin-faint)' : 'var(--twin-fg)' }}>{valor}</span>
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--twin-faint)', transform: abierta ? 'rotate(90deg)' : undefined, transition: 'transform 120ms ease-out' }}>
          <IconChevron />
        </span>
      </button>
      {abierta && <div style={{ padding: '0 2px 14px' }}>{children}</div>}
    </div>
  );
}
