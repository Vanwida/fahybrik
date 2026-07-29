'use client';

// Vista «hoy» — reproducción FIEL de PostWorkoutSummaryView.summaryContent
// (ios/FAHYBRIK/Workout/PostWorkoutSummaryView.swift:186-255), estado a
// estado, tal y como lo ve el atleta hoy. No es una interpretación: cada
// condición de aquí es la MISMA condición del Swift (hasHRData, hasZoneData,
// session.plan.segments.count > 1, freeContext == nil...) aplicada a los tres
// casos reales de datos-reales.ts. Es el «antes» contra el que se juzga la
// propuesta — sin él, el después no se puede evaluar (types.ts, TwinComposicion).
//
// Tres huecos del Swift que NO se reproducen porque ninguno de los tres casos
// los dispara (y fabricar el disparo sería inventar un cuarto caso que no es
// de producción): `manualEntry` (los tres vienen de `fuente: 'live'`, ninguno
// es un "Ya lo hice" sin laps), `scoreCard` (ninguno es un formato puntuado
// por tiempo/rondas) y `declareMovementsCard` (ninguno es un cronómetro sin
// contenido declarado). Tampoco `routeMapCard`: ningún caso lleva GPS.
//
// Dato no obvio: `segmentsTable` en Swift no guarda el tiempo por ítem en
// ningún sitio que datos-reales.ts modele (solo hay duración de SESIÓN, no de
// segmento) — la columna de tiempo por fila sale «—» en los tres casos, que es
// justo lo que el Swift también pinta cuando no encuentra el lap (línea 1022:
// `lap.map(...) ?? "—"`). No es una carencia del mockup: es la app hoy.

import { useState } from 'react';
import { CTA, Card, Display, Hairline, Label, Mono, Muerto } from '../../kit';
import { reloj, totalItems, UMBRAL, type MedidoReal, type SesionReal } from '../../datos-reales';
import { distribucionZonas } from '../../zonas';
import {
  BarraZonas,
  CabeceraBloqueHoy,
  ContenidoComoHaIdo,
  estadoComoHaIdoInicial,
  FilaSegmentoHoy,
  IconShare,
  PastillasRPE,
  TileMedida,
  umbralLabel,
} from './piezas';

export function Hoy({ sesion, medido, onLog }: { sesion: SesionReal; medido: MedidoReal; onLog: (linea: string) => void }) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [comoHaIdo, setComoHaIdo] = useState(estadoComoHaIdoInicial());

  const hasHRData = medido.fcMediaPpm != null || medido.fcMaxPpm != null;
  // La MISMA condición del Swift: se pregunta por la lectura, no por si el
  // diccionario trae claves — unas zonas a 0 s dibujarían una barra vacía, que
  // insinúa una medición que no existe (§7 del CONTRATO-UI).
  const zonas = distribucionZonas(medido);
  const items = totalItems(sesion);
  // freeContext == nil en el Swift ⇔ la sesión viene de una asignación del
  // coach, no del builder libre — es justo lo que separa origen 'coach' de 'libre'.
  const esPrescrita = sesion.origen === 'coach';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, padding: '0 12px 32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: '100%' }}>
          {/* tightHeader (línea 810) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px' }}>
            <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--twin-ok)' }}>✓</span>
            <Display size={36} tracking="-1px" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {reloj(medido.duracionS)}
            </Display>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => onLog('Compartir entreno')}
              aria-label="Compartir entreno"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--twin-accent-text)', cursor: 'pointer', display: 'inline-flex' }}
            >
              <IconShare />
            </button>
          </div>

          {/* zonesStackedBar — solo una lectura real la dispara */}
          {zonas.length > 0 && (
            <Card padding={10}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Label size={9}>Zonas</Label>
                  <span style={{ flex: 1 }} />
                  <Mono size={9} color="var(--twin-muted)">{umbralLabel(UMBRAL)}</Mono>
                </div>
                <BarraZonas segmentos={zonas} />
              </div>
            </Card>
          )}

          {/* metricTiles (931) / manualHRCard (951) */}
          {hasHRData ? (
            // "Avg HR" / "bpm": inglés, contradice CONTRATO-UI §3 (FC/ppm). Se
            // reproduce TAL CUAL — es justo lo que esta vista existe para delatar.
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <TileMedida etiqueta="Avg HR" valor={medido.fcMediaPpm != null ? String(medido.fcMediaPpm) : '—'} unidad="bpm" />
              <TileMedida etiqueta="Max HR" valor={medido.fcMaxPpm != null ? String(medido.fcMaxPpm) : '—'} unidad="bpm" />
            </div>
          ) : (
            <Card padding={0}>
              <div style={{ padding: '10px 10px 6px' }}>
                <Label size={9}>Frecuencia cardiaca</Label>
                <p style={{ margin: '2px 0 0', font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                  Sin pulsómetro. Anótala a mano si la conoces.
                </p>
              </div>
              <FilaEntradaManual etiqueta="FC media" unidad="ppm" />
              <FilaEntradaManual etiqueta="FC máx" unidad="ppm" />
            </Card>
          )}

          {/* segmentsTable (983) — solo cuando hay más de un ítem */}
          {items > 1 && (
            <Card padding={0}>
              <div style={{ padding: '8px 10px' }}>
                <Label size={9}>Por segmento</Label>
              </div>
              {sesion.bloques.map((bloque, bi) => (
                <div key={`${bloque.titulo}-${bi}`}>
                  <Hairline />
                  <CabeceraBloqueHoy titulo={bloque.titulo} principal={!bloque.estructural} />
                  {bloque.items.map((it, ii) => (
                    <div key={`${it.nombre}-${ii}`}>
                      {ii > 0 && <Hairline style={{ opacity: 0.4 }} />}
                      <FilaSegmentoHoy nombre={it.nombre} tiempo="—" />
                    </div>
                  ))}
                </div>
              ))}
            </Card>
          )}

          {/* rpeCard (1102) */}
          <Card padding={10} topAccent={rpe === null}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Label size={9}>RPE</Label>
                <span style={{ flex: 1 }} />
                {rpe !== null && <span style={{ color: 'var(--twin-ok)', fontWeight: 800, fontSize: 11 }}>✓</span>}
              </div>
              {rpe === null && (
                <p style={{ margin: 0, font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  Del 1 (muy suave) al 10 (a tope). Si no lo marcas, se guarda sin RPE.
                </p>
              )}
              <PastillasRPE valor={rpe} onChange={(n) => { setRpe(n); onLog(n ? `RPE ${n}` : 'RPE borrado'); }} />
            </div>
          </Card>

          {/* SessionFeedbackCard (228) — solo sesión prescrita por el coach */}
          {esPrescrita && (
            <Card padding={10}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Label size={9}>Cómo ha ido</Label>
                <ContenidoComoHaIdo estado={comoHaIdo} onCambia={setComoHaIdo} />
              </div>
            </Card>
          )}

          {/* notesCard (1151) */}
          <Card padding={10}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label size={9}>Notas</Label>
              <textarea
                placeholder="Opcional"
                rows={2}
                aria-label="Notas del entreno"
                style={{
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  font: '500 13px/1.4 var(--twin-font-sans)',
                  color: 'var(--twin-fg)',
                  padding: '4px 0',
                  minHeight: 40,
                }}
              />
            </div>
          </Card>

          {/* El diagnóstico: en los tres casos el contenido no llena — se mide solo. */}
          <Muerto nota="Un ScrollView con contenido que no llena da inercia sobre nada." />
        </div>
      </div>

      <div style={{ padding: '8px 12px 12px' }}>
        {/* 46 pt — lo que hay HOY. La puerta de bloque usa 64 y el entreno en
           vivo 88 para el MISMO papel de acción principal: tres altos
           distintos, cero regla común (CONTRATO-UI §4, "nada de medios puntos
           ni dos niveles separados por 1 pt: eso no es jerarquía, es ruido" —
           esto es peor, son 3 valores sin relación). */}
        <CTA title="GUARDAR" height={46} onClick={() => onLog('GUARDAR (46 pt)')} />
      </div>
    </div>
  );
}

/** IntRow reproducido — fila vacía (nadie ha escrito nada) con su hairline superior. */
function FilaEntradaManual({ etiqueta, unidad }: { etiqueta: string; unidad: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '13px 10px', borderTop: '1px solid var(--twin-hairline)' }}>
      <span style={{ flex: 1, font: '400 14px var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{etiqueta}</span>
      <Mono size={14} color="var(--twin-faint)">—</Mono>
      <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)', marginLeft: 4 }}>{unidad}</span>
    </div>
  );
}

