'use client';

// «Cómo está hoy» — reproducción FIEL de ios/FAHYBRIK/Workout/BlockPreviewGate.swift
// (líneas 76-100 del `body`). El `ScrollView { workList }.layoutPriority(1)`
// reserva SIEMPRE el mismo alto, tenga la lista 1 fila o 16: ese hueco es el
// diagnóstico, y aquí se mide en vivo con `Muerto` (kit.tsx) en vez de
// asertarse a ojo.
//
// Con ≤4 ítems el contenido real no llega a llenar ese alto — se queda muy
// corto (58 pt medidos con 1 solo ítem) — y `Muerto` pinta el sobrante rayado.
// Con los 16 de la simulación HYROX el contenido SÍ desborda: ahí el
// `ScrollView` hace lo que promete y de verdad scrollea, así que no hay nada
// que medir — se envuelve en `.twin-scroll` y punto.

import type { ItemReal } from '../../datos-reales';
import { Card, Hairline, IconChevron, IconClose, IconListBullet, Label, Muerto, RoundButton } from '../../kit';
import { FilaTrabajo, Pie } from './piezas';

export interface HoyProps {
  titulo: string;
  formato?: string;
  blockNumber: number;
  blockCount: number;
  items: ItemReal[];
  onLog: (linea: string) => void;
}

export function Hoy({ titulo, formato, blockNumber, blockCount, items, onLog }: HoyProps) {
  // Umbral empírico de los cuatro escenarios reales: con 4 ítems (calentamiento)
  // el Card se queda muy por debajo de los ~489 pt reservados; con 16 (la
  // simulación) los desborda de sobra. No hay un quinto escenario que ronde el
  // límite, así que un corte simple en 8 basta para decidir cuál de las dos
  // caras del ScrollView tocaba reproducir.
  const desborda = items.length >= 8;

  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '16px 24px',
      }}
    >
      {/* topRow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <RoundButton onClick={() => onLog('Salir del entreno')} label="Salir del entreno">
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IconClose />
          </span>
        </RoundButton>
        <RoundButton onClick={() => onLog('Ver el entreno entero')} label="Ver el entreno entero">
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IconListBullet />
          </span>
        </RoundButton>
        {blockCount > 1 && (
          <RoundButton onClick={() => onLog('Bloque anterior')} label="Bloque anterior">
            <span style={{ color: 'var(--twin-fg)', display: 'inline-flex' }}>
              <IconChevron dir="left" />
            </span>
          </RoundButton>
        )}
        {blockCount > 1 && (
          <span style={{ font: 'italic 800 11px/1.1 var(--twin-font-sans)', letterSpacing: '0.8px', color: 'var(--twin-muted)' }}>
            BLOQUE {blockNumber} DE {blockCount}
          </span>
        )}
      </div>

      {/* header — ninguno de los cuatro escenarios lleva phaseTag: el título del
          bloque YA es la fase ("Calentamiento") o ya es el objetivo ("Simulación
          HYROX"), así que reproducirla aquí sería inventar una etiqueta que hoy
          no existe. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
        <span
          style={{
            font: 'italic 800 30px/1.1 var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            color: 'var(--twin-fg)',
          }}
        >
          {titulo}
        </span>
      </div>

      {/* línea de formato — solo la simulación HYROX la trae */}
      {formato && (
        <div style={{ flex: '0 0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              font: '800 13px/1.2 var(--twin-font-mono)',
              color: 'var(--twin-accent-text)',
              padding: '6px 10px',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--twin-accent-text) 12%, transparent)',
            }}
          >
            {formato}
          </span>
        </div>
      )}

      {/* ScrollView { workList } — el hueco de alto fijo que hoy no sabe qué
          hacer con el sobrante */}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label>Lo que viene</Label>
        {desborda ? (
          <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>
            <Card padding={0} leftAccent>
              {items.map((item, i) => (
                <div key={i}>
                  {i > 0 && <Hairline />}
                  <FilaTrabajo item={item} />
                </div>
              ))}
            </Card>
          </div>
        ) : (
          <>
            <Card padding={0} leftAccent>
              {items.map((item, i) => (
                <div key={i}>
                  {i > 0 && <Hairline />}
                  <FilaTrabajo item={item} />
                </div>
              ))}
            </Card>
            <Muerto nota="El ScrollView reserva el mismo alto para 1 fila que para 16." />
          </>
        )}
      </div>

      <Pie onEmpezar={() => onLog('EMPEZAR → arrancaría el reloj del bloque')} />
    </div>
  );
}
