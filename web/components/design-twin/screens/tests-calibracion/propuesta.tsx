'use client';

// PROPUESTA — el hub de tests con sujeto declarado y un arquetipo por estado.
//
// El sujeto es **cuánto has calibrado**, y se pinta TAMBIÉN en cero: en cero es
// justo cuando hay algo que explicar. Hoy el contador se esconde exactamente
// entonces (TestsHubView.swift:156, tras `status.isScheduled`).
//
// Un arquetipo se degrada, no se rompe (§6.2): con la programación publicada
// esto es una **Lista** que `llena` y ancla su siguiente acto abajo; sin nada
// programado ES un **Vacío**, y se pinta como Vacío — centrado y con salida.

import {
  BotonPrimario,
  Card,
  Etiqueta,
  NavBar,
  Pantalla,
  Pastilla,
  PuntoModalidad,
} from '../../kit-composicion/chrome';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { ppm } from '../../kit-composicion/formato';
import { R, S } from '../../kit-composicion/tokens';
import {
  completos,
  empezados,
  estaCompleto,
  estaEmpezado,
  siguienteAccion,
  type EstadoTests,
  type TestCalibracion,
} from './data';

// ---------------------------------------------------------------------------
// El sujeto: la cifra de calibración. Misma voz en los dos arquetipos.
// ---------------------------------------------------------------------------

function Contador({ hechos, total, grande }: { hechos: number; total: number; grande?: boolean }) {
  const completo = hechos === total;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
      <span
        className={grande ? 't-readout-hero' : 't-readout-l'}
        style={{ color: completo ? 'var(--twin-ok)' : 'var(--twin-fg)' }}
      >
        {hechos}
      </span>
      <span
        className={grande ? 't-readout-m' : 't-readout-s'}
        style={{ color: 'var(--twin-muted)' }}
      >
        /{total}
      </span>
    </span>
  );
}

/** Un segmento por test: lleno · a medias · pendiente. */
function Progreso({ tests }: { tests: TestCalibracion[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%' }}>
      {tests.map((t) => {
        const lleno = estaCompleto(t);
        const medias = estaEmpezado(t);
        return (
          <span
            key={t.slug}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: lleno
                ? 'var(--twin-ok)'
                : medias
                  ? 'color-mix(in srgb, var(--twin-accent) 55%, transparent)'
                  : 'color-mix(in srgb, var(--twin-fg) 12%, transparent)',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arquetipo Vacío — nada programado y nada hecho
// ---------------------------------------------------------------------------

function SinNadaQueHacer({ e, onLog }: { e: EstadoTests; onLog: (l: string) => void }) {
  return (
    <Pantalla estrategia="centra" cabecera={<NavBar titulo="" atras />}>
      <EstadoCentrado
        eyebrow="Calibración"
        cifra={<Contador hechos={0} total={e.tests.length} grande />}
        titulo="Aún no has calibrado nada"
        cuerpo="Cuatro tests fijan tus zonas de pulso, tus cargas de fuerza y el ritmo al que se escribe tu plan. Hasta entonces, todo lo demás es una estimación."
        salida={{
          tipo: 'accion',
          texto: 'Pruébate por tu cuenta',
          onTap: () => onLog('Pruébate por tu cuenta → biblioteca de marcas'),
          nota: 'Los cuatro los programa Pablo Amigo, normalmente en tu primera semana.',
        }}
      />
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Arquetipo Lista — hay programación publicada
// ---------------------------------------------------------------------------

function TarjetaTest({ t, onLog }: { t: TestCalibracion; onLog: (l: string) => void }) {
  const completo = estaCompleto(t);
  const medias = estaEmpezado(t);
  const medidos = t.resultados.filter((r) => r.valor !== undefined);
  const faltan = t.resultados.filter((r) => r.valor === undefined);

  return (
    <Card padding={S.l}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
          <PuntoModalidad modalidad={t.modalidad} />
          <span style={{ flex: 1, font: '650 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            {t.nombre}
          </span>
          {completo ? (
            <Pastilla tono="ok">Calibrado</Pastilla>
          ) : medias ? (
            <Pastilla tono="acento">A medias</Pastilla>
          ) : (
            <Pastilla>{t.dia}</Pastilla>
          )}
        </div>

        {/* Solo se pinta lo medido. El hueco se DECLARA, no se dibuja con guiones. */}
        {medidos.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {medidos.map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'baseline', gap: S.s }}>
                <span style={{ flex: 1, font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {r.label}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                  <span
                    style={{
                      font: '700 20px/1 var(--twin-font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--twin-fg)',
                    }}
                  >
                    {r.valor}
                  </span>
                  {r.unidad ? (
                    <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                      {r.unidad}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {faltan.length > 0 && medidos.length > 0 ? (
          <span style={{ font: '600 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
            Falta {faltan.map((r) => r.label.toLowerCase()).join(' y ')}
          </span>
        ) : null}

        {medidos.length === 0 ? (
          <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {t.desbloquea ? `Te desbloquea ${t.desbloquea}.` : 'Tu referencia de carrera completa.'} Programado el{' '}
            {t.dia}.
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => onLog(`${t.nombre} → ${completo ? 'repetir' : medias ? 'completar' : 'probarme'}`)}
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
            color: completo ? 'var(--twin-fg)' : 'var(--twin-accent-text)',
          }}
        >
          {completo ? 'Batir mi marca' : medias ? 'Completar' : 'Probarme'}
        </button>
      </div>
    </Card>
  );
}

function ConProgramacion({ e, onLog }: { e: EstadoTests; onLog: (l: string) => void }) {
  const hechos = completos(e);
  const aMedias = empezados(e);
  const siguiente = siguienteAccion(e);
  const sinZonas = e.umbralPpm === null;

  return (
    <Pantalla
      estrategia="llena"
      cabecera={<NavBar titulo="" atras />}
      accion={
        siguiente ? (
          <BotonPrimario onClick={() => onLog(`Acción anclada → ${siguiente.slug}`)}>{siguiente.texto}</BotonPrimario>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S.l, padding: `${S.l}px ${S.l}px ${S.xl}px` }}>
        {/* El sujeto, arriba y primero. Se pinta también en cero. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
          <Etiqueta color="var(--twin-accent-text)">Calibración</Etiqueta>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: S.m }}>
            <Contador hechos={hechos} total={e.tests.length} grande />
            <span
              style={{
                paddingBottom: 8,
                font: '500 13px/1.3 var(--twin-font-sans)',
                color: 'var(--twin-muted)',
              }}
            >
              tests calibrados
              {aMedias > 0 ? ` · ${aMedias} a medias` : ''}
            </span>
          </div>
          <Progreso tests={e.tests} />
          <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {sinZonas ? (
              <>
                Todavía sin zonas: las fija el <b style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>5K</b> o el{' '}
                <b style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>Remo 2K</b>.
              </>
            ) : (
              <>
                Umbral en <b style={{ color: 'var(--twin-fg)', fontWeight: 600 }}>{ppm(e.umbralPpm ?? 0)}</b> ·{' '}
                {e.modalidadesConZona} modalidades con zonas.
              </>
            )}
          </span>
        </div>

        {e.tests.map((t) => (
          <TarjetaTest key={t.slug} t={t} onLog={onLog} />
        ))}
      </div>
    </Pantalla>
  );
}

export function TestsPropuesta({ e, onLog }: { e: EstadoTests; onLog: (l: string) => void }) {
  const nadaQueHacer = !e.programado && completos(e) === 0 && empezados(e) === 0;
  return nadaQueHacer ? <SinNadaQueHacer e={e} onLog={onLog} /> : <ConProgramacion e={e} onLog={onLog} />;
}
