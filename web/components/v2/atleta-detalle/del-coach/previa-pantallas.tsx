'use client';

// LAS CINCO PANTALLAS DE LA PREVIA — el cuerpo de lo que se ve dentro del móvil.
//
// Viven aparte del marco (`previa.tsx`) por tamaño: son cinco composiciones
// completas y juntas pasaban del presupuesto de 500 líneas del repo. Los átomos
// son los del DOBLE (`kit.tsx`, `chrome.tsx`, `ChipTipo`), así que aquí no se
// inventa ni un color ni un tamaño: lo único propio es el ARMADO, y es propio
// porque estas pantallas leen el BORRADOR que el coach está escribiendo, no el
// escenario cableado de la tanda del doble.

import type { CSSProperties, ReactNode } from 'react';
import { Card, Display, Hairline, IconCircle, Label, Mono, Notice } from '@/components/design-twin/kit';
import { NavBar, Pantalla, Seccion } from '@/components/design-twin/kit-composicion/chrome';
import { S } from '@/components/design-twin/kit-composicion/tokens';
import { ChipTipo } from '@/components/design-twin/coach-com/piezas';
import type { TipoComunicado } from '@/components/design-twin/coach-com/modelo';
import {
  checkableItems,
  type CommunicationKind,
} from '@fahybrid/shared/domain/coach-communications';
import type { Borrador } from '@/lib/dashboard/v2/del-coach-borrador';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import { PreviaNota } from './previa-nota';

/** El mismo vocabulario dicho en los dos idiomas del repo: el dominio va en
 *  inglés y el doble se escribió en castellano. Cinco entradas, un solo sitio. */
export const TIPO_TWIN: Record<CommunicationKind, TipoComunicado> = {
  protocol: 'protocolo',
  question: 'pregunta',
  task: 'tarea',
  note: 'nota',
  focus: 'foco',
};

const SIN_TITULO = 'Sin título todavía';
const TENUE = 'var(--twin-faint)';

function titulo(b: Borrador): { texto: string; color: string } {
  const t = b.title.trim();
  return t ? { texto: t, color: 'var(--twin-fg)' } : { texto: SIN_TITULO, color: TENUE };
}

/** La pantalla que le toca al tipo. Tres abren pantalla propia; la tarea y el
 *  foco viven dentro de la bandeja, que es la misma decisión de diseño tomada
 *  desde el otro lado. */
export function PantallaDelTipo({
  b,
  coachName,
  foco,
  camino,
  zonas,
}: {
  b: Borrador;
  coachName: string;
  /** La fila que el coach está tocando. La previa se coloca en ella y la marca. */
  foco: string | null;
  /** El plan REAL del destinatario, para la sección «camino». */
  camino: PlanPathDTO | null;
  /** Sus barras de tiempo en zonas, por clave de sección: cada gráfica de la
   *  nota puede mirar un periodo distinto. */
  zonas: Map<string, ZoneChartDTO>;
}) {
  if (b.kind === 'protocol') return <PreviaProtocolo b={b} coachName={coachName} foco={foco} />;
  if (b.kind === 'question') return <PreviaPregunta b={b} coachName={coachName} foco={foco} />;
  if (b.kind === 'note') {
    return (
      <PreviaNota
        b={b}
        cabecera={<Cabecera kind="note" coachName={coachName} />}
        foco={foco}
        camino={camino}
        zonas={zonas}
      />
    );
  }
  return <PreviaBandeja b={b} />;
}

/** El anillo de la fila que se está editando. Vive aquí y en `previa-nota.tsx`
 *  con la misma forma porque es el mismo gesto: señalar dónde estás. */
export function anilloDeFoco(activa: boolean): CSSProperties {
  return activa
    ? { borderRadius: 12, outline: '1.5px solid var(--twin-accent)', outlineOffset: 2 }
    : {};
}

// ---------------------------------------------------------------------------
// Cabecera común de los tres detalles
// ---------------------------------------------------------------------------

/** Chip · de quién y cuándo · accesorio. Idéntica en los tres detalles a
 *  propósito: abrir una pregunta y abrir un protocolo son la misma casa. */
function Cabecera({
  kind,
  coachName,
  accesorio,
}: {
  kind: CommunicationKind;
  coachName: string;
  accesorio?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        padding: `${S.m}px ${S.l}px`,
        borderBottom: '1px solid var(--twin-hairline)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ display: 'flex' }}>
          <ChipTipo tipo={TIPO_TWIN[kind]} />
        </span>
        <span style={{ font: '500 11.5px/1.2 var(--twin-font-sans)', color: TENUE }}>
          De {coachName} · ahora
        </span>
      </span>
      {accesorio}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protocolo
// ---------------------------------------------------------------------------

function PreviaProtocolo({ b, coachName, foco }: { b: Borrador; coachName: string; foco: string | null }) {
  const pasos = b.steps.filter((p) => p.content.trim().length > 0);
  // Sólo lo que lleva casilla tiene cuenta, barra y acción de cierre. Sin nada
  // que marcar el protocolo se lee y ya está, y fingir un «0 de 5» sobre cinco
  // líneas de lectura sería enseñarle un deber que no existe.
  const marcables = checkableItems(pasos);
  const t = titulo(b);

  return (
    <Pantalla
      estrategia="llena"
      cabecera={
        <Cabecera
          kind="protocol"
          coachName={coachName}
          accesorio={
            marcables.length > 0 ? (
              <Mono size={13} weight={700} color="var(--twin-muted)">
                0 de {marcables.length}
              </Mono>
            ) : undefined
          }
        />
      }
      accion={
        marcables.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
            <span className="tw-btn-primary" style={{ width: '100%', opacity: 0.4 }}>
              Protocolo hecho
            </span>
            <span
              style={{
                textAlign: 'center',
                font: '500 11.5px/1.35 var(--twin-font-sans)',
                color: TENUE,
              }}
            >
              {marcables.length === 1
                ? 'Te queda 1 paso por marcar.'
                : `Te quedan ${marcables.length} pasos por marcar.`}
            </span>
          </div>
        ) : undefined
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.l}px ${S.xl}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
          <Display size={24} color={t.color}>
            {t.texto}
          </Display>
          {b.body.trim() ? (
            <span style={{ font: '400 13.5px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {b.body.trim()}
            </span>
          ) : null}
          <BarraProgreso total={marcables.length} />
        </div>

        {pasos.length > 0 ? (
          <Card padding={0}>
            {pasos.map((paso, i) => (
              <div key={paso.key} data-fila={paso.key} style={anilloDeFoco(paso.key === foco)}>
                {i > 0 ? <Hairline style={{ marginLeft: S.l + 38 + S.m }} /> : null}
                <div
                  style={{
                    minHeight: 56,
                    display: 'flex',
                    alignItems: 'center',
                    gap: S.m,
                    padding: `${S.m}px ${S.l}px`,
                  }}
                >
                  <span style={{ flex: '0 0 38px', textAlign: 'right' }}>
                    <Mono size={14} weight={700}>
                      {paso.label.trim()}
                    </Mono>
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: '500 14px/1.35 var(--twin-font-sans)',
                      color: 'var(--twin-fg)',
                    }}
                  >
                    {paso.content.trim()}
                  </span>
                  {/* Sin casilla no se dibuja un círculo apagado: sería un
                      deber pendiente donde sólo hay una línea que leer. */}
                  {paso.checkable ? (
                    <span style={{ flex: '0 0 auto', display: 'inline-flex', color: TENUE }}>
                      <IconCircle size={21} />
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <Vacia texto="Escribe el primer paso y aparecerá aquí." />
        )}

        {b.final_note.trim() ? (
          <Card padding={S.l} leftAccent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label size={9.5}>Nota de {coachName}</Label>
              <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                {b.final_note.trim()}
              </span>
            </div>
          </Card>
        ) : null}
      </div>
    </Pantalla>
  );
}

/** El avance, medido. Un segmento por paso: dos de siete es un dato. */
function BarraProgreso({ total }: { total: number }) {
  if (total === 0) return null;
  return (
    <div aria-hidden style={{ display: 'flex', gap: 3, height: 4, marginTop: 2 }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ flex: 1, borderRadius: 2, background: 'var(--twin-surface-sunken)' }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pregunta
// ---------------------------------------------------------------------------

function PreviaPregunta({ b, coachName, foco }: { b: Borrador; coachName: string; foco: string | null }) {
  const opciones = b.options.filter((o) => o.content.trim().length > 0);
  const t = titulo(b);

  return (
    <Pantalla estrategia="centra" cabecera={<Cabecera kind="question" coachName={coachName} />}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: S.l,
          padding: `${S.l}px ${S.l}px ${S.xl}px`,
          boxSizing: 'border-box',
        }}
      >
        <Display size={26} color={t.color}>
          {t.texto}
        </Display>

        {b.body.trim() ? (
          <span style={{ font: '400 14.5px/1.5 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {b.body.trim()}
          </span>
        ) : null}

        {b.blocks ? (
          <Notice tone="warning">Hasta que no contestes, tu plan se queda sin cerrar.</Notice>
        ) : null}

        {opciones.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
            {opciones.map((o) => (
              <div key={o.key} data-fila={o.key} style={anilloDeFoco(o.key === foco)}>
              <Card padding={S.l}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.m }}>
                  <span style={{ color: TENUE, display: 'inline-flex', paddingTop: 1 }}>
                    <IconCircle size={19} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={{ font: '650 16px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                      {o.content.trim()}
                    </span>
                    {o.consequence.trim() ? (
                      <span style={{ font: '400 13px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                        {o.consequence.trim()}
                      </span>
                    ) : null}
                  </span>
                </div>
              </Card>
              </div>
            ))}
          </div>
        ) : (
          <Vacia texto="Escribe la primera opción y aparecerá aquí." />
        )}
      </div>
    </Pantalla>
  );
}

// ---------------------------------------------------------------------------
// Tarea y foco: los dos que NO abren pantalla
// ---------------------------------------------------------------------------

function PreviaBandeja({ b }: { b: Borrador }) {
  const esTarea = b.kind === 'task';
  const t = titulo(b);

  return (
    <Pantalla estrategia="llena" cabecera={<NavBar titulo="Del coach" />}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S.m,
          padding: `${S.m}px ${S.l}px ${S.xl}px`,
        }}
      >
        <Seccion>{esTarea ? 'Para hacer' : 'Tu foco'}</Seccion>
        <Card padding={S.l}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.m }}>
            {esTarea ? (
              <span style={{ color: TENUE, display: 'inline-flex', paddingTop: 2 }}>
                <IconCircle size={22} />
              </span>
            ) : null}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
                <ChipTipo tipo={TIPO_TWIN[b.kind]} />
              </span>
              <span style={{ font: '650 16px/1.25 var(--twin-font-sans)', color: t.color }}>
                {t.texto}
              </span>
              {b.body.trim() ? (
                <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                  {b.body.trim()}
                </span>
              ) : null}
            </span>
          </div>
        </Card>
        <span style={{ font: '400 12px/1.4 var(--twin-font-sans)', color: TENUE }}>
          {esTarea
            ? 'La cierra con un toque en el círculo, sin abrir nada.'
            : 'Se queda fijo aquí arriba. No caduca y no le reclama nada.'}
        </span>
      </div>
    </Pantalla>
  );
}

/** Lo que aún no has escrito no se finge con contenido de mentira. */
function Vacia({ texto }: { texto: string }) {
  return (
    <div
      style={{
        border: '1px dashed var(--twin-hairline-strong)',
        borderRadius: 14,
        padding: S.l,
        font: '400 13px/1.45 var(--twin-font-sans)',
        color: TENUE,
        textAlign: 'center',
      }}
    >
      {texto}
    </div>
  );
}
