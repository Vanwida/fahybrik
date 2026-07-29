'use client';

// LAS TRES COLUMNAS DE LA CARA DE REGATA — solo horizontal.
//
// El móvil apoyado en el ergo, a metro y medio, sin soltar la maneta. Aquí no
// se navega: se barre. Y como el ancho sobra y el alto falta, la disposición es
// la de la app shipeada (`ErgHUDContent.landscapeBody`: objetivo · héroe ·
// raíl), con TODO lo que el monitor sabe y en vertical no cabía.
//
// La unión es deliberada, de las DOS superficies horizontales que existen hoy:
//   · del Swift shipeado → caja de objetivo con lo cubierto y el total, héroe
//     del split con su media y el crono etiquetado, raíl de paladas/vatios/pulso.
//   · del espejo `benchmark-erg` → vatios medios, calorías, cal/h, proyección
//     de acabado y la resistencia del ventilador.
//
// Y dos cosas que ninguna de las dos tenía: los parciales apilándose bajo el
// objetivo, y el delta contra el objetivo coloreado junto al split.
//
// JERARQUÍA en tres escalones, para que una rejilla de doce cifras siga siendo
// legible desde el ergo: el split manda (118 px), el objetivo y el raíl vivo se
// leen de un vistazo (48 y 34 px), y lo que solo se mira entre paladas va en
// una lista compacta (20 px).

import type { ReactNode } from 'react';
import { Mono, Label } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { Delta, colorZona, zonaDe } from '../../kit-vivo';
import { BarraDrenaje } from './atomos';
import {
  CADENCIA_UNIDAD,
  MEDIDA_UNIDAD,
  MONITOR,
  type LecturaViva,
  type Maquina,
  type Parcial,
  acumuladoTexto,
  calPorHoraDeVatios,
  caloriasEn,
  fmtElapsed,
  parcialesDe,
  parcialesHasta,
  proyeccionS,
  ritmoConUnidad,
} from './data';
import type { EstadoErg } from './motor';

/**
 * Anchos del lienzo horizontal (756 pt útiles tras los safe areas).
 *
 * NO hay columna de acción. La tuvo, copiada de la app, y estrujaba la rejilla
 * entera para dejar un botón enorme flotando al lado de los números: mientras
 * trabajas, cerrar la serie a mano es la SALIDA DE EMERGENCIA (lo normal es que
 * cierre el cruce), y una salida de emergencia no se lleva un sexto del ancho.
 * Ese ancho vuelve al héroe, y la salida se remata al pie del raíl. Donde la
 * acción SÍ es lo principal (descanso, cuenta, cierre) va grande dentro de su
 * propia cara, igual que en vertical.
 */
export const COL = { objetivo: 168, rail: 152 } as const;

// ---------------------------------------------------------------------------
// Izquierda — el objetivo, y debajo lo que ya cantó el monitor
// ---------------------------------------------------------------------------

export function ColumnaObjetivo({ e }: { e: EstadoErg }) {
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const hayMedida = e.medido != null && e.restante != null;
  const hecho = hayMedida && (e.restante ?? 0) <= 0;
  const total = hayMedida ? acumuladoTexto(e.pres, e.serie, e.medido ?? 0) : null;
  const parciales = e.pres.series === 1 ? parcialesHasta(parcialesDe(e.pres), e.t) : [];
  const mudo = e.monitor === 'mudo';

  return (
    <div style={{ width: COL.objetivo, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      {hayMedida && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 12px',
            borderRadius: 14,
            background: 'var(--twin-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span
              className="t-readout-l"
              style={{ color: hecho ? 'var(--twin-ok)' : mudo ? 'var(--twin-faint)' : 'var(--twin-fg)' }}
            >
              {hecho ? e.medido : e.restante}
            </span>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{unidad}</span>
          </div>
          <BarraDrenaje
            restante={e.restante ?? 0}
            total={e.pres.cantidad}
            ciego={mudo}
            cubierta={hecho}
            alto={10}
          />
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <Label size={9} color={hecho ? 'var(--twin-ok)' : 'var(--twin-muted)'}>
              {hecho ? 'Hecho' : 'Te quedan'}
            </Label>
            <span style={{ flex: 1 }} />
            <Mono size={11} weight={600} color="var(--twin-faint)">
              {e.medido} / {e.pres.cantidad}
            </Mono>
          </div>
          {total && (
            <Mono size={11} weight={600} color="var(--twin-faint)" style={{ textAlign: 'right' }}>
              {total}
            </Mono>
          )}
        </div>
      )}

      {/* El hueco de esta columna se gana con lo que el monitor YA cantó: los
          parciales de una pieza continua, o las series ya cerradas de un
          intervalo. Es la misma pregunta («cómo voy») a dos escalas. */}
      {parciales.length > 0 && <Parciales parciales={parciales} />}
      {parciales.length === 0 && e.hechas.length > 0 && <SeriesHechas e={e} />}
    </div>
  );
}

function SeriesHechas({ e }: { e: EstadoErg }) {
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '6px 10px 4px' }}>
        <Label size={9}>Series hechas</Label>
      </div>
      {e.hechas.map((r) => (
        <div
          key={r.serie}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            padding: '4px 10px 6px',
            borderTop: '1px solid var(--twin-hairline)',
          }}
        >
          <Mono size={11} weight={700} color="var(--twin-muted)">{r.serie}</Mono>
          <span style={{ flex: 1 }} />
          {r.ritmoMedio != null && <Mono size={13} weight={800}>{fmtPace500(r.ritmoMedio)}</Mono>}
          <Mono size={11} color="var(--twin-faint)">{r.medido} {unidad}</Mono>
          <Mono size={12} weight={700} color="var(--twin-fg)">{fmtClock(r.duracionS)}</Mono>
        </div>
      ))}
    </div>
  );
}

/** Los parciales que ya cantó el monitor, apilándose de arriba abajo. */
function Parciales({ parciales }: { parciales: Parcial[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '6px 10px 4px' }}>
        <Label size={9}>Parciales</Label>
      </div>
      {parciales.map((p) => (
        <div
          key={p.metros}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            padding: '4px 10px 6px',
            borderTop: '1px solid var(--twin-hairline)',
          }}
        >
          <Mono size={11} weight={700} color="var(--twin-muted)">{p.metros}</Mono>
          <span style={{ flex: 1 }} />
          <Mono size={14} weight={800}>{fmtPace500(p.ritmo)}</Mono>
          <Mono size={11} color="var(--twin-faint)">{fmtClock(Math.round(p.acumuladoS))}</Mono>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Centro — el número por el que gobiernas
// ---------------------------------------------------------------------------

export interface HeroRegata {
  etiqueta: string;
  valor: string;
  unidad: string;
  px: number;
  color?: string;
  delta?: { valor: number; unidad: string; mejorEs: 'menos' | 'mas'; sufijo: string; textoNulo: string };
}

export function HeroRegataCard({
  e,
  hero,
  media,
  menores,
}: {
  e: EstadoErg;
  hero: HeroRegata;
  media: string | null;
  /** Lo que se mira ENTRE paladas, no durante. */
  menores?: Array<{ etiqueta: string; valor: string }>;
}) {
  const armado = e.fase === 'armado';
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 10px',
        borderRadius: 14,
        background: 'linear-gradient(to bottom, var(--twin-surface-elevated), var(--twin-surface))',
        border: '1px solid var(--twin-hairline)',
        boxShadow: 'var(--twin-shadow-hero)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--twin-accent)' }} />
      <Label size={9}>{hero.etiqueta}</Label>
      <span
        className="t-readout-hero"
        style={{ fontSize: hero.px, color: hero.color ?? 'var(--twin-fg)', lineHeight: 1, transition: 'color 600ms linear' }}
      >
        {hero.valor}
      </span>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{hero.unidad}</span>
      {hero.delta && (
        <div style={{ marginTop: 4 }}>
          <Delta {...hero.delta} />
        </div>
      )}
      <div aria-hidden style={{ alignSelf: 'stretch', height: 1, background: 'var(--twin-hairline)', margin: '6px 0 5px' }} />
      <div style={{ display: 'flex', gap: 10, alignSelf: 'stretch' }}>
        {media && <SubDato valor={media} etiqueta="media /500m" />}
        <SubDato
          valor={fmtElapsed(e.t)}
          etiqueta={armado ? 'empieza al remar' : e.pres.series > 1 ? 'esta serie' : 'este tramo'}
        />
      </div>
      {menores && menores.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignSelf: 'stretch',
            gap: 4,
            marginTop: 5,
            paddingTop: 5,
            borderTop: '1px solid var(--twin-hairline)',
          }}
        >
          {menores.map((m) => (
            <div
              key={m.etiqueta}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <span className="t-readout-s" style={{ fontSize: 16 }}>{m.valor}</span>
              <span
                style={{
                  font: '600 8px/1 var(--twin-font-mono)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--twin-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {m.etiqueta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubDato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span className="t-readout-m">{valor}</span>
      <span
        style={{
          font: '600 9px/1 var(--twin-font-mono)',
          letterSpacing: '0.05em',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {etiqueta}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derecha — el raíl: lo que cambia palada a palada, y lo que se mira entre ellas
// ---------------------------------------------------------------------------

export function RailRegata({
  e,
  viva,
  maquina,
  salida,
}: {
  e: EstadoErg;
  viva: LecturaViva;
  maquina: Maquina;
  /** La salida a mano, rematando la columna. Secundaria: no es el camino normal. */
  salida?: ReactNode;
}) {
  const zona = zonaDe(e.pulso);
  const mudo = e.monitor !== 'vivo';

  return (
    <div style={{ width: COL.rail, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      {!mudo && <TileVivo valor={`${viva.cadencia}`} etiqueta={CADENCIA_UNIDAD[maquina]} />}
      {!mudo && <TileVivo valor={`${viva.vatios}`} etiqueta="vatios" color="var(--twin-accent-text)" />}
      {e.pulso != null && (
        <TileVivo valor={`${e.pulso}`} etiqueta="pulso" color={colorZona(zona)} zona={zona} />
      )}
      {/* La salida remata la columna, no la preside: el camino normal es que
          cierre el cruce, y esto es lo que queda cuando la medida falla. */}
      {salida && <div style={{ marginTop: 'auto', paddingTop: 4 }}>{salida}</div>}
    </div>
  );
}

/**
 * Lo que el monitor sabe y NO cambia palada a palada. Vivía en el raíl y no
 * cabía: la columna pedía 112 pt y tenía 74, así que recortaba la proyección y
 * la resistencia por abajo sin decirlo. Ahora va donde sí hay sitio y sentido,
 * en una fila bajo el número por el que gobiernas.
 */
export function lecturasMenores(
  e: EstadoErg,
  viva: LecturaViva,
  maquina: Maquina,
  mediaRitmo: number | null,
): Array<{ etiqueta: string; valor: string }> {
  const mudo = e.monitor !== 'vivo';
  const proy = e.medido == null ? null : proyeccionS(e.pres, e.t, e.medido, viva.ritmo);
  const out: Array<{ etiqueta: string; valor: string }> = [];
  if (!mudo && mediaRitmo != null) {
    out.push({ etiqueta: 'vatios medios', valor: `${Math.round(vatiosDeMedia(mediaRitmo))}` });
  }
  out.push({ etiqueta: 'cal', valor: `${caloriasEn(maquina, e.t)}` });
  if (!mudo) out.push({ etiqueta: 'cal/h', valor: `${Math.round(calPorHoraDeVatios(viva.vatios))}` });
  if (proy != null) out.push({ etiqueta: 'proyección', valor: fmtElapsed(proy) });
  out.push({ etiqueta: 'resistencia', valor: `${MONITOR.drag}` });
  return out;
}

/** Vatios sostenidos por un ritmo medio: la misma relación, sin redondear. */
function vatiosDeMedia(ritmoMedio: number): number {
  return 2.8 / (ritmoMedio / 500) ** 3;
}

function TileVivo({
  valor,
  etiqueta,
  color = 'var(--twin-fg)',
  zona,
}: {
  valor: string;
  etiqueta: string;
  color?: string;
  zona?: ReturnType<typeof zonaDe>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 0,
        padding: '4px 6px',
        borderRadius: 12,
        background: 'var(--twin-surface)',
      }}
    >
      <span className="t-readout-m" style={{ color, transition: 'color 600ms linear' }}>{valor}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{etiqueta}</span>
        {zona && <span className="tw-zone" data-zone={zona}>{`Z${zona}`}</span>}
      </div>
    </div>
  );
}

/** El ritmo por 500 m sostenido en la ventana, ya formateado. Nulo sin medida. */
export function mediaDeVentana(e: EstadoErg): number | null {
  if (e.pres.medida !== 'metros' || e.medido == null || e.medido <= 0 || e.t <= 0) return null;
  return (500 * e.t) / e.medido;
}

/**
 * La línea de la franja: contra qué vas y qué viene después.
 *
 * La CANTIDAD no se repite aquí: la columna del objetivo ya la lleva («444 /
 * 500 m»), y con ella la línea se cortaba con puntos suspensivos justo donde
 * empieza lo único que no está en ningún otro sitio, que es el «luego».
 */
export function lineaContexto(e: EstadoErg): string {
  const objetivo = e.pres.objetivo;
  const contra =
    objetivo?.clase === 'ritmo'
      ? ritmoConUnidad(objetivo.segundosPor500)
      : `${e.pres.cantidad} ${MEDIDA_UNIDAD[e.pres.medida]}`;
  const luego = e.pres.descansoS != null ? `luego descanso ${fmtClock(e.pres.descansoS)}` : null;
  return [contra, luego].filter(Boolean).join(' · ');
}
