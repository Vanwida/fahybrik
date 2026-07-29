'use client';

// PROPUESTA — Analíticas con el veredicto como sujeto.
//
// Tres cambios:
//  1. El sujeto es **el veredicto de la sección**, no el selector de periodo:
//     una cifra que se lee a tres metros, con la frase que la juzga debajo. El
//     periodo baja a un control pequeño, que es lo que es.
//  2. Las tarjetas llenan y scrollean POR DEBAJO del veredicto. Dejan de ser el
//     contenido para volver a ser el detalle.
//  3. Cuando una sección entera no tiene nada, **es UN estado centrado con
//     salida** — no N tarjetas grises repitiendo lo mismo.
//
// Y el veredicto se retira cuando la cobertura no da (28-jul: «sin cobertura no
// hay veredicto»): la cifra se queda, el juicio no. Eso es un tercer estado que
// hoy no existe, y es el que más se va a dar.

import { useState } from 'react';
import { Card, NavBar, Pantalla, Pastilla, PuntoModalidad, TabBar } from '../../kit-composicion/chrome';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { R, S } from '../../kit-composicion/tokens';
import type { EstadoAnaliticas, Seccion, SeccionId, Tarjeta, Veredicto } from './data';

// ---------------------------------------------------------------------------

function NavSecciones({
  secciones,
  activa,
  onPick,
}: {
  secciones: Seccion[];
  activa: SeccionId;
  onPick: (id: SeccionId) => void;
}) {
  return (
    <div className="twin-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: `0 ${S.l}px` }}>
      {secciones.map((s) => {
        const on = s.id === activa;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              cursor: 'pointer',
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 13px',
              borderRadius: R.pill,
              border: `1px solid ${on ? 'var(--twin-hairline-strong)' : 'var(--twin-hairline)'}`,
              background: on ? 'var(--twin-surface-elevated)' : 'transparent',
              font: '650 12px/1 var(--twin-font-sans)',
              color: on ? 'var(--twin-fg)' : 'var(--twin-muted)',
            }}
          >
            <PuntoModalidad modalidad={s.modalidad} tam={6} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/** El periodo deja de ser el sujeto: control pequeño, pegado a lo que califica. */
function Periodo({ opciones, activo, onPick }: { opciones: string[]; activo: string; onPick: (p: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: R.pill, background: 'var(--twin-surface)' }}>
      {opciones.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: R.pill,
            background: p === activo ? 'var(--twin-surface-elevated)' : 'transparent',
            font: '600 11px/1 var(--twin-font-sans)',
            color: p === activo ? 'var(--twin-fg)' : 'var(--twin-faint)',
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function BloqueVeredicto({ v }: { v: Veredicto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span className="t-readout-hero" style={{ color: 'var(--twin-fg)' }}>
          {v.cifra}
        </span>
        {/* La unidad (o el resto del contador) va en sans: el monoespaciado es
            la voz del readout y solo le toca a la cifra. */}
        {v.unidad ? (
          <span style={{ font: '500 17px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{v.unidad}</span>
        ) : null}
      </div>
      <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{v.etiqueta}</span>
      {v.juicio ? (
        <span style={{ marginTop: 2 }}>
          <Pastilla tono={v.juicio.tono === 'ok' ? 'ok' : v.juicio.tono === 'aviso' ? 'aviso' : 'neutro'}>
            {v.juicio.texto}
          </Pastilla>
        </span>
      ) : null}
      {/* El hueco se declara SIEMPRE que exista, tenga juicio o no. */}
      {v.cobertura ? (
        <span
          style={{
            marginTop: 2,
            padding: `${S.s}px ${S.m}px`,
            borderRadius: R.m,
            border: '1px dashed var(--twin-hairline-strong)',
            font: '400 12px/1.45 var(--twin-font-sans)',
            color: 'var(--twin-muted)',
          }}
        >
          {v.cobertura}
        </span>
      ) : null}
    </div>
  );
}

function TarjetaDato({ t }: { t: Tarjeta }) {
  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S.m }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{t.titulo}</span>
          {t.pie ? (
            <span style={{ font: '400 11.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{t.pie}</span>
          ) : null}
          {t.marca ? (
            <span style={{ marginTop: 2 }}>
              <Pastilla>{t.marca}</Pastilla>
            </span>
          ) : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span
            style={{
              font: '700 26px/1 var(--twin-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-fg)',
            }}
          >
            {t.valor}
          </span>
          {t.unidad ? (
            <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{t.unidad}</span>
          ) : null}
        </span>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function AnaliticasPropuesta({ e, onLog }: { e: EstadoAnaliticas; onLog: (l: string) => void }) {
  // Se abre por la primera sección que EMITA JUICIO, no por la primera que
  // tenga cifras: una sección con dato pero sin veredicto no es la portada de
  // unas analíticas. Si ninguna juzga, la primera con cifras; si no, la primera.
  const entrada =
    e.secciones.find((s) => s.veredicto?.juicio) ??
    e.secciones.find((s) => s.veredicto !== null) ??
    e.secciones[0];
  const [activa, setActiva] = useState<SeccionId>(entrada.id);
  const [periodo, setPeriodo] = useState(e.periodo);

  const s = e.secciones.find((x) => x.id === activa) ?? e.secciones[0];
  const vacia = s.veredicto === null;

  const cabecera = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.m, paddingBottom: S.m }}>
      <NavBar titulo="Analíticas" />
      <NavSecciones secciones={e.secciones} activa={activa} onPick={(id) => { setActiva(id); onLog(`Sección → ${id}`); }} />
    </div>
  );

  // Una sección sin nada ES un Vacío, y se pinta como Vacío (§6.2).
  if (vacia) {
    return (
      <Pantalla estrategia="centra" cabecera={cabecera} tabBar={<TabBar activa="Analíticas" />}>
        <EstadoCentrado
          eyebrow={s.label}
          titulo="Todavía no hay nada que analizar aquí"
          cuerpo={s.vacio?.porque ?? ''}
          salida={{
            tipo: 'accion',
            texto: s.vacio?.salida ?? 'Ver mis tests',
            onTap: () => onLog(`Salida del vacío → ${s.vacio?.salida}`),
          }}
        />
      </Pantalla>
    );
  }

  return (
    <Pantalla estrategia="llena" cabecera={cabecera} tabBar={<TabBar activa="Analíticas" />}>
      {/*
        `minHeight: 100%` + centrado vertical: si el contenido desborda, el
        sobrante es cero y scrollea desde arriba como cualquier lista; si no
        llega, se reparte el aire en vez de dejar una cola muerta abajo. Es la
        regla del §6.1 resuelta por CONTENIDO, no por una decisión a priori que
        el dato luego desmiente.
      */}
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: S.l,
          padding: `0 ${S.l}px ${S.xl}px`,
        }}
      >
        {/* El sujeto. */}
        <BloqueVeredicto v={s.veredicto!} />

        {/* El periodo, a su tamaño real, justo encima de lo que califica. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.s }}>
          <span
            style={{
              font: '600 10px/1.2 var(--twin-font-sans)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--twin-muted)',
            }}
          >
            El detalle
          </span>
          <Periodo
            opciones={e.periodos}
            activo={periodo}
            onPick={(p) => {
              setPeriodo(p);
              onLog(`Periodo → ${p}`);
            }}
          />
        </div>

        {s.tarjetas.map((t) => (
          <TarjetaDato key={t.titulo} t={t} />
        ))}

        {/* El cierre: qué falta para que esto se pueda juzgar. Contenido, no aire. */}
        {s.completar ? (
          <Card padding={S.l} elevada>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
              <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                {s.completar.texto}
              </span>
              <button
                type="button"
                onClick={() => onLog(`Cierre de sección → ${s.completar?.accion}`)}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: R.m,
                  border: '1px solid var(--twin-outline)',
                  font: '650 13px/1 var(--twin-font-sans)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--twin-accent-text)',
                }}
              >
                {s.completar.accion}
              </button>
            </div>
          </Card>
        ) : null}
      </div>
    </Pantalla>
  );
}
