'use client';

// ¿HACIA DÓNDE VOY?: la banda compacta del camino a la carrera: los días que
// faltan como cifra (la distancia que queda por recorrer), el nombre y el objetivo
// de tiempo, la regleta de semanas (N de M) y, debajo, la simulación de HYROX
// como línea honesta: programada, o la invitación a hacerla.
//
// La FASE la nombra el coach (HARD RULE Nº0): llega como texto y aquí solo se
// pinta; la vista no sabe qué es «Construcción». La foto de la carrera es textura,
// no protagonista: va bajo un velo del color del lienzo (dos tokens, así se lee
// igual en claro y en oscuro) y el naranja no aparece como dato.
//
// Estados: fijada · sin carrera (invitación con su salida) · esqueleto. Sin coach
// o con el plan sin cargar no hay camino y no se pinta nada (la banda no existe).

import type { CSSProperties } from 'react';
import type { Carrera, LecturaHoy, Simulacion } from '../../kit-hoy/contrato';
import { R } from '../../kit-composicion/tokens';
import { Banda, Esq, Etiqueta } from './atomos';
import { IconCalendario, IconChevron, IconLupa } from './iconos';
import { plural } from './texto';
import { FONDO_CARRERA, T, VELO_CARRERA } from './tokens';

const APOYO: CSSProperties = { font: `400 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' };

function Regleta({ n, m }: { n: number; m: number }) {
  return (
    <div role="img" aria-label={`Semana ${n} de ${m}`} style={{ display: 'flex', alignItems: 'center', gap: 3, height: 12 }}>
      {Array.from({ length: m }, (_, i) => {
        const actual = i === n - 1;
        return (
          <span
            key={i}
            style={{
              flex: 1,
              height: actual ? 12 : 6,
              borderRadius: 3,
              background: actual ? 'var(--twin-fg)' : i < n - 1 ? 'var(--twin-muted)' : 'var(--twin-hairline-strong)',
            }}
          />
        );
      })}
    </div>
  );
}

function LineaSimulacion({ s }: { s: Simulacion }) {
  const hoy = s.tipo === 'programada' && s.hoy;
  const texto =
    s.tipo === 'abierta' ? 'Haz una simulación de HYROX para afinar tu predicho.' : s.hoy ? 'Hoy toca simulación de HYROX.' : `Simulación de HYROX ${s.dia}.`;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, ...APOYO, color: hoy ? 'var(--twin-fg)' : 'var(--twin-muted)', fontWeight: hoy ? 600 : 400 }}>
      <IconCalendario tam={18} style={{ marginTop: 2, color: 'var(--twin-muted)' }} />
      <span>{texto}</span>
    </div>
  );
}

function BandaCarrera({ c, sim, appearance, onIr }: { c: Carrera; sim: Simulacion | null; appearance: 'light' | 'dark'; onIr: (donde: string) => void }) {
  const dias = Math.max(0, c.dias);
  const velo = VELO_CARRERA[appearance === 'dark' ? 'oscuro' : 'claro'];
  return (
    <div style={{ position: 'relative', borderRadius: R.l, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--twin-hairline)' }}>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${FONDO_CARRERA[c.fondo]})`,
          backgroundSize: 'cover',
          backgroundPosition: c.fondo === 'running' ? 'center 30%' : 'center 55%',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, color-mix(in srgb, var(--twin-bg) ${velo}%, transparent) 0%, color-mix(in srgb, var(--twin-bg) ${velo + 5}%, transparent) 100%)`,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px 16px' }}>
        <button
          type="button"
          className="pl-btn"
          onClick={() => onIr(`Camino a la carrera · ${c.nombre} → Carreras`)}
          aria-label={`Camino a ${c.nombre}: faltan ${dias} ${plural(dias, 'día', 'días')}${c.meta ? `, objetivo ${c.meta}` : ''}${c.fase ? `. ${c.fase}` : ''}. Ver la carrera`}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', textAlign: 'left', borderRadius: R.m }}
        >
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Etiqueta>Camino a la carrera</Etiqueta>
            <IconChevron tam={16} style={{ color: 'var(--twin-accent-text)' }} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 76 }}>
              <span style={{ font: `800 60px/56px var(--twin-font-sans)`, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color: 'var(--twin-fg)' }}>{dias}</span>
              <span style={{ font: `500 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>{plural(dias, 'día', 'días')}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 16, borderLeft: '1px solid var(--twin-hairline-strong)' }}>
              <span style={{ font: `italic 800 ${T.titulo}px/28px var(--twin-font-sans)`, letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{c.nombre}</span>
              {c.meta ? <span style={APOYO}>Objetivo · {c.meta}</span> : null}
            </span>
          </span>
          {c.semana ? <Regleta n={c.semana.n} m={c.semana.m} /> : null}
          {c.fase ? <span style={{ ...APOYO, color: 'var(--twin-fg)', fontWeight: 500 }}>{c.fase}</span> : null}
        </button>
        {sim ? <LineaSimulacion s={sim} /> : null}
      </div>
    </div>
  );
}

function InvitacionCarrera({ sim, onBuscar }: { sim: Simulacion | null; onBuscar: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Etiqueta>Camino a la carrera</Etiqueta>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ font: `italic 800 ${T.titulo}px/30px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>Elige tu carrera objetivo</span>
        <span style={APOYO}>Con una carrera fijada tu plan tiene destino: cuenta atrás, fase y objetivo de tiempo.</span>
      </div>
      <button type="button" className="pl-sec" onClick={onBuscar}>
        <IconLupa tam={18} />
        Busca tu carrera
      </button>
      {sim ? <LineaSimulacion s={sim} /> : null}
    </div>
  );
}

function EsqueletoCamino() {
  return (
    <div role="status" aria-label="Cargando el camino a la carrera" style={{ borderRadius: R.l, boxShadow: 'inset 0 0 0 1px var(--twin-hairline)', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Etiqueta>Camino a la carrera</Etiqueta>
      <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ minWidth: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Esq w={64} h={52} r={12} />
          <Esq w={40} h={16} r={6} />
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16, borderLeft: '1px solid var(--twin-hairline-strong)' }}>
          <Esq w="86%" h={26} r={8} />
          <Esq w="60%" h={18} r={6} />
        </span>
      </span>
      <Esq w="100%" h={12} r={4} />
      <Esq w="55%" h={18} r={6} />
      <Esq w="80%" h={18} r={6} />
    </div>
  );
}

export function Camino({ l, orden, appearance, onIr, onBuscar }: { l: LecturaHoy; orden: number; appearance: 'light' | 'dark'; onIr: (donde: string) => void; onBuscar: () => void }) {
  if (l.cargando) {
    return (
      <Banda etiqueta="Camino a la carrera" orden={orden}>
        <EsqueletoCamino />
      </Banda>
    );
  }
  if (l.camino === null) return null;
  return (
    <Banda etiqueta="Camino a la carrera" orden={orden}>
      {l.camino.tipo === 'fijada' ? <BandaCarrera c={l.camino.carrera} sim={l.simulacion} appearance={appearance} onIr={onIr} /> : <InvitacionCarrera sim={l.simulacion} onBuscar={onBuscar} />}
    </Banda>
  );
}
