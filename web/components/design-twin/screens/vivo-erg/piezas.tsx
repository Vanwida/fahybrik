'use client';

// Las piezas compuestas del ergo, transcritas de la superficie shipeada
// (`ios/FAHYBRIK/Devices/PM5/ErgHUDContent.swift`) y dichas con la voz de esta
// familia. El orden es el suyo, y por la razón que él documenta: a media pieza,
// leyendo desde tres metros con el móvil en el suelo, las preguntas llegan así:
//
//   ¿voy a ritmo? → ¿cuánto queda? → ¿qué serie es esta? → ¿cuánto aprieto?
//
// De ahí: franja de contexto · caja del objetivo · sujeto · raíl de trabajo.

import { Card, Hairline, Label, Mono, SP } from '../../kit';
import { fmtClock, fmtPace500 } from '../../sim';
import { BarraDrenaje, Celda, Delta, zonaDe, COLOR_ZONA } from './atomos';
import {
  CADENCIA_UNIDAD,
  MEDIDA_UNIDAD,
  type LecturaViva,
  type Maquina,
  type ResumenSerie,
  acumuladoTexto,
  caloriasEn,
  fmtElapsed,
  objetivoTexto,
  proyeccionS,
} from './data';
import type { EstadoErg } from './motor';

// ---------------------------------------------------------------------------
// La franja de contexto — qué serie, qué trabajo, y QUÉ VIENE DESPUÉS
// ---------------------------------------------------------------------------

/**
 * «SERIE 2/5 · 500 m a 1:52/500m · luego descanso 2:00». El «luego» es de la
 * app y contesta a media pieza la pregunta que si no se hace en el descanso.
 */
export function FranjaContexto({ e }: { e: EstadoErg }) {
  const objetivo = objetivoTexto(e.pres);
  const trabajo = `${e.pres.cantidad} ${MEDIDA_UNIDAD[e.pres.medida]}${objetivo ? ` a ${objetivo}` : ''}`;
  const luego = e.pres.descansoS != null ? `luego descanso ${fmtClock(e.pres.descansoS)}` : null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: SP.s,
        padding: '7px 12px',
        borderRadius: 10,
        background: 'var(--twin-surface)',
      }}
    >
      {e.pres.series > 1 && (
        <span
          style={{
            font: '800 11px/1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            color: 'var(--twin-accent-text)',
            whiteSpace: 'nowrap',
          }}
        >
          SERIE {e.serie}/{e.pres.series}
        </span>
      )}
      <span
        style={{
          font: '500 11px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {[trabajo, luego].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La caja del objetivo — lo que QUEDA, lo cubierto, y el total de la pieza
// ---------------------------------------------------------------------------

/**
 * A media serie nadie quiere «cuánto llevo»: quiere cuánto le QUEDA. Debajo, lo
 * cubierto sobre lo pedido, y a la derecha el total de la pieza entera, que
 * calla cuando diría lo mismo que la ventana (`accumulatedErgLine`).
 *
 * Sin medida no hay caja: no se pinta un denominador inventado.
 */
export function CajaObjetivo({ e }: { e: EstadoErg }) {
  if (e.medido == null || e.restante == null) return null;
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const hecho = e.restante <= 0;
  const total = acumuladoTexto(e.pres, e.serie, e.medido);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--twin-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span
          className="t-readout-l"
          style={{ color: hecho ? 'var(--twin-ok)' : e.monitor === 'mudo' ? 'var(--twin-faint)' : 'var(--twin-fg)' }}
        >
          {hecho ? e.medido : e.restante}
        </span>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{unidad}</span>
        <span style={{ flex: 1 }} />
        <Mono size={12} weight={600} color="var(--twin-muted)">
          {e.medido} / {e.pres.cantidad} {unidad}
        </Mono>
      </div>
      <BarraDrenaje
        restante={e.restante}
        total={e.pres.cantidad}
        ciego={e.monitor === 'mudo'}
        cubierta={hecho}
        alto={12}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
        <Label size={10} color={hecho ? 'var(--twin-ok)' : 'var(--twin-muted)'}>
          {hecho ? 'Hecho' : 'Te quedan'}
        </Label>
        <span style={{ flex: 1 }} />
        {total && <Mono size={11} weight={600} color="var(--twin-faint)">{total}</Mono>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sujeto — el ritmo por el que gobiernas, con su media y su crono debajo
// ---------------------------------------------------------------------------

export interface SujetoErg {
  etiqueta: string;
  valor: string;
  unidad: string;
  /** Máximo del readout: lo fija el ancho del lienzo, no el gusto. */
  maxPx: number;
  color?: string;
}

/**
 * El crono lleva ETIQUETA, no solo cifra: mientras espera a la máquina dice
 * «empieza al remar» en vez de enseñar un 00:00 que parece la app rota.
 */
export function HeroErg({
  e,
  sujeto,
  media,
  delta,
}: {
  e: EstadoErg;
  sujeto: SujetoErg;
  /** El ritmo medio de la serie, ya formateado. Nulo cuando no hay. */
  media: string | null;
  delta?: { valor: number; unidad: string; mejorEs: 'menos' | 'mas'; sufijo: string; textoNulo: string };
}) {
  const armado = e.fase === 'armado';
  return (
    <Card padding={SP.m} topAccent elevated fill>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <Label size={10}>{sujeto.etiqueta}</Label>
        <span
          className="t-readout-hero"
          style={{
            fontSize: `clamp(64px, 16vh, ${sujeto.maxPx}px)`,
            color: sujeto.color ?? 'var(--twin-fg)',
            transition: 'color 600ms linear',
          }}
        >
          {sujeto.valor}
        </span>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{sujeto.unidad}</span>
        {delta && (
          <div style={{ marginTop: 6 }}>
            <Delta {...delta} />
          </div>
        )}
        <Hairline style={{ alignSelf: 'stretch', margin: '8px 0 6px' }} />
        <div style={{ display: 'flex', gap: SP.s, alignSelf: 'stretch' }}>
          {media != null && <SubLectura valor={media} etiqueta="media /500m" />}
          <SubLectura
            valor={fmtElapsed(e.t)}
            etiqueta={armado ? 'empieza al remar' : e.pres.series > 1 ? 'esta serie' : 'este tramo'}
          />
        </div>
      </div>
    </Card>
  );
}

function SubLectura({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <span className="t-readout-m">{valor}</span>
      <span
        style={{
          font: '600 10px/1 var(--twin-font-mono)',
          letterSpacing: '0.06em',
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
// El raíl de trabajo — SOLO lo que cambia palada a palada
// ---------------------------------------------------------------------------

/**
 * Ritmo, potencia y pulso. Y nada más: calorías, cal/h, drag, media y
 * proyección estuvieron aquí como ocho azulejos de 21 pt que nadie leía a media
 * pieza, y la app los movió a donde SÍ hay ojos para ellos (el descanso y la
 * cara de monitor). Esta familia mantiene esa decisión en vez de deshacerla.
 */
export function RailTrabajo({ e, viva, maquina }: { e: EstadoErg; viva: LecturaViva; maquina: Maquina }) {
  const zona = zonaDe(e.pulso);
  const mudo = e.monitor !== 'vivo';
  // En la bici los vatios YA son el sujeto: repetirlos aquí sería el mismo dato
  // dos veces en la misma pantalla, y el sitio se lo queda lo que no está.
  const vatiosEnSujeto = e.pres.medida === 'calorias';
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {!mudo && <Celda etiqueta={CADENCIA_UNIDAD[maquina].split('/')[0]} valor={`${viva.cadencia}`} />}
      {!mudo && !vatiosEnSujeto && (
        <Celda etiqueta="vatios" valor={`${viva.vatios}`} color="var(--twin-accent-text)" />
      )}
      {!mudo && vatiosEnSujeto && <Celda etiqueta="cal" valor={`${caloriasEn(maquina, e.t)}`} />}
      {e.pulso != null && (
        <Celda etiqueta="pulso" valor={`${e.pulso}`} color={COLOR_ZONA(zona)} pie={zona ? `Z${zona}` : undefined} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lo que el monitor sabe y a media pieza no cabe — se lee parado
// ---------------------------------------------------------------------------

/**
 * Calorías, proyección y resistencia del ventilador. El monitor los sabe
 * siempre; se pintan donde hay ojos para leerlos: el descanso, el cierre y la
 * cara horizontal.
 */
export function LecturasDeParada({ e, maquina, ritmo }: { e: EstadoErg; maquina: Maquina; ritmo: number | null }) {
  const cal = caloriasEn(maquina, e.t);
  const proy = e.medido == null ? null : proyeccionS(e.pres, e.t, e.medido, ritmo);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Celda etiqueta="cal" valor={`${cal}`} />
      {proy != null && <Celda etiqueta="proyección" valor={fmtElapsed(proy)} />}
      <Celda etiqueta="resistencia" valor="118" pie="del ventilador" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las series ya cerradas — lo que costó cada una
// ---------------------------------------------------------------------------

/**
 * La tabla que hace que un móvil gane a una pizarra: qué costó cada serie y qué
 * midió el monitor de verdad, sin recortar al objetivo (504 m para un hito de
 * 500 se leen 504). Espejo del `StrikeList` de la app, sin su toque para
 * avanzar: aquí las líneas ya están cerradas.
 */
export function TablaSeries({ e }: { e: EstadoErg }) {
  if (e.hechas.length === 0) return null;
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  return (
    <Card padding={0} topAccent>
      <div style={{ display: 'flex', alignItems: 'baseline', padding: '9px 12px' }}>
        <Label size={10}>Series hechas</Label>
        <span style={{ flex: 1 }} />
        <Mono size={11} color="var(--twin-muted)">
          {e.hechas.length} de {e.pres.series}
        </Mono>
      </div>
      {e.hechas.map((r) => (
        <div key={r.serie}>
          <Hairline />
          <FilaSerie resumen={r} unidad={unidad} />
        </div>
      ))}
    </Card>
  );
}

function FilaSerie({ resumen, unidad }: { resumen: ResumenSerie; unidad: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 12px' }}>
      <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        Serie {resumen.serie}
      </span>
      <span style={{ flex: 1 }} />
      {resumen.ritmoMedio != null && (
        <Mono size={13} weight={700} color="var(--twin-muted)">
          {fmtPace500(resumen.ritmoMedio)}/500m
        </Mono>
      )}
      <Mono size={13} color="var(--twin-faint)">
        {resumen.medido} {unidad}
      </Mono>
      <Mono size={14} weight={800} style={{ width: 52, textAlign: 'right' }}>
        {fmtClock(resumen.duracionS)}
      </Mono>
    </div>
  );
}
