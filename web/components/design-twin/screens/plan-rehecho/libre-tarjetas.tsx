'use client';

// LAS TARJETAS DEL PLAN SIN COACH. Cada una es una pieza de `FreePlanView` /
// `FreePlanEvidenceCards` / `FreePlanWeekCard` / `FreePlanMarksCards` en el
// lenguaje de «Hoy · El día»: tarjetas de radio 22 con título de sección de 24,
// filas a 17 y apoyos a 15. Ninguna inventa un dato: lo que no llega no se pinta.
//
// El orden y la selección de cuáles salen lo decide `libre.tsx`.

import type { ReactNode } from 'react';
import { IcoChevron, IcoFlecha, IcoMas, IcoReintentar } from '../../kit-dia/iconos';
import { Esqueleto, Pastilla, TituloSeccion } from '../../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, TOQUE, velo } from '../../kit-dia/tokens';
import { reloj } from '../../kit-composicion/formato';
import type { CarreraDelPlanLibre, EvidenciaDeCarreras, MarcaLibre, SemanaBloqueada, Vo2Reloj } from '../../kit-plan/contrato-libre';
import {
  cuentaAtras,
  lineaDeProgreso,
  marcasQueFaltan,
  textoSinComparacion,
  veredictoDelObjetivo,
} from '../../kit-plan/libre';
import { IcoCandado, IcoPersona } from './iconos';

const tarjeta = {
  borderRadius: RADIO.tarjeta,
  background: 'var(--twin-surface)',
  border: '1px solid var(--twin-hairline)',
  boxSizing: 'border-box',
} as const;

const Seccion = ({ children }: { children: ReactNode }) => <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</section>;

const Linea = () => <div style={{ height: 1, background: 'var(--twin-hairline)' }} />;

const cuerpo = { ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' } as const;
const apoyo = { ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' } as const;

// ── Tu carrera ──────────────────────────────────────────────────────────────

export function TarjetaCarrera({ carrera }: { carrera: CarreraDelPlanLibre }) {
  const cuenta = cuentaAtras(carrera.dias);
  const faltan = carrera.comparacion ? null : marcasQueFaltan(carrera.faltan);
  return (
    <Seccion>
      <TituloSeccion
        aparte={
          cuenta ? (
            <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
              {cuenta}
            </Pastilla>
          ) : undefined
        }
      >
        Tu carrera
      </TituloSeccion>
      <div style={{ ...tarjeta, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{carrera.nombre}</h3>
          {carrera.categoria ? <p style={{ margin: '4px 0 0', ...apoyo }}>{carrera.categoria}</p> : null}
        </div>
        {carrera.objetivo ? (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ ...fuente(600, TAM.cuerpo, 1.2), color: 'var(--twin-muted)' }}>Tu objetivo</span>
            <span style={{ ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.02em', ...TABULAR, color: 'var(--twin-fg)' }}>{carrera.objetivo}</span>
          </div>
        ) : null}
        {/* Su objetivo contra su realidad: la conversación interesante, y la que faltaba. */}
        {carrera.comparacion ? (
          <>
            <Linea />
            {carrera.comparacion.tipo === 'mejor' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={apoyo}>Tu mejor en la misma categoría</span>
                  <span style={{ ...fuente(800, TAM.cuerpo, 1.2), ...TABULAR, color: 'var(--twin-fg)' }}>{reloj(carrera.comparacion.mejor.tiempoS)}</span>
                </div>
                <p style={{ margin: 0, ...cuerpo, fontWeight: 700 }}>{veredictoDelObjetivo(carrera.comparacion)}</p>
              </div>
            ) : (
              <p style={{ margin: 0, ...cuerpo }}>{textoSinComparacion(carrera.comparacion)}</p>
            )}
          </>
        ) : faltan ? (
          <>
            <Linea />
            <p style={{ margin: 0, ...cuerpo }}>{faltan}</p>
          </>
        ) : null}
      </div>
    </Seccion>
  );
}

export function TarjetaSinCarrera({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      className="pl-btn"
      onClick={onAbrir}
      style={{ ...tarjeta, width: '100%', minHeight: 84, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', color: 'var(--twin-fg)' }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...fuente(800, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>¿Ya tienes una carrera?</span>
        <span style={{ ...cuerpo, fontWeight: 600 }}>Ponla y te llevamos la cuenta atrás.</span>
      </span>
      <span aria-hidden style={{ color: 'var(--twin-accent-text)', display: 'inline-flex' }}>
        <IcoMas tam={22} />
      </span>
    </button>
  );
}

// ── Lo que ya sabemos de ti ─────────────────────────────────────────────────

export function TarjetaVo2({ vo2 }: { vo2: Vo2Reloj }) {
  return (
    <Seccion>
      <TituloSeccion>Lo que ya sabemos de ti</TituloSeccion>
      <div style={{ ...tarjeta, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{vo2.etiqueta}</span>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...fuente(800, TAM.dato, 1, true), letterSpacing: '-0.02em', ...TABULAR, color: 'var(--twin-fg)' }}>{vo2.valor}</span>
            <span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>{vo2.unidad}</span>
          </span>
        </div>
        <p style={{ margin: 0, ...apoyo }}>Lo mide tu reloj. Es el tamaño de tu motor: manda en los 8 km de carrera.</p>
      </div>
    </Seccion>
  );
}

// ── Traer su historial ──────────────────────────────────────────────────────

export function TarjetaImportar({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      className="pl-btn"
      onClick={onAbrir}
      style={{
        ...tarjeta,
        width: '100%',
        padding: '16px 18px 16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        textAlign: 'left',
        color: 'var(--twin-fg)',
        borderLeft: '4px solid var(--twin-accent)',
      }}
    >
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...fuente(800, TAM.cuerpo, 1.25, true) }}>¿Ya has corrido un HYROX?</span>
        <span style={apoyo}>Búscate por tu nombre y te traemos tus tiempos, estación por estación, en un toque.</span>
      </span>
      <span aria-hidden style={{ color: 'var(--twin-accent-text)', display: 'inline-flex' }}>
        <IcoFlecha tam={20} />
      </span>
    </button>
  );
}

// ── Las tres de arranque ────────────────────────────────────────────────────

export function TarjetaArranque({ pasos, onAbrir }: { pasos: MarcaLibre[]; onAbrir: (m: MarcaLibre) => void }) {
  return (
    <Seccion>
      <TituloSeccion>Empieza por medirte</TituloSeccion>
      <div style={{ ...tarjeta, overflow: 'hidden' }}>
        <p style={{ margin: 0, padding: '16px 18px 8px', ...apoyo }}>Si aún no has corrido ninguna, estas tres bastan para afinar tu semana.</p>
        {pasos.map((m, i) => (
          <button
            key={m.slug}
            type="button"
            className="pl-btn"
            onClick={() => onAbrir(m)}
            aria-label={`Paso ${i + 1}. ${m.etiqueta}. ${m.como}`}
            style={{ width: '100%', minHeight: 72, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', color: 'var(--twin-fg)', borderTop: '1px solid var(--twin-hairline)' }}
          >
            <span
              aria-hidden
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                background: velo('var(--twin-accent)', 16),
                color: 'var(--twin-accent-text)',
                ...fuente(800, TAM.cuerpo, 1),
                ...TABULAR,
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...fuente(700, TAM.cuerpo, 1.25) }}>{m.etiqueta}</span>
              <span style={apoyo}>{m.como}</span>
            </span>
            <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
              <IcoChevron tam={18} />
            </span>
          </button>
        ))}
      </div>
    </Seccion>
  );
}

/** El catálogo vive en el servidor: si no se puede leer no hay nada honesto que listar, y se ofrece reintentar. */
export function TarjetaCatalogoCaido({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div style={{ ...tarjeta, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, ...cuerpo, fontWeight: 700 }}>No pudimos cargar tus marcas.</p>
      <p style={{ margin: 0, ...apoyo }}>Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        type="button"
        className="pl-btn"
        onClick={onReintentar}
        style={{ alignSelf: 'flex-start', minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--twin-accent-text)', ...fuente(800, TAM.cuerpo, 1) }}
      >
        <IcoReintentar tam={18} />
        Reintentar
      </button>
    </div>
  );
}

// ── Lo que sus carreras dicen de él (el sujeto, con evidencia) ─────────────

export function FilaEvidencia({ titulo, valor, extra, nota, ritmo }: { titulo: string; valor: string; extra?: string; nota: string; ritmo?: boolean }) {
  return (
    <div style={{ padding: '14px 0', borderTop: `1px solid ${velo('var(--twin-fg)', 14)}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ flex: 1, ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{titulo}</span>
        <span style={{ ...fuente(800, ritmo ? 24 : 24, 1.1, true), ...TABULAR, color: 'var(--twin-fg)' }}>{valor}</span>
        {extra ? <span style={{ ...fuente(600, TAM.suelo, 1.2), ...TABULAR, color: 'var(--twin-fg)' }}>{extra}</span> : null}
      </div>
      <p style={{ margin: 0, ...fuente(500, TAM.suelo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{nota}</p>
    </div>
  );
}

export function textoProgreso(e: EvidenciaDeCarreras): string | null {
  return lineaDeProgreso(e);
}

// ── La semana bloqueada ─────────────────────────────────────────────────────

export function TarjetaSemanaBloqueada({ semana }: { semana: SemanaBloqueada }) {
  return (
    <Seccion>
      <TituloSeccion aparte={<span style={{ ...fuente(600, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>tu semana</span>}>Cómo se arregla</TituloSeccion>
      <div style={{ ...tarjeta, padding: '6px 18px 14px' }}>
        {semana.sesiones.map((s, i) => {
          const bloqueada = i >= semana.visibles;
          return (
            <div
              key={`${s.dia}-${s.titulo}`}
              // El desenfoque es SOLO presentación: la sesión de debajo es la real.
              className={bloqueada ? 'pl-desenfoque' : undefined}
              aria-hidden={bloqueada || undefined}
              style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < semana.sesiones.length - 1 ? '1px solid var(--twin-hairline)' : 'none' }}
            >
              <span style={{ width: 40, flex: '0 0 auto', ...fuente(800, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>{s.dia}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)' }}>{s.titulo}</span>
                <span style={{ ...fuente(700, TAM.suelo, 1.35), ...TABULAR, color: 'var(--twin-accent-text)' }}>{s.detalle}</span>
              </span>
            </div>
          );
        })}
        {/* El candado dice de dónde salen los números: es lo que separa esto de un anuncio. */}
        <p style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-muted)', textAlign: 'center' }}>
          <IcoCandado tam={16} />
          {semana.base}
        </p>
      </div>
    </Seccion>
  );
}

// ── Tus marcas ──────────────────────────────────────────────────────────────

export function TarjetaMarcas({ medidas, faltan, onAbrir, onTodas }: { medidas: MarcaLibre[]; faltan: MarcaLibre[]; onAbrir: (m: MarcaLibre) => void; onTodas: () => void }) {
  return (
    <Seccion>
      <TituloSeccion
        aparte={
          <button
            type="button"
            className="pl-btn"
            aria-label="Ver todas tus marcas"
            onClick={onTodas}
            style={{ minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--twin-accent-text)', ...fuente(800, TAM.suelo, 1) }}
          >
            Todas
            <IcoChevron tam={16} />
          </button>
        }
      >
        Tus marcas
      </TituloSeccion>
      <div style={{ ...tarjeta, overflow: 'hidden' }}>
        {medidas.map((m, i) => (
          <button
            key={m.slug}
            type="button"
            className="pl-btn"
            onClick={() => onAbrir(m)}
            aria-label={[m.etiqueta, m.valor, m.cuando].filter(Boolean).join(', ')}
            style={{ width: '100%', minHeight: 68, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'var(--twin-fg)', borderTop: i > 0 ? '1px solid var(--twin-hairline)' : 'none' }}
          >
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ ...fuente(700, TAM.cuerpo, 1.25) }}>{m.etiqueta}</span>
              {m.cuando ? <span style={apoyo}>{m.cuando}</span> : null}
            </span>
            {m.valor ? <span style={{ ...fuente(800, 24, 1.1, true), ...TABULAR }}>{m.valor}</span> : null}
            <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
              <IcoChevron tam={18} />
            </span>
          </button>
        ))}
        {faltan.length > 0 ? (
          <>
            {/* NO es una lista de deberes: cada fila dice qué DESBLOQUEA. */}
            <p style={{ margin: 0, padding: medidas.length > 0 ? '14px 18px 4px' : '16px 18px 4px', borderTop: medidas.length > 0 ? '1px solid var(--twin-hairline)' : 'none', ...fuente(700, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>
              Lo que aún no hemos medido
            </p>
            {faltan.map((m) => (
              <button
                key={m.slug}
                type="button"
                className="pl-btn"
                onClick={() => onAbrir(m)}
                aria-label={`${m.etiqueta}, aún sin medir. ${m.desbloquea}. ${m.dura}.`}
                style={{ width: '100%', minHeight: 72, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: 'var(--twin-fg)' }}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ ...fuente(600, TAM.cuerpo, 1.25) }}>{m.etiqueta}</span>
                  <span style={apoyo}>{m.desbloquea}</span>
                </span>
                <span style={{ ...apoyo, whiteSpace: 'nowrap', alignSelf: 'flex-start', paddingTop: 2 }}>{m.dura}</span>
                <span aria-hidden style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
                  <IcoChevron tam={18} />
                </span>
              </button>
            ))}
          </>
        ) : null}
      </div>
    </Seccion>
  );
}

// ── El cierre: la persona, no el paywall ────────────────────────────────────

export function TarjetaConversion({ onHablar }: { onHablar: () => void }) {
  return (
    <Seccion>
      <div style={{ ...tarjeta, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            aria-hidden
            style={{ width: 48, height: 48, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center', background: 'var(--twin-surface-elevated)', border: '1px solid var(--twin-hairline-strong)', color: 'var(--twin-fg)' }}
          >
            <IcoPersona tam={24} />
          </span>
          <div>
            <h3 style={{ margin: 0, ...fuente(800, TAM.cuerpo, 1.25, true), color: 'var(--twin-fg)' }}>Entrena con un coach</h3>
            <p style={{ margin: '2px 0 0', ...apoyo }}>Una llamada de 15 minutos</p>
          </div>
        </div>
        <p style={{ margin: 0, ...cuerpo }}>Estos números son tuyos y son gratis. Lo que cuesta es decidir qué hacer con ellos cada semana: eso lo hace un coach.</p>
        <button
          type="button"
          className="pl-btn"
          onClick={onHablar}
          style={{ minHeight: 52, borderRadius: RADIO.pastilla, background: 'var(--twin-fg)', color: 'var(--twin-bg)', ...fuente(800, TAM.cuerpo, 1, true) }}
        >
          Hablar con un coach
        </button>
        <p style={{ margin: 0, textAlign: 'center', ...apoyo }}>Sin compromiso · eliges tú el hueco</p>
      </div>
    </Seccion>
  );
}

// ── En frío ─────────────────────────────────────────────────────────────────

/** La silueta de las tarjetas que llegarán (carrera y una segunda), para que nada salte. */
export function TarjetasEsqueleto() {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Esqueleto ancho={i === 0 ? 130 : 220} alto={24} radio={7} />
          <Esqueleto alto={i === 0 ? 170 : 112} radio={RADIO.tarjeta} />
        </div>
      ))}
    </div>
  );
}
