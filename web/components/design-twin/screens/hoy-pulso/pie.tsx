'use client';

// EL PIE TRANQUILO y la acción libre.
//
// Pie: una sola marca reciente como PRUEBA de progreso (el progreso entero vive en
// Analíticas, decisión del 29-sep) y los pasos de hoy. Dos celdas separadas por una
// regla fina. Una marca que no existe no se pinta (no hay acto que la llene desde
// aquí); los pasos sin Salud sí se declaran, porque conectarla cuesta un toque.
//
// Libre: «¿Hoy lo tuyo?». Con coach es la acción SECUNDARIA (suma al plan, no lo
// rompe). Sin coach no hay plan: pasa a ser el hueco de «qué toca hoy» y la
// acción primaria, sin ninguna pieza de coach a su alrededor.

import type { CSSProperties, ReactNode } from 'react';
import type { LecturaHoy, MarcaReciente, Pasos } from '../../kit-hoy/contrato';
import { Banda, Esq, Etiqueta } from './atomos';
import { IconChevron, IconMas, IconTriangulo } from './iconos';
import { T } from './tokens';

const VALOR: CSSProperties = { font: `700 ${T.dato}px/34px var(--twin-font-sans)`, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: 'var(--twin-fg)' };
const APOYO: CSSProperties = { font: `400 ${T.apoyo}px/20px var(--twin-font-sans)`, color: 'var(--twin-muted)' };

function Celda({ children, borde, peso = 1 }: { children: ReactNode; borde?: boolean; peso?: number }) {
  return (
    <div style={{ flex: peso, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 16px', borderLeft: borde ? '1px solid var(--twin-hairline)' : undefined }}>{children}</div>
  );
}

function CeldaMarca({ m }: { m: MarcaReciente }) {
  const baja = m.delta ? /^[−-]/.test(m.delta.texto) : false;
  return (
    <>
      <Etiqueta style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{m.titulo}</Etiqueta>
      <span style={VALOR}>{m.valor}</span>
      {m.delta ? (
        <span style={{ ...APOYO, display: 'flex', alignItems: 'flex-start', gap: 6, color: m.delta.mejora ? 'var(--twin-ok)' : 'var(--twin-muted)' }}>
          <IconTriangulo sube={!baja} tam={11} style={{ marginTop: 5 }} />
          <span>{m.delta.texto}</span>
        </span>
      ) : null}
    </>
  );
}

function CeldaPasos({ pasos, cargando, onConectar }: { pasos: Pasos; cargando: boolean; onConectar: () => void }) {
  const etiqueta = <Etiqueta style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Pasos hoy</Etiqueta>;
  if (cargando) {
    return (
      <div role="status" aria-label="Cargando los pasos">
        {etiqueta}
        <Esq w={96} h={30} r={8} style={{ margin: '4px 0' }} />
      </div>
    );
  }
  if (pasos.tipo === 'cifra') {
    return (
      <>
        {etiqueta}
        <span style={VALOR}>{pasos.valor}</span>
      </>
    );
  }
  if (pasos.tipo === 'sin-datos') {
    return (
      <>
        {etiqueta}
        <span style={{ font: `400 ${T.cuerpo}px/34px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>sin datos todavía</span>
      </>
    );
  }
  return (
    <>
      {etiqueta}
      <button
        type="button"
        className="pl-btn"
        onClick={onConectar}
        aria-label="Pasos hoy. Conecta Apple Salud para verlos"
        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', font: `700 ${T.cuerpo}px/1 var(--twin-font-sans)`, color: 'var(--twin-accent-text)' }}
      >
        Conectar Salud
        <IconChevron tam={14} />
      </button>
    </>
  );
}

export function Pie({ l, orden, onIr }: { l: LecturaHoy; orden: number; onIr: (donde: string) => void }) {
  const marca = l.cargando ? null : l.marca;
  return (
    <Banda etiqueta="Marca reciente y pasos" orden={orden} crece={1}>
      <div style={{ display: 'flex', margin: '0 -16px', alignItems: 'flex-start' }}>
        {l.cargando ? (
          <Celda>
            <div role="status" aria-label="Cargando tu última marca">
              <Etiqueta style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Última marca</Etiqueta>
              <Esq w={110} h={30} r={8} style={{ margin: '4px 0' }} />
              <Esq w={140} h={16} r={6} />
            </div>
          </Celda>
        ) : marca ? (
          <Celda peso={1.35}>
            <CeldaMarca m={marca} />
          </Celda>
        ) : null}
        <Celda borde={Boolean(l.cargando || marca)}>
          <CeldaPasos pasos={l.pasos} cargando={l.cargando} onConectar={() => onIr('Pasos → Perfil, conectar Apple Salud')} />
        </Celda>
      </div>
    </Banda>
  );
}

// ---------------------------------------------------------------------------
// ¿Hoy lo tuyo?
// ---------------------------------------------------------------------------

export function Libre({ l, orden, onCrear }: { l: LecturaHoy; orden: number; onCrear: () => void }) {
  const sinCoach = !l.conCoach;
  if (sinCoach) {
    return (
      <Banda etiqueta="Hoy lo montas tú" orden={orden} crece={2} style={{ gap: 14 }}>
        <Etiqueta>Toca hoy</Etiqueta>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ font: `italic 800 ${T.titulo}px/30px var(--twin-font-sans)`, color: 'var(--twin-fg)' }}>Hoy lo montas tú</span>
          <span style={{ font: `400 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>Crea tu propio entreno y regístralo aquí.</span>
        </div>
        <button type="button" className="tw-btn-primary pl-primario" onClick={onCrear} style={{ height: 54, width: '100%', fontSize: T.cuerpo }}>
          <IconMas tam={18} />
          Crear entreno libre
        </button>
      </Banda>
    );
  }
  return (
    <Banda etiqueta="¿Hoy lo tuyo?" orden={orden} crece={0} style={{ gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Etiqueta>¿Hoy lo tuyo?</Etiqueta>
        <span style={{ font: `400 ${T.apoyo}px/20px var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>Suma a tu plan, no lo rompe. Tu coach lo ve.</span>
      </div>
      <button type="button" className="pl-sec" onClick={onCrear}>
        <IconMas tam={18} />
        Crear entreno libre
      </button>
    </Banda>
  );
}
